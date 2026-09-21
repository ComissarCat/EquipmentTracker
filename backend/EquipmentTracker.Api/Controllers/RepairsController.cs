using EquipmentTracker.Api.Data;
using EquipmentTracker.Api.Dto;
using EquipmentTracker.Api.Models;
using EquipmentTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EquipmentTracker.Api.Controllers;

// История ремонтов единицы техники и фиксация нового ремонта.
// Фиксация списывает израсходованные части со склада; наличие намеренно НЕ проверяется —
// остаток может уйти в минус (так задумано). Изменения остатков попадают в историю
// редактирования автоматически (SparePart в AppDbContext.TrackedTypes).
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
            .Include(r => r.Parts).ThenInclude(p => p.SparePart)
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

        // Одну и ту же часть, указанную несколько раз, объединяем в одну строку
        var partRequests = request.Parts ?? new();
        if (partRequests.Any(p => p.Quantity <= 0))
            return BadRequest(new { message = "Количество расходной части должно быть больше нуля" });
        var partTotals = partRequests
            .GroupBy(p => p.SparePartId)
            .ToDictionary(g => g.Key, g => g.Sum(p => (long)p.Quantity));

        if (operationIds.Count == 0)
            return BadRequest(new { message = "Укажите хотя бы одну ремонтную операцию" });

        var operations = await _db.RepairOperations.Where(o => operationIds.Contains(o.Id)).ToListAsync();
        if (operations.Count != operationIds.Count)
            return BadRequest(new { message = "Одна из ремонтных операций не найдена" });

        var partIds = partTotals.Keys.ToList();
        var parts = await _db.SpareParts.Where(p => partIds.Contains(p.Id)).ToListAsync();
        if (parts.Count != partIds.Count)
            return BadRequest(new { message = "Одна из расходных частей не найдена" });

        foreach (var part in parts)
        {
            var total = partTotals[part.Id];
            if (total > int.MaxValue || part.Quantity - total < int.MinValue)
                return BadRequest(new { message = $"Слишком большое количество для «{part.Name}»" });
        }

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
        foreach (var part in parts)
        {
            var qty = (int)partTotals[part.Id];
            repair.Parts.Add(new RepairPartItem { SparePart = part, Quantity = qty });
            part.Quantity -= qty; // без проверки наличия: отрицательный остаток допустим
        }

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
        r.Parts.Select(p => new RepairPartDto(p.SparePartId, p.SparePart.Name, p.Quantity))
            .OrderBy(p => p.Name).ToList());
}
