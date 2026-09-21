using EquipmentTracker.Api.Data;
using EquipmentTracker.Api.Dto;
using EquipmentTracker.Api.Models;
using EquipmentTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EquipmentTracker.Api.Controllers;

[ApiController]
[Route("api/equipment-units")]
public class EquipmentUnitsController : ControllerBase
{
    private readonly AppDbContext _db;

    public EquipmentUnitsController(AppDbContext db, CurrentUserService currentUser)
    {
        _db = db;
        _db.CurrentAccountId = currentUser.AccountId;
        _db.CurrentAccountLogin = currentUser.Login;
    }

    // Просмотр всего списка техники (используется для построения дерева на главной странице)
    [HttpGet]
    public async Task<ActionResult<List<EquipmentUnitDto>>> GetAll()
    {
        var units = await _db.EquipmentUnits
            .Include(u => u.EquipmentName).ThenInclude(n => n.EquipmentType)
            .OrderBy(u => u.SerialNumber)
            .ToListAsync();
        return units.Select(ToDto).ToList();
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<EquipmentUnitDto>> GetById(int id)
    {
        var unit = await _db.EquipmentUnits
            .Include(u => u.EquipmentName).ThenInclude(n => n.EquipmentType)
            .FirstOrDefaultAsync(u => u.Id == id);
        if (unit is null) return NotFound();
        return ToDto(unit);
    }

    [Authorize(Policy = "Operator")]
    [HttpPost]
    public async Task<ActionResult<EquipmentUnitDto>> Create(CreateEquipmentUnitRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.SerialNumber))
            return BadRequest(new { message = "Серийный номер обязателен" });

        var equipmentName = await _db.EquipmentNames.Include(n => n.EquipmentType)
            .FirstOrDefaultAsync(n => n.Id == request.EquipmentNameId);
        if (equipmentName is null) return BadRequest(new { message = "Наименование техники не найдено" });

        if (!await _db.Locations.AnyAsync(l => l.Id == request.LocationId))
            return BadRequest(new { message = "Локация не найдена" });

        if (await _db.EquipmentUnits.AnyAsync(u => u.SerialNumber == request.SerialNumber))
            return Conflict(new { message = "Единица техники с таким серийным номером уже существует" });

        var unit = new EquipmentUnit
        {
            EquipmentNameId = request.EquipmentNameId,
            SerialNumber = request.SerialNumber,
            InventoryNumber = request.InventoryNumber,
            Note = request.Note,
            LocationId = request.LocationId
        };
        _db.EquipmentUnits.Add(unit);
        await _db.SaveChangesAsync();

        unit.EquipmentName = equipmentName;
        return CreatedAtAction(nameof(GetById), new { id = unit.Id }, ToDto(unit));
    }

    [Authorize(Policy = "Operator")]
    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, UpdateEquipmentUnitRequest request)
    {
        var unit = await _db.EquipmentUnits.FindAsync(id);
        if (unit is null) return NotFound();

        if (!await _db.EquipmentNames.AnyAsync(n => n.Id == request.EquipmentNameId))
            return BadRequest(new { message = "Наименование техники не найдено" });

        if (!await _db.Locations.AnyAsync(l => l.Id == request.LocationId))
            return BadRequest(new { message = "Локация не найдена" });

        if (await _db.EquipmentUnits.AnyAsync(u => u.SerialNumber == request.SerialNumber && u.Id != id))
            return Conflict(new { message = "Единица техники с таким серийным номером уже существует" });

        unit.EquipmentNameId = request.EquipmentNameId;
        unit.SerialNumber = request.SerialNumber;
        unit.InventoryNumber = request.InventoryNumber;
        unit.Note = request.Note;
        unit.LocationId = request.LocationId;

        await _db.SaveChangesAsync();
        return NoContent();
    }

    // Перемещение единицы техники в другую локацию (drag-and-drop / кнопки на главной странице)
    [Authorize(Policy = "Operator")]
    [HttpPost("{id:int}/move")]
    public async Task<IActionResult> Move(int id, MoveEquipmentUnitRequest request)
    {
        var unit = await _db.EquipmentUnits.FindAsync(id);
        if (unit is null) return NotFound();

        if (!await _db.Locations.AnyAsync(l => l.Id == request.NewLocationId))
            return BadRequest(new { message = "Целевая локация не найдена" });

        unit.LocationId = request.NewLocationId;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [Authorize(Policy = "Operator")]
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var unit = await _db.EquipmentUnits.FindAsync(id);
        if (unit is null) return NotFound();

        _db.EquipmentUnits.Remove(unit);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private static EquipmentUnitDto ToDto(EquipmentUnit u) => new(
        u.Id,
        u.EquipmentNameId,
        u.EquipmentName.Name,
        u.EquipmentName.EquipmentType.Name,
        u.SerialNumber,
        u.InventoryNumber,
        u.Note,
        u.LocationId);
}
