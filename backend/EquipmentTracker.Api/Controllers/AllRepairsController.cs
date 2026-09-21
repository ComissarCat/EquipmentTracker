using EquipmentTracker.Api.Data;
using EquipmentTracker.Api.Dto;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EquipmentTracker.Api.Controllers;

// Общий список всех ремонтов по всей технике (только просмотр). Доступен любой роли, включая
// «Только чтение». Ремонты конкретной единицы — RepairsController.
[ApiController]
[Route("api/repairs")]
[Authorize(Policy = "Viewer")]
public class AllRepairsController : ControllerBase
{
    private const string Escape = @"\"; // символ экранирования в шаблонах ILIKE

    private readonly AppDbContext _db;

    public AllRepairsController(AppDbContext db)
    {
        _db = db;
    }

    // search — слова через пробел; каждое слово должно встретиться (без учёта регистра) хотя бы в одном из:
    // тип/наименование/серийный/инвентарный номер техники, названия операций и расходных частей,
    // примечание, логин того, кто зафиксировал. Даты — включительно. Новые сверху, постранично.
    [HttpGet]
    public async Task<ActionResult<List<RepairListItemDto>>> GetAll(
        [FromQuery] string? search,
        [FromQuery] DateOnly? from,
        [FromQuery] DateOnly? to,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 100)
    {
        pageSize = Math.Clamp(pageSize, 1, 500);
        page = Math.Max(page, 1);

        var query = _db.Repairs.AsNoTracking().AsQueryable();
        if (from is not null) query = query.Where(r => r.Date >= from);
        if (to is not null) query = query.Where(r => r.Date <= to);

        var tokens = (search ?? string.Empty).Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        foreach (var token in tokens)
        {
            // Экранируем спецсимволы LIKE, чтобы «50%» или «a_b» искались буквально
            var pattern = "%" + token.Replace(@"\", @"\\").Replace("%", @"\%").Replace("_", @"\_") + "%";
            query = query.Where(r =>
                EF.Functions.ILike(r.EquipmentUnit.SerialNumber, pattern, Escape) ||
                (r.EquipmentUnit.InventoryNumber != null && EF.Functions.ILike(r.EquipmentUnit.InventoryNumber, pattern, Escape)) ||
                EF.Functions.ILike(r.EquipmentUnit.EquipmentName.Name, pattern, Escape) ||
                EF.Functions.ILike(r.EquipmentUnit.EquipmentName.EquipmentType.Name, pattern, Escape) ||
                (r.Note != null && EF.Functions.ILike(r.Note, pattern, Escape)) ||
                EF.Functions.ILike(r.AccountLogin, pattern, Escape) ||
                r.Operations.Any(o => EF.Functions.ILike(o.RepairOperation.Name, pattern, Escape)) ||
                r.WriteOffs.Any(w => EF.Functions.ILike(w.SparePart.Name, pattern, Escape)));
        }

        var repairs = await query
            .OrderByDescending(r => r.Date).ThenByDescending(r => r.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Include(r => r.EquipmentUnit).ThenInclude(u => u.EquipmentName).ThenInclude(n => n.EquipmentType)
            .Include(r => r.Operations).ThenInclude(o => o.RepairOperation)
            .Include(r => r.WriteOffs).ThenInclude(w => w.SparePart)
            .AsSplitQuery()
            .ToListAsync();

        return repairs.Select(r => new RepairListItemDto(
            r.Id,
            r.Date,
            r.EquipmentUnitId,
            $"{r.EquipmentUnit.EquipmentName.EquipmentType.Name} {r.EquipmentUnit.EquipmentName.Name}, S/N {r.EquipmentUnit.SerialNumber}",
            r.EquipmentUnit.InventoryNumber,
            r.Note,
            r.AccountLogin,
            r.CreatedUtc,
            r.Operations.Select(o => new RepairOperationDto(o.RepairOperationId, o.RepairOperation.Name))
                .OrderBy(o => o.Name).ToList(),
            r.WriteOffs.Select(w => new WriteOffPartDto(w.SparePartId, w.SparePart.Name, w.Quantity))
                .OrderBy(p => p.Name).ToList())).ToList();
    }
}
