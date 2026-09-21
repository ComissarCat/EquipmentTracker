using EquipmentTracker.Api.Data;
using EquipmentTracker.Api.Dto;
using EquipmentTracker.Api.Models;
using EquipmentTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EquipmentTracker.Api.Controllers;

// История ремонтов единицы техники и фиксация нового ремонта.
// Фиксация списывает израсходованные части со склада (см. SparePartWriteOffs); наличие
// намеренно НЕ проверяется — остаток может уйти в минус (так задумано). Изменения остатков
// попадают в историю редактирования автоматически (SparePart в AppDbContext.TrackedTypes).
// Администратор может изменить или удалить ремонт: остатки корректируются на разницу.
[ApiController]
[Route("api/equipment-units/{unitId:int}/repairs")]
public class RepairsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly CurrentUserService _currentUser;

    public RepairsController(AppDbContext db, CurrentUserService currentUser)
    {
        _db = db;
        _currentUser = currentUser;
        _db.CurrentAccountId = currentUser.AccountId;
        _db.CurrentAccountLogin = currentUser.Login;
    }

    [Authorize]
    [HttpGet]
    public async Task<ActionResult<List<RepairDto>>> GetAll(int unitId)
    {
        if (!await _db.EquipmentUnits.AnyAsync(u => u.Id == unitId)) return NotFound();

        var repairs = await _db.Repairs
            .AsNoTracking()
            .Where(r => r.EquipmentUnitId == unitId)
            .Include(r => r.Operations).ThenInclude(o => o.RepairOperation)
            .Include(r => r.WriteOffs).ThenInclude(w => w.SparePart)
            .OrderByDescending(r => r.Date).ThenByDescending(r => r.Id)
            .ToListAsync();

        return repairs.Select(ToDto).ToList();
    }

    [Authorize(Policy = "Operator")]
    [HttpPost]
    public async Task<ActionResult<RepairDto>> Create(int unitId, CreateRepairRequest request)
    {
        if (!await _db.EquipmentUnits.AnyAsync(u => u.Id == unitId))
            return NotFound();

        var note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim();
        var operationIds = (request.OperationIds ?? new()).Distinct().ToList();

        if (operationIds.Count == 0)
            return BadRequest(new { message = "Укажите хотя бы одну ремонтную операцию" });

        var operations = await _db.RepairOperations.Where(o => operationIds.Contains(o.Id)).ToListAsync();
        if (operations.Count != operationIds.Count)
            return BadRequest(new { message = "Одна из ремонтных операций не найдена" });

        var (writeOffs, error) = await SparePartWriteOffs.PrepareAsync(_db, request.Parts);
        if (error is not null)
            return BadRequest(new { message = error });

        var repair = new Repair
        {
            EquipmentUnitId = unitId,
            Date = request.Date ?? DateOnly.FromDateTime(DateTime.UtcNow),
            Note = note,
            AccountId = _currentUser.AccountId,
            AccountLogin = _currentUser.Login,
            CreatedUtc = DateTime.UtcNow
        };
        foreach (var op in operations)
            repair.Operations.Add(new RepairOperationItem { RepairOperation = op });
        SparePartWriteOffs.Apply(repair.WriteOffs, writeOffs);

        _db.Repairs.Add(repair);
        await _db.SaveChangesAsync(); // ремонт и списание — одной транзакцией

        return Ok(ToDto(repair));
    }

    // Изменение ремонта администратором: дата, операции, примечание и части заменяются целиком
    // (тело — как при создании). Остатки частей меняются на разницу «было − стало». Автор и время
    // создания не меняются; фиксируется, кто и когда изменил.
    [Authorize(Policy = "Administrator")]
    [HttpPut("{id:int}")]
    public async Task<ActionResult<RepairDto>> Update(int unitId, int id, CreateRepairRequest request)
    {
        var repair = await LoadFullAsync(unitId, id);
        if (repair is null) return NotFound();

        var operationIds = (request.OperationIds ?? new()).Distinct().ToList();
        if (operationIds.Count == 0)
            return BadRequest(new { message = "Укажите хотя бы одну ремонтную операцию" });

        var operations = await _db.RepairOperations.Where(o => operationIds.Contains(o.Id)).ToListAsync();
        if (operations.Count != operationIds.Count)
            return BadRequest(new { message = "Одна из ремонтных операций не найдена" });

        var error = await SparePartWriteOffs.ReplaceAsync(_db, repair.WriteOffs, request.Parts);
        if (error is not null)
            return BadRequest(new { message = error });

        foreach (var item in repair.Operations.Where(i => !operationIds.Contains(i.RepairOperationId)).ToList())
        {
            repair.Operations.Remove(item);
            _db.Set<RepairOperationItem>().Remove(item);
        }
        var existingOps = repair.Operations.Select(i => i.RepairOperationId).ToHashSet();
        foreach (var op in operations.Where(o => !existingOps.Contains(o.Id)))
            repair.Operations.Add(new RepairOperationItem { RepairOperation = op });

        repair.Date = request.Date ?? repair.Date;
        repair.Note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim();
        repair.ModifiedUtc = DateTime.UtcNow;
        repair.ModifiedByLogin = _currentUser.Login;

        await _db.SaveChangesAsync(); // ремонт и корректировка остатков — одной транзакцией
        return Ok(ToDto(repair));
    }

    // Удаление ремонта администратором: все списанные им части возвращаются на склад.
    [Authorize(Policy = "Administrator")]
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int unitId, int id)
    {
        var repair = await LoadFullAsync(unitId, id);
        if (repair is null) return NotFound();

        var error = SparePartWriteOffs.ReturnAll(_db, repair.WriteOffs);
        if (error is not null)
            return BadRequest(new { message = error });

        _db.Repairs.Remove(repair);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private Task<Repair?> LoadFullAsync(int unitId, int id) => _db.Repairs
        .Include(r => r.Operations).ThenInclude(o => o.RepairOperation)
        .Include(r => r.WriteOffs).ThenInclude(w => w.SparePart)
        .FirstOrDefaultAsync(r => r.Id == id && r.EquipmentUnitId == unitId);

    private static RepairDto ToDto(Repair r) => new(
        r.Id,
        r.Date,
        r.Note,
        r.AccountLogin,
        r.CreatedUtc,
        r.ModifiedUtc,
        r.ModifiedByLogin,
        r.Operations.Select(o => new RepairOperationDto(o.RepairOperationId, o.RepairOperation.Name))
            .OrderBy(o => o.Name).ToList(),
        r.WriteOffs.Select(w => new WriteOffPartDto(w.SparePartId, w.SparePart.Name, w.Quantity))
            .OrderBy(p => p.Name).ToList());
}
