using EquipmentTracker.Api.Data;
using EquipmentTracker.Api.Dto;
using EquipmentTracker.Api.Models;
using EquipmentTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EquipmentTracker.Api.Controllers;

[ApiController]
[Route("api/repair-operations")]
public class RepairOperationsController : ControllerBase
{
    private readonly AppDbContext _db;

    public RepairOperationsController(AppDbContext db, CurrentUserService currentUser)
    {
        _db = db;
        _db.CurrentAccountId = currentUser.AccountId;
        _db.CurrentAccountLogin = currentUser.Login;
    }

    [AllowAnonymous]
    [HttpGet]
    public async Task<ActionResult<List<RepairOperationDto>>> GetAll()
    {
        var items = await _db.RepairOperations.OrderBy(o => o.Name).ToListAsync();
        return items.Select(o => new RepairOperationDto(o.Id, o.Name)).ToList();
    }

    [Authorize(Policy = "Operator")]
    [HttpPost]
    public async Task<ActionResult<RepairOperationDto>> Create(CreateRepairOperationRequest request)
    {
        var name = request.Name?.Trim();
        if (string.IsNullOrWhiteSpace(name))
            return BadRequest(new { message = "Название обязательно" });

        if (await _db.RepairOperations.AnyAsync(o => o.Name == name))
            return Conflict(new { message = "Ремонтная операция с таким названием уже существует" });

        var item = new RepairOperation { Name = name };
        _db.RepairOperations.Add(item);
        await _db.SaveChangesAsync();
        return Ok(new RepairOperationDto(item.Id, item.Name));
    }

    [Authorize(Policy = "Operator")]
    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, UpdateRepairOperationRequest request)
    {
        var name = request.Name?.Trim();
        if (string.IsNullOrWhiteSpace(name))
            return BadRequest(new { message = "Название обязательно" });

        var item = await _db.RepairOperations.FindAsync(id);
        if (item is null) return NotFound();

        if (await _db.RepairOperations.AnyAsync(o => o.Name == name && o.Id != id))
            return Conflict(new { message = "Ремонтная операция с таким названием уже существует" });

        item.Name = name;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [Authorize(Policy = "Operator")]
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var item = await _db.RepairOperations.FindAsync(id);
        if (item is null) return NotFound();

        if (await _db.Set<RepairOperationItem>().AnyAsync(i => i.RepairOperationId == id))
            return BadRequest(new { message = "Нельзя удалить операцию, которая использована в зафиксированных ремонтах" });

        _db.RepairOperations.Remove(item);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
