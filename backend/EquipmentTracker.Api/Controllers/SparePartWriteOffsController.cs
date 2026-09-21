using EquipmentTracker.Api.Data;
using EquipmentTracker.Api.Dto;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EquipmentTracker.Api.Controllers;

// История списаний расходных частей — и через ремонты, и через выдачи (одна таблица).
// Новые сверху. Фильтры: часть, вид основания, период дат; постраничная выдача.
[ApiController]
[Route("api/spare-part-write-offs")]
[Authorize(Policy = "Operator")]
public class SparePartWriteOffsController : ControllerBase
{
    private readonly AppDbContext _db;

    public SparePartWriteOffsController(AppDbContext db)
    {
        _db = db;
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
}
