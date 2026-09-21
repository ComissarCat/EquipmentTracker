using EquipmentTracker.Api.Data;
using EquipmentTracker.Api.Dto;
using EquipmentTracker.Api.Models;
using EquipmentTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EquipmentTracker.Api.Controllers;

[ApiController]
[Route("api/equipment-types")]
public class EquipmentTypesController : ControllerBase
{
    private readonly AppDbContext _db;

    public EquipmentTypesController(AppDbContext db, CurrentUserService currentUser)
    {
        _db = db;
        _db.CurrentAccountId = currentUser.AccountId;
        _db.CurrentAccountLogin = currentUser.Login;
    }

    [AllowAnonymous]
    [HttpGet]
    public async Task<ActionResult<List<EquipmentTypeDto>>> GetAll()
    {
        var types = await _db.EquipmentTypes.OrderBy(t => t.Name).ToListAsync();
        return types.Select(t => new EquipmentTypeDto(t.Id, t.Name)).ToList();
    }

    [Authorize(Policy = "Operator")]
    [HttpPost]
    public async Task<ActionResult<EquipmentTypeDto>> Create(CreateEquipmentTypeRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest(new { message = "Название обязательно" });

        if (await _db.EquipmentTypes.AnyAsync(t => t.Name == request.Name))
            return Conflict(new { message = "Тип техники с таким названием уже существует" });

        var type = new EquipmentType { Name = request.Name };
        _db.EquipmentTypes.Add(type);
        await _db.SaveChangesAsync();
        return Ok(new EquipmentTypeDto(type.Id, type.Name));
    }

    [Authorize(Policy = "Operator")]
    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, UpdateEquipmentTypeRequest request)
    {
        var type = await _db.EquipmentTypes.FindAsync(id);
        if (type is null) return NotFound();

        if (await _db.EquipmentTypes.AnyAsync(t => t.Name == request.Name && t.Id != id))
            return Conflict(new { message = "Тип техники с таким названием уже существует" });

        type.Name = request.Name;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [Authorize(Policy = "Operator")]
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var type = await _db.EquipmentTypes.FindAsync(id);
        if (type is null) return NotFound();

        if (await _db.EquipmentNames.AnyAsync(n => n.EquipmentTypeId == id))
            return BadRequest(new { message = "Нельзя удалить тип, у которого есть наименования техники" });

        _db.EquipmentTypes.Remove(type);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
