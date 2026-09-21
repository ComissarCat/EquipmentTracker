using EquipmentTracker.Api.Data;
using EquipmentTracker.Api.Dto;
using EquipmentTracker.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace EquipmentTracker.Api.Services;

// Общие запросы по инвентаризациям: итоги и списки неподтверждённой техники
// (используются и контроллером инвентаризаций, и выгрузкой в Excel).
public static class InventoryQueries
{
    // Идущая инвентаризация — живые счётчики; завершённая — замороженные итоги
    public static async Task<InventorySummaryDto> SummaryAsync(AppDbContext db, Inventory inv)
    {
        int total, confirmed;
        if (inv.IsActive)
        {
            total = await db.EquipmentUnits.CountAsync();
            confirmed = await db.InventoryConfirmations.CountAsync(c => c.InventoryId == inv.Id);
        }
        else
        {
            total = inv.FinalTotalUnits ?? 0;
            confirmed = inv.FinalConfirmedUnits ?? 0;
        }
        return ToSummary(inv, total, confirmed);
    }

    public static InventorySummaryDto ToSummary(Inventory inv, int total, int confirmed) => new(
        inv.Id, inv.StartedUtc, inv.StartedByLogin, inv.EndedUtc, inv.EndedByLogin, inv.IsActive, total, confirmed);

    // Неподтверждённая техника: пока идёт — по живым данным, после остановки — из снимка
    public static async Task<List<InventoryUnresolvedUnitDto>> UnresolvedAsync(AppDbContext db, Inventory inv)
    {
        List<InventoryUnresolvedUnitDto> rows;
        if (inv.IsActive)
        {
            var units = await db.EquipmentUnits
                .AsNoTracking()
                .Include(u => u.EquipmentName).ThenInclude(n => n.EquipmentType)
                .Where(u => !db.InventoryConfirmations.Any(c => c.InventoryId == inv.Id && c.EquipmentUnitId == u.Id))
                .ToListAsync();
            var locationsById = await db.Locations.AsNoTracking().ToDictionaryAsync(l => l.Id);
            rows = units.Select(u => new InventoryUnresolvedUnitDto(
                u.Id, u.EquipmentName.EquipmentType.Name, u.EquipmentName.Name, u.SerialNumber,
                u.InventoryNumber, u.Note, LocationPaths.FullPath(u.LocationId, locationsById))).ToList();
        }
        else
        {
            var snapshot = await db.InventoryUnresolvedUnits
                .AsNoTracking()
                .Where(u => u.InventoryId == inv.Id)
                .ToListAsync();
            rows = snapshot.Select(u => new InventoryUnresolvedUnitDto(
                u.EquipmentUnitId, u.TypeName, u.Name, u.SerialNumber, u.InventoryNumber, u.Note, u.LocationPath)).ToList();
        }

        return rows
            .OrderBy(r => r.LocationPath, StringComparer.OrdinalIgnoreCase)
            .ThenBy(r => r.SerialNumber, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }
}
