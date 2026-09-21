using EquipmentTracker.Api.Data;
using EquipmentTracker.Api.Dto;
using EquipmentTracker.Api.Models;
using EquipmentTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EquipmentTracker.Api.Controllers;

[ApiController]
[Route("api/equipment-names")]
public class EquipmentNamesController : ControllerBase
{
    private readonly AppDbContext _db;

    public EquipmentNamesController(AppDbContext db, CurrentUserService currentUser)
    {
        _db = db;
        _db.CurrentAccountId = currentUser.AccountId;
        _db.CurrentAccountLogin = currentUser.Login;
    }

    [HttpGet]
    public async Task<ActionResult<List<EquipmentNameDto>>> GetAll()
    {
        var names = await _db.EquipmentNames.Include(n => n.EquipmentType)
            .OrderBy(n => n.EquipmentType.Name).ThenBy(n => n.Name)
            .ToListAsync();
        return names.Select(ToDto).ToList();
    }

    [Authorize(Policy = "Operator")]
    [HttpPost]
    public async Task<ActionResult<EquipmentNameDto>> Create(CreateEquipmentNameRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest(new { message = "Название обязательно" });

        var type = await _db.EquipmentTypes.FindAsync(request.EquipmentTypeId);
        if (type is null) return BadRequest(new { message = "Тип техники не найден" });

        if (await _db.EquipmentNames.AnyAsync(n => n.Name == request.Name))
            return Conflict(new { message = "Наименование техники с таким названием уже существует" });

        var name = new EquipmentName { Name = request.Name, EquipmentTypeId = request.EquipmentTypeId };
        _db.EquipmentNames.Add(name);
        await _db.SaveChangesAsync();
        return Ok(new EquipmentNameDto(name.Id, name.Name, type.Id, type.Name));
    }

    [Authorize(Policy = "Operator")]
    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, UpdateEquipmentNameRequest request)
    {
        var name = await _db.EquipmentNames.FindAsync(id);
        if (name is null) return NotFound();

        if (!await _db.EquipmentTypes.AnyAsync(t => t.Id == request.EquipmentTypeId))
            return BadRequest(new { message = "Тип техники не найден" });

        if (await _db.EquipmentNames.AnyAsync(n => n.Name == request.Name && n.Id != id))
            return Conflict(new { message = "Наименование техники с таким названием уже существует" });

        name.Name = request.Name;
        name.EquipmentTypeId = request.EquipmentTypeId;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [Authorize(Policy = "Operator")]
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var name = await _db.EquipmentNames.FindAsync(id);
        if (name is null) return NotFound();

        if (await _db.EquipmentUnits.AnyAsync(u => u.EquipmentNameId == id))
            return BadRequest(new { message = "Нельзя удалить наименование, по которому числится техника" });

        _db.EquipmentNames.Remove(name);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private static EquipmentNameDto ToDto(EquipmentName n) =>
        new(n.Id, n.Name, n.EquipmentTypeId, n.EquipmentType.Name);
}
