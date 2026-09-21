using EquipmentTracker.Api.Data;
using EquipmentTracker.Api.Dto;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EquipmentTracker.Api.Controllers;

// Просмотр истории редактирования технических справочников.
// Доступен авторизованным пользователям (Operator/Administrator) — история содержит
// служебные данные редактирования, поэтому не открывается анонимно.
[ApiController]
[Route("api/history")]
[Authorize(Policy = "Operator")]
public class HistoryController : ControllerBase
{
    private readonly AppDbContext _db;

    public HistoryController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<List<HistoryEntryDto>>> GetAll(
        [FromQuery] string? entityType,
        [FromQuery] int? entityId,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50)
    {
        pageSize = Math.Clamp(pageSize, 1, 200);
        page = Math.Max(page, 1);

        var query = _db.HistoryEntries.AsQueryable();
        if (!string.IsNullOrWhiteSpace(entityType))
            query = query.Where(h => h.EntityType == entityType);
        if (entityId is not null)
            query = query.Where(h => h.EntityId == entityId);

        var entries = await query
            .OrderByDescending(h => h.TimestampUtc)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return entries.Select(h => new HistoryEntryDto(
            h.Id, h.EntityType, h.EntityId, h.Action.ToString(), h.ChangesJson, h.AccountLogin, h.TimestampUtc)).ToList();
    }
}
