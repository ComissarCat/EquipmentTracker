using EquipmentTracker.Api.Data;
using EquipmentTracker.Api.Dto;
using EquipmentTracker.Api.Models;
using EquipmentTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EquipmentTracker.Api.Controllers;

[ApiController]
[Route("api/locations")]
public class LocationsController : ControllerBase
{
    private readonly AppDbContext _db;

    public LocationsController(AppDbContext db, CurrentUserService currentUser)
    {
        _db = db;
        _db.CurrentAccountId = currentUser.AccountId;
        _db.CurrentAccountLogin = currentUser.Login;
    }

    // Просмотр списка локаций доступен без авторизации
    [AllowAnonymous]
    [HttpGet]
    public async Task<ActionResult<List<LocationDto>>> GetAll()
    {
        var locations = await _db.Locations.OrderBy(l => l.Name).ToListAsync();
        return locations.Select(ToDto).ToList();
    }

    [AllowAnonymous]
    [HttpGet("{id:int}")]
    public async Task<ActionResult<LocationDto>> GetById(int id)
    {
        var location = await _db.Locations.FindAsync(id);
        if (location is null) return NotFound();
        return ToDto(location);
    }

    [Authorize(Policy = "Operator")]
    [HttpPost]
    public async Task<ActionResult<LocationDto>> Create(CreateLocationRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest(new { message = "Название обязательно" });

        if (request.ParentLocationId is not null &&
            !await _db.Locations.AnyAsync(l => l.Id == request.ParentLocationId))
            return BadRequest(new { message = "Родительская локация не найдена" });

        var location = new Location { Name = request.Name, ParentLocationId = request.ParentLocationId };
        _db.Locations.Add(location);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = location.Id }, ToDto(location));
    }

    [Authorize(Policy = "Operator")]
    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, UpdateLocationRequest request)
    {
        var location = await _db.Locations.FindAsync(id);
        if (location is null) return NotFound();

        if (request.ParentLocationId == id)
            return BadRequest(new { message = "Локация не может быть родителем самой себя" });

        if (request.ParentLocationId is not null && await WouldCreateCycleAsync(id, request.ParentLocationId.Value))
            return BadRequest(new { message = "Такое перемещение создаст цикл в дереве локаций" });

        location.Name = request.Name;
        location.ParentLocationId = request.ParentLocationId;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // Отдельный эндпоинт для перемещения (используется UI с drag-and-drop / кнопками "переместить")
    [Authorize(Policy = "Operator")]
    [HttpPost("{id:int}/move")]
    public async Task<IActionResult> Move(int id, MoveLocationRequest request)
    {
        var location = await _db.Locations.FindAsync(id);
        if (location is null) return NotFound();

        if (request.NewParentLocationId == id)
            return BadRequest(new { message = "Локация не может быть родителем самой себя" });

        if (request.NewParentLocationId is not null &&
            !await _db.Locations.AnyAsync(l => l.Id == request.NewParentLocationId))
            return BadRequest(new { message = "Целевая локация не найдена" });

        if (request.NewParentLocationId is not null && await WouldCreateCycleAsync(id, request.NewParentLocationId.Value))
            return BadRequest(new { message = "Такое перемещение создаст цикл в дереве локаций" });

        location.ParentLocationId = request.NewParentLocationId;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [Authorize(Policy = "Operator")]
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var location = await _db.Locations.FindAsync(id);
        if (location is null) return NotFound();

        if (await _db.Locations.AnyAsync(l => l.ParentLocationId == id))
            return BadRequest(new { message = "Нельзя удалить локацию с дочерними локациями" });

        if (await _db.EquipmentUnits.AnyAsync(u => u.LocationId == id))
            return BadRequest(new { message = "Нельзя удалить локацию, в которой числится техника" });

        _db.Locations.Remove(location);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // Проверяет, что newParentId не находится в поддереве locationId (иначе получится цикл)
    private async Task<bool> WouldCreateCycleAsync(int locationId, int newParentId)
    {
        var current = await _db.Locations.FindAsync(newParentId);
        while (current is not null)
        {
            if (current.Id == locationId) return true;
            current = current.ParentLocationId is null
                ? null
                : await _db.Locations.FindAsync(current.ParentLocationId);
        }
        return false;
    }

    private static LocationDto ToDto(Location l) => new(l.Id, l.Name, l.ParentLocationId);
}
