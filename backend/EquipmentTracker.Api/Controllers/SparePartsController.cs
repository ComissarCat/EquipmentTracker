using EquipmentTracker.Api.Data;
using EquipmentTracker.Api.Dto;
using EquipmentTracker.Api.Models;
using EquipmentTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EquipmentTracker.Api.Controllers;

// Справочник расходных частей с остатками. Правила изменения количества:
//  - Operator: может только увеличить остаток (add-stock, Amount > 0) либо указать
//    начальное количество при создании позиции;
//  - Administrator: может напрямую установить любое количество, в том числе отрицательное (quantity).
// Каждое изменение фиксируется в истории редактирования автоматически (AppDbContext).
[ApiController]
[Route("api/spare-parts")]
public class SparePartsController : ControllerBase
{
    private readonly AppDbContext _db;

    public SparePartsController(AppDbContext db, CurrentUserService currentUser)
    {
        _db = db;
        _db.CurrentAccountId = currentUser.AccountId;
        _db.CurrentAccountLogin = currentUser.Login;
    }

    [HttpGet]
    public async Task<ActionResult<List<SparePartDto>>> GetAll()
    {
        var items = await _db.SpareParts.OrderBy(p => p.Name).ToListAsync();
        return items.Select(ToDto).ToList();
    }

    [Authorize(Policy = "Operator")]
    [HttpPost]
    public async Task<ActionResult<SparePartDto>> Create(CreateSparePartRequest request)
    {
        var name = request.Name?.Trim();
        if (string.IsNullOrWhiteSpace(name))
            return BadRequest(new { message = "Название обязательно" });
        if (request.Quantity < 0)
            return BadRequest(new { message = "Количество не может быть отрицательным" });

        if (await _db.SpareParts.AnyAsync(p => p.Name == name))
            return Conflict(new { message = "Расходная часть с таким названием уже существует" });

        var item = new SparePart { Name = name, Quantity = request.Quantity };
        _db.SpareParts.Add(item);
        await _db.SaveChangesAsync();
        return Ok(ToDto(item));
    }

    // Переименование — доступно оператору; количество этим методом не меняется
    [Authorize(Policy = "Operator")]
    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, UpdateSparePartRequest request)
    {
        var name = request.Name?.Trim();
        if (string.IsNullOrWhiteSpace(name))
            return BadRequest(new { message = "Название обязательно" });

        var item = await _db.SpareParts.FindAsync(id);
        if (item is null) return NotFound();

        if (await _db.SpareParts.AnyAsync(p => p.Name == name && p.Id != id))
            return Conflict(new { message = "Расходная часть с таким названием уже существует" });

        item.Name = name;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [Authorize(Policy = "Operator")]
    [HttpPost("{id:int}/add-stock")]
    public async Task<ActionResult<SparePartDto>> AddStock(int id, AddSparePartStockRequest request)
    {
        if (request.Amount <= 0)
            return BadRequest(new { message = "Количество для добавления должно быть больше нуля" });

        var item = await _db.SpareParts.FindAsync(id);
        if (item is null) return NotFound();

        if ((long)item.Quantity + request.Amount > int.MaxValue)
            return BadRequest(new { message = "Слишком большое итоговое количество" });

        item.Quantity += request.Amount;
        await _db.SaveChangesAsync();
        return Ok(ToDto(item));
    }

    [Authorize(Policy = "Administrator")]
    [HttpPut("{id:int}/quantity")]
    public async Task<ActionResult<SparePartDto>> SetQuantity(int id, SetSparePartQuantityRequest request)
    {
        var item = await _db.SpareParts.FindAsync(id);
        if (item is null) return NotFound();

        item.Quantity = request.Quantity;
        await _db.SaveChangesAsync();
        return Ok(ToDto(item));
    }

    // Удаление позиции стирает остаток, а оператору уменьшать количество нельзя —
    // поэтому удалять может только администратор.
    [Authorize(Policy = "Administrator")]
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var item = await _db.SpareParts.FindAsync(id);
        if (item is null) return NotFound();

        if (await _db.SparePartWriteOffs.AnyAsync(w => w.SparePartId == id))
            return BadRequest(new { message = "Нельзя удалить расходную часть, по которой есть списания (ремонты или выдачи)" });

        _db.SpareParts.Remove(item);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private static SparePartDto ToDto(SparePart p) => new(p.Id, p.Name, p.Quantity);
}
