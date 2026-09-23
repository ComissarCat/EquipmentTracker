using EquipmentTracker.Api.Data;
using EquipmentTracker.Api.Dto;
using EquipmentTracker.Api.Models;
using EquipmentTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace EquipmentTracker.Api.Controllers;

// Инвентаризация техники. Просмотр — любая роль; запуск и остановка — Администратор;
// подтверждение данных о технике — Оператор и Администратор («Только чтение» не подтверждает).
// Одновременно идёт не более одной инвентаризации.
[ApiController]
[Route("api/inventories")]
[Authorize(Policy = "Viewer")]
public class InventoriesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly CurrentUserService _currentUser;

    public InventoriesController(AppDbContext db, CurrentUserService currentUser)
    {
        _db = db;
        _currentUser = currentUser;
    }

    // Список инвентаризаций, новые сверху. Для идущей — живые счётчики, для завершённых — итоговые.
    [HttpGet]
    public async Task<ActionResult<List<InventorySummaryDto>>> GetAll()
    {
        var inventories = await _db.Inventories.AsNoTracking().OrderByDescending(i => i.StartedUtc).ToListAsync();

        var result = new List<InventorySummaryDto>();
        foreach (var inv in inventories)
            result.Add(await InventoryQueries.SummaryAsync(_db, inv));
        return result;
    }

    // Идущая инвентаризация и уже подтверждённая в ней техника — для индикации в списках и карточках.
    // Если инвентаризации нет — Inventory = null.
    [HttpGet("active")]
    public async Task<ActionResult<ActiveInventoryDto>> GetActive()
    {
        var inv = await _db.Inventories.AsNoTracking().FirstOrDefaultAsync(i => i.IsActive);
        if (inv is null) return new ActiveInventoryDto(null, new List<InventoryConfirmationDto>());

        var confirmations = await _db.InventoryConfirmations
            .AsNoTracking()
            .Where(c => c.InventoryId == inv.Id)
            .Select(c => new InventoryConfirmationDto(c.EquipmentUnitId, c.ConfirmedUtc, c.ConfirmedByLogin))
            .ToListAsync();

        return new ActiveInventoryDto(await InventoryQueries.SummaryAsync(_db, inv), confirmations);
    }

    // Итоги: сводка + список неподтверждённой техники (для идущей — по живым данным)
    [HttpGet("{id:int}")]
    public async Task<ActionResult<InventoryDetailsDto>> GetById(int id)
    {
        var inv = await _db.Inventories.AsNoTracking().FirstOrDefaultAsync(i => i.Id == id);
        if (inv is null) return NotFound();

        return new InventoryDetailsDto(
            await InventoryQueries.SummaryAsync(_db, inv),
            await InventoryQueries.UnresolvedAsync(_db, inv));
    }

    [Authorize(Policy = "Administrator")]
    [HttpPost]
    public async Task<ActionResult<InventorySummaryDto>> Start()
    {
        if (await _db.Inventories.AnyAsync(i => i.IsActive))
            return Conflict(new { message = "Инвентаризация уже идёт — сначала остановите её" });

        var inv = new Inventory
        {
            StartedUtc = DateTime.UtcNow,
            StartedByAccountId = _currentUser.AccountId,
            StartedByLogin = _currentUser.Login,
            IsActive = true
        };
        _db.Inventories.Add(inv);

        try
        {
            await _db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            // Два администратора нажали «Запустить» одновременно — сработал уникальный индекс
            return Conflict(new { message = "Инвентаризация уже идёт — сначала остановите её" });
        }

        return Ok(await InventoryQueries.SummaryAsync(_db, inv));
    }

    // Остановка: итоги замораживаются (счётчики + снимок неподтверждённой техники), подтверждения
    // и индикация в интерфейсе для этой инвентаризации перестают отображаться.
    [Authorize(Policy = "Administrator")]
    [HttpPost("{id:int}/stop")]
    public async Task<ActionResult<InventorySummaryDto>> Stop(int id)
    {
        // Блокировка строки инвентаризации (FOR UPDATE) дожидается идущих подтверждений (они держат
        // FOR SHARE) и не пускает новые, пока итоги не заморожены — иначе подтверждение, попавшее между
        // подсчётом и сохранением, исказило бы итоги.
        await using var tx = await _db.Database.BeginTransactionAsync();
        var inv = (await _db.Inventories
            .FromSqlInterpolated($"SELECT * FROM \"Inventories\" WHERE \"Id\" = {id} FOR UPDATE")
            .ToListAsync()).FirstOrDefault();
        if (inv is null) return NotFound();
        if (!inv.IsActive)
            return Conflict(new { message = "Эта инвентаризация уже остановлена" });

        var confirmed = await _db.InventoryConfirmations.CountAsync(c => c.InventoryId == inv.Id);
        var unresolved = await InventoryQueries.UnresolvedAsync(_db, inv);
        // «Всего» — из тех же данных, что и список, чтобы итоги сходились со списком неподтверждённой
        // техники, даже если между запросами кто-то добавил единицу техники
        var total = confirmed + unresolved.Count;

        foreach (var u in unresolved)
        {
            inv.UnresolvedUnits.Add(new InventoryUnresolvedUnit
            {
                EquipmentUnitId = u.EquipmentUnitId,
                TypeName = u.TypeName,
                Name = u.Name,
                SerialNumber = u.SerialNumber,
                InventoryNumber = u.InventoryNumber,
                Note = u.Note,
                LocationPath = u.LocationPath
            });
        }

        inv.FinalTotalUnits = total;
        inv.FinalConfirmedUnits = confirmed;
        inv.IsActive = false;
        inv.EndedUtc = DateTime.UtcNow;
        inv.EndedByLogin = _currentUser.Login;

        await _db.SaveChangesAsync();
        await tx.CommitAsync();
        return Ok(InventoryQueries.ToSummary(inv, total, confirmed));
    }

    // Подтверждение данных в идущей инвентаризации: отдельные единицы и/или локации целиком
    // (вся техника в них, включая вложенные локации). Уже подтверждённое пропускается.
    [Authorize(Policy = "Operator")]
    [HttpPost("active/confirm")]
    public async Task<ActionResult<ConfirmInventoryResultDto>> Confirm(ConfirmInventoryRequest request)
    {
        await using var tx = await _db.Database.BeginTransactionAsync();
        var inv = await LockActiveForShareAsync();
        if (inv is null)
            return Conflict(new { message = "Инвентаризация не запущена" });

        var ids = (await ResolveUnitIdsAsync(request)).ToList();
        if (ids.Count == 0)
            return Ok(new ConfirmInventoryResultDto(0));

        var existingUnitIds = await _db.EquipmentUnits.Where(u => ids.Contains(u.Id)).Select(u => u.Id).ToListAsync();
        var alreadyConfirmed = (await _db.InventoryConfirmations
            .Where(c => c.InventoryId == inv.Id && ids.Contains(c.EquipmentUnitId))
            .Select(c => c.EquipmentUnitId)
            .ToListAsync()).ToHashSet();

        var now = DateTime.UtcNow;
        var toAdd = existingUnitIds.Where(id => !alreadyConfirmed.Contains(id)).ToList();
        foreach (var unitId in toAdd)
        {
            _db.InventoryConfirmations.Add(new InventoryConfirmation
            {
                InventoryId = inv.Id,
                EquipmentUnitId = unitId,
                ConfirmedUtc = now,
                ConfirmedByLogin = _currentUser.Login
            });
        }

        await _db.SaveChangesAsync();
        await tx.CommitAsync();
        return Ok(new ConfirmInventoryResultDto(toAdd.Count));
    }

    // Отмена подтверждения (например, подтвердили по ошибке): те же единицы/локации, что и при
    // подтверждении; техника снова считается неподтверждённой. Не подтверждённое пропускается.
    // Только для идущей инвентаризации — итоги остановленной изменить нельзя.
    [Authorize(Policy = "Operator")]
    [HttpPost("active/unconfirm")]
    public async Task<ActionResult<ConfirmInventoryResultDto>> Unconfirm(ConfirmInventoryRequest request)
    {
        await using var tx = await _db.Database.BeginTransactionAsync();
        var inv = await LockActiveForShareAsync();
        if (inv is null)
            return Conflict(new { message = "Инвентаризация не запущена" });

        var ids = (await ResolveUnitIdsAsync(request)).ToList();
        if (ids.Count == 0)
            return Ok(new ConfirmInventoryResultDto(0));

        var toRemove = await _db.InventoryConfirmations
            .Where(c => c.InventoryId == inv.Id && ids.Contains(c.EquipmentUnitId))
            .ToListAsync();
        _db.InventoryConfirmations.RemoveRange(toRemove);

        await _db.SaveChangesAsync();
        await tx.CommitAsync();
        return Ok(new ConfirmInventoryResultDto(toRemove.Count));
    }

    // Идущая инвентаризация с разделяемой блокировкой строки (до конца транзакции): параллельные
    // подтверждения друг другу не мешают, но остановка (FOR UPDATE) ждёт их завершения. Если остановка
    // успела раньше — строка уже не проходит условие IsActive и вернётся null.
    private async Task<Inventory?> LockActiveForShareAsync() =>
        (await _db.Inventories
            .FromSqlRaw("SELECT * FROM \"Inventories\" WHERE \"IsActive\" FOR SHARE")
            .ToListAsync()).FirstOrDefault();

    // Единицы из запроса + вся техника в указанных локациях (включая вложенные)
    private async Task<HashSet<int>> ResolveUnitIdsAsync(ConfirmInventoryRequest request)
    {
        var unitIds = (request.UnitIds ?? new()).ToHashSet();

        if (request.LocationIds is { Count: > 0 })
        {
            var locations = await _db.Locations.AsNoTracking().ToListAsync();
            var locationIds = LocationPaths.Subtree(request.LocationIds, locations);
            var inLocations = await _db.EquipmentUnits
                .Where(u => locationIds.Contains(u.LocationId))
                .Select(u => u.Id)
                .ToListAsync();
            unitIds.UnionWith(inLocations);
        }

        return unitIds;
    }
}
