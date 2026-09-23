using EquipmentTracker.Api.Data;
using EquipmentTracker.Api.Dto;
using EquipmentTracker.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EquipmentTracker.Api.Controllers;

// Учётные записи редактирует только Администратор. История изменений
// учётных записей намеренно не ведётся (в задании она требуется только
// для локаций/типов/наименований/единиц техники), т.к. хранить хэши
// паролей и старые ФИО в общей истории — плохая практика.
[ApiController]
[Route("api/accounts")]
[Authorize(Policy = "Administrator")]
public class AccountsController : ControllerBase
{
    private readonly AppDbContext _db;

    public AccountsController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<List<AccountDto>>> GetAll()
    {
        var accounts = await _db.Accounts
            .Include(a => a.AccountRoles).ThenInclude(ar => ar.Role)
            .OrderBy(a => a.Login)
            .ToListAsync();

        return accounts.Select(ToDto).ToList();
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<AccountDto>> GetById(int id)
    {
        var account = await _db.Accounts
            .Include(a => a.AccountRoles).ThenInclude(ar => ar.Role)
            .FirstOrDefaultAsync(a => a.Id == id);
        if (account is null) return NotFound();
        return ToDto(account);
    }

    [HttpPost]
    public async Task<ActionResult<AccountDto>> Create(CreateAccountRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Login) || string.IsNullOrWhiteSpace(request.Password))
            return BadRequest(new { message = "Логин и пароль обязательны" });

        if (await _db.Accounts.AnyAsync(a => a.Login == request.Login))
            return Conflict(new { message = "Учётная запись с таким логином уже существует" });

        var roles = await _db.Roles.Where(r => request.Roles.Contains(r.Name)).ToListAsync();

        var account = new Account
        {
            Login = request.Login,
            FullName = request.FullName
        };
        var hasher = new PasswordHasher<Account>();
        account.PasswordHash = hasher.HashPassword(account, request.Password);

        _db.Accounts.Add(account);
        await _db.SaveChangesAsync();

        foreach (var role in roles)
            _db.AccountRoles.Add(new AccountRole { AccountId = account.Id, RoleId = role.Id });
        await _db.SaveChangesAsync();

        account.AccountRoles = roles.Select(r => new AccountRole { AccountId = account.Id, Role = r, RoleId = r.Id }).ToList();
        return CreatedAtAction(nameof(GetById), new { id = account.Id }, ToDto(account));
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, UpdateAccountRequest request)
    {
        var account = await _db.Accounts
            .Include(a => a.AccountRoles).ThenInclude(ar => ar.Role)
            .FirstOrDefaultAsync(a => a.Id == id);
        if (account is null) return NotFound();

        var hadAdminRole = account.AccountRoles.Any(ar => ar.Role.Name == RoleNames.Administrator);
        var willHaveAdminRole = request.Roles.Contains(RoleNames.Administrator);
        if (hadAdminRole && !willHaveAdminRole && await IsLastAdministratorAsync(id))
            return BadRequest(new { message = "Нельзя снять роль Администратора — это единственная оставшаяся учётная запись с этой ролью" });

        account.FullName = request.FullName;

        if (!string.IsNullOrWhiteSpace(request.NewPassword))
        {
            var hasher = new PasswordHasher<Account>();
            account.PasswordHash = hasher.HashPassword(account, request.NewPassword);
            // Новая метка — все выданные ранее токены (в т.ч. утёкшие) перестают действовать
            account.SecurityStamp = Guid.NewGuid().ToString("N");
        }

        var newRoles = await _db.Roles.Where(r => request.Roles.Contains(r.Name)).ToListAsync();
        var newRoleIds = newRoles.Select(r => r.Id).ToHashSet();

        _db.AccountRoles.RemoveRange(account.AccountRoles.Where(ar => !newRoleIds.Contains(ar.RoleId)));
        var existingRoleIds = account.AccountRoles.Select(ar => ar.RoleId).ToHashSet();
        foreach (var role in newRoles.Where(r => !existingRoleIds.Contains(r.Id)))
            _db.AccountRoles.Add(new AccountRole { AccountId = account.Id, RoleId = role.Id });

        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var account = await _db.Accounts.Include(a => a.AccountRoles).ThenInclude(ar => ar.Role)
            .FirstOrDefaultAsync(a => a.Id == id);
        if (account is null) return NotFound();

        // Запрещаем удалить самого себя, чтобы не остаться без доступа к панели администратора
        var currentIdStr = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (!int.TryParse(currentIdStr, out var currentId))
            return Forbid(); // не удалось надёжно определить текущего пользователя — отказываем, а не пропускаем
        if (currentId == id)
            return BadRequest(new { message = "Нельзя удалить собственную учётную запись" });

        // Дополнительная страховка: не даём удалить последнего администратора в системе
        // (даже если это не текущий пользователь — например, администратор удаляет коллегу)
        if (account.AccountRoles.Any(ar => ar.Role.Name == RoleNames.Administrator) && await IsLastAdministratorAsync(id))
            return BadRequest(new { message = "Нельзя удалить последнюю учётную запись с ролью Администратора" });

        _db.Accounts.Remove(account);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // Проверяет, что после исключения excludeAccountId в системе не останется ни одного администратора
    private async Task<bool> IsLastAdministratorAsync(int excludeAccountId)
    {
        var otherAdminsCount = await _db.AccountRoles
            .Where(ar => ar.Role.Name == RoleNames.Administrator && ar.AccountId != excludeAccountId)
            .CountAsync();
        return otherAdminsCount == 0;
    }

    private static AccountDto ToDto(Account a) => new(
        a.Id, a.Login, a.FullName, a.AccountRoles.Select(ar => ar.Role.Name).ToList());
}
