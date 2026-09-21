using EquipmentTracker.Api.Data;
using EquipmentTracker.Api.Dto;
using EquipmentTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EquipmentTracker.Api.Controllers;

// История списаний расходных частей — и через ремонты, и через выдачи (одна таблица).
// Новые сверху. Фильтры: часть, вид основания, период дат; постраничная выдача.
// Администратор может изменить строку (часть/количество) или отменить её: разница возвращается
// на склад (отмена = вернуть всё списанное). Отрицательное/нулевое количество в правке запрещено.
[ApiController]
[Route("api/spare-part-write-offs")]
[Authorize(Policy = "Viewer")]
public class SparePartWriteOffsController : ControllerBase
{
    private readonly AppDbContext _db;

    public SparePartWriteOffsController(AppDbContext db, CurrentUserService currentUser)
    {
        _db = db;
        // Изменения остатков при правке/отмене попадают в историю редактирования с логином администратора
        _db.CurrentAccountId = currentUser.AccountId;
        _db.CurrentAccountLogin = currentUser.Login;
    }

    [HttpGet]
    public async Task<ActionResult<List<SparePartWriteOffDto>>> GetAll(
        [FromQuery] int? sparePartId,
        [FromQuery] string? kind, // "Repair" | "Issue"
        [FromQuery] DateOnly? from,
        [FromQuery] DateOnly? to,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 100)
    {
        pageSize = Math.Clamp(pageSize, 1, 500);
        page = Math.Max(page, 1);

        var query = _db.SparePartWriteOffs.AsNoTracking().AsQueryable();
        if (sparePartId is not null)
            query = query.Where(w => w.SparePartId == sparePartId);
        if (kind == "Repair")
            query = query.Where(w => w.RepairId != null);
        else if (kind == "Issue")
            query = query.Where(w => w.IssueId != null);

        var rows = query.Select(w => new
        {
            w.Id,
            Date = w.Repair != null ? w.Repair.Date : w.Issue!.Date,
            IsRepair = w.RepairId != null,
            w.SparePartId,
            SparePartName = w.SparePart.Name,
            w.Quantity,
            AccountLogin = w.Repair != null ? w.Repair.AccountLogin : w.Issue!.AccountLogin,
            CreatedUtc = w.Repair != null ? w.Repair.CreatedUtc : w.Issue!.CreatedUtc,
            Recipient = w.Issue != null ? w.Issue.Recipient : null,
            w.RepairId,
            EquipmentUnitId = w.Repair != null ? (int?)w.Repair.EquipmentUnitId : null,
            UnitName = w.Repair != null ? w.Repair.EquipmentUnit.EquipmentName.Name : null,
            UnitType = w.Repair != null ? w.Repair.EquipmentUnit.EquipmentName.EquipmentType.Name : null,
            UnitSerial = w.Repair != null ? w.Repair.EquipmentUnit.SerialNumber : null
        });

        if (from is not null) rows = rows.Where(r => r.Date >= from);
        if (to is not null) rows = rows.Where(r => r.Date <= to);

        var page_ = await rows
            .OrderByDescending(r => r.Date).ThenByDescending(r => r.CreatedUtc).ThenByDescending(r => r.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return page_.Select(r => new SparePartWriteOffDto(
            r.Id,
            r.Date,
            r.IsRepair ? "Repair" : "Issue",
            r.SparePartId,
            r.SparePartName,
            r.Quantity,
            r.AccountLogin,
            r.CreatedUtc,
            r.Recipient,
            r.RepairId,
            r.EquipmentUnitId,
            r.IsRepair ? $"{r.UnitType} {r.UnitName}, S/N {r.UnitSerial}" : null)).ToList();
    }

    [Authorize(Policy = "Administrator")]
    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, UpdateSparePartWriteOffRequest request)
    {
        if (request.Quantity <= 0)
            return BadRequest(new { message = "Количество должно быть больше нуля (чтобы убрать списание, отмените его)" });

        var writeOff = await _db.SparePartWriteOffs.Include(w => w.SparePart).FirstOrDefaultAsync(w => w.Id == id);
        if (writeOff is null) return NotFound();

        var oldPart = writeOff.SparePart;
        var oldQuantity = writeOff.Quantity;

        if (request.SparePartId == oldPart.Id)
        {
            // Та же часть: разницу (старое − новое) прибавляем к остатку
            var newStock = (long)oldPart.Quantity + oldQuantity - request.Quantity;
            if (newStock is > int.MaxValue or < int.MinValue)
                return BadRequest(new { message = "Слишком большое количество" });

            oldPart.Quantity = (int)newStock;
            writeOff.Quantity = request.Quantity;
        }
        else
        {
            var newPart = await _db.SpareParts.FindAsync(request.SparePartId);
            if (newPart is null)
                return BadRequest(new { message = "Расходная часть не найдена" });

            // В одном ремонте/выдаче одна и та же часть должна быть одной строкой
            var duplicate = await _db.SparePartWriteOffs.AnyAsync(w =>
                w.Id != id && w.SparePartId == newPart.Id &&
                ((writeOff.RepairId != null && w.RepairId == writeOff.RepairId) ||
                 (writeOff.IssueId != null && w.IssueId == writeOff.IssueId)));
            if (duplicate)
                return BadRequest(new { message = $"«{newPart.Name}» уже есть в этом списании — измените её количество" });

            var oldStock = (long)oldPart.Quantity + oldQuantity;
            var newStock = (long)newPart.Quantity - request.Quantity;
            if (oldStock > int.MaxValue || newStock < int.MinValue)
                return BadRequest(new { message = "Слишком большое количество" });

            oldPart.Quantity = (int)oldStock;      // старой части возвращаем всё списанное
            newPart.Quantity = (int)newStock;      // новую списываем
            writeOff.SparePartId = newPart.Id;
            writeOff.Quantity = request.Quantity;
        }

        await _db.SaveChangesAsync();
        return NoContent();
    }

    // Отмена списания: строка удаляется, списанное количество возвращается на склад.
    // Выдача, в которой не осталось ни одной строки, удаляется целиком (ремонт остаётся —
    // у него есть операции).
    [Authorize(Policy = "Administrator")]
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Cancel(int id)
    {
        var writeOff = await _db.SparePartWriteOffs.Include(w => w.SparePart).FirstOrDefaultAsync(w => w.Id == id);
        if (writeOff is null) return NotFound();

        var stock = (long)writeOff.SparePart.Quantity + writeOff.Quantity;
        if (stock > int.MaxValue)
            return BadRequest(new { message = "Слишком большое итоговое количество на складе" });

        writeOff.SparePart.Quantity = (int)stock;
        _db.SparePartWriteOffs.Remove(writeOff);

        if (writeOff.IssueId is int issueId &&
            !await _db.SparePartWriteOffs.AnyAsync(w => w.IssueId == issueId && w.Id != id))
        {
            var issue = await _db.SparePartIssues.FindAsync(issueId);
            if (issue is not null) _db.SparePartIssues.Remove(issue);
        }

        await _db.SaveChangesAsync();
        return NoContent();
    }
}
