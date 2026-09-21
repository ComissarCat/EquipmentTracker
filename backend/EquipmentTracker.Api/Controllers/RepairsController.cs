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

    private static RepairDto ToDto(Repair r) => new(
        r.Id,
        r.Date,
        r.Note,
        r.AccountLogin,
        r.CreatedUtc,
        r.Operations.Select(o => new RepairOperationDto(o.RepairOperationId, o.RepairOperation.Name))
            .OrderBy(o => o.Name).ToList(),
        r.WriteOffs.Select(w => new WriteOffPartDto(w.SparePartId, w.SparePart.Name, w.Quantity))
            .OrderBy(p => p.Name).ToList());
}
