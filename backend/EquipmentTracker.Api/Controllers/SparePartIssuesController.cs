using EquipmentTracker.Api.Data;
using EquipmentTracker.Api.Dto;
using EquipmentTracker.Api.Models;
using EquipmentTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EquipmentTracker.Api.Controllers;

// Выдача расходных частей, не связанных с ремонтом (например, компакт-диски).
// Списание идёт по тем же правилам, что и при ремонте (SparePartWriteOffs): в одной транзакции,
// без проверки наличия. Просмотр выдач — через историю списаний (SparePartWriteOffsController).
// Администратор может получить, изменить (дата, получатель, части) и удалить выдачу целиком;
// остатки при этом корректируются на разницу.
[ApiController]
[Route("api/spare-part-issues")]
public class SparePartIssuesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly CurrentUserService _currentUser;

    public SparePartIssuesController(AppDbContext db, CurrentUserService currentUser)
    {
        _db = db;
        _currentUser = currentUser;
        _db.CurrentAccountId = currentUser.AccountId;
        _db.CurrentAccountLogin = currentUser.Login;
    }

    [Authorize(Policy = "Operator")]
    [HttpPost]
    public async Task<ActionResult<SparePartIssueDto>> Create(CreateSparePartIssueRequest request)
    {
        var recipient = request.Recipient?.Trim();
        if (string.IsNullOrWhiteSpace(recipient))
            return BadRequest(new { message = "Укажите, кому выдано" });

        if (request.Parts is null || request.Parts.Count == 0)
            return BadRequest(new { message = "Укажите хотя бы одну выдаваемую расходную часть" });

        var (writeOffs, error) = await SparePartWriteOffs.PrepareAsync(_db, request.Parts);
        if (error is not null)
            return BadRequest(new { message = error });

        var issue = new SparePartIssue
        {
            Date = request.Date ?? DateOnly.FromDateTime(DateTime.UtcNow),
            Recipient = recipient,
            AccountId = _currentUser.AccountId,
            AccountLogin = _currentUser.Login,
            CreatedUtc = DateTime.UtcNow
        };
        SparePartWriteOffs.Apply(issue.WriteOffs, writeOffs);

        _db.SparePartIssues.Add(issue);
        await _db.SaveChangesAsync(); // выдача и списание — одной транзакцией

        return Ok(ToDto(issue));
    }

    [Authorize(Policy = "Administrator")]
    [HttpGet("{id:int}")]
    public async Task<ActionResult<SparePartIssueDto>> GetById(int id)
    {
        var issue = await _db.SparePartIssues
            .AsNoTracking()
            .Include(i => i.WriteOffs).ThenInclude(w => w.SparePart)
            .FirstOrDefaultAsync(i => i.Id == id);
        if (issue is null) return NotFound();
        return ToDto(issue);
    }

    // Тело — как при создании; части заменяются целиком, остатки меняются на разницу «было − стало».
    // Автор и время создания не меняются; фиксируется, кто и когда изменил.
    [Authorize(Policy = "Administrator")]
    [HttpPut("{id:int}")]
    public async Task<ActionResult<SparePartIssueDto>> Update(int id, CreateSparePartIssueRequest request)
    {
        var issue = await LoadFullAsync(id);
        if (issue is null) return NotFound();

        var recipient = request.Recipient?.Trim();
        if (string.IsNullOrWhiteSpace(recipient))
            return BadRequest(new { message = "Укажите, кому выдано" });

        if (request.Parts is null || request.Parts.Count == 0)
            return BadRequest(new { message = "Укажите хотя бы одну выдаваемую расходную часть (чтобы убрать выдачу целиком, удалите её)" });

        var error = await SparePartWriteOffs.ReplaceAsync(_db, issue.WriteOffs, request.Parts);
        if (error is not null)
            return BadRequest(new { message = error });

        issue.Date = request.Date ?? issue.Date;
        issue.Recipient = recipient;
        issue.ModifiedUtc = DateTime.UtcNow;
        issue.ModifiedByLogin = _currentUser.Login;

        await _db.SaveChangesAsync();
        return Ok(ToDto(issue));
    }

    // Удаление выдачи: всё выданное возвращается на склад.
    [Authorize(Policy = "Administrator")]
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var issue = await LoadFullAsync(id);
        if (issue is null) return NotFound();

        var error = SparePartWriteOffs.ReturnAll(_db, issue.WriteOffs);
        if (error is not null)
            return BadRequest(new { message = error });

        _db.SparePartIssues.Remove(issue);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private Task<SparePartIssue?> LoadFullAsync(int id) => _db.SparePartIssues
        .Include(i => i.WriteOffs).ThenInclude(w => w.SparePart)
        .FirstOrDefaultAsync(i => i.Id == id);

    private static SparePartIssueDto ToDto(SparePartIssue i) => new(
        i.Id,
        i.Date,
        i.Recipient,
        i.AccountLogin,
        i.CreatedUtc,
        i.ModifiedUtc,
        i.ModifiedByLogin,
        i.WriteOffs.Select(w => new WriteOffPartDto(w.SparePartId, w.SparePart.Name, w.Quantity))
            .OrderBy(p => p.Name).ToList());
}
