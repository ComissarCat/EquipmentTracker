using EquipmentTracker.Api.Data;
using EquipmentTracker.Api.Dto;
using EquipmentTracker.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace EquipmentTracker.Api.Services;

public sealed record PreparedWriteOff(SparePart Part, int Quantity);

// Общая логика списания расходных частей для ремонтов и выдач: проверка запроса и
// собственно списание. Наличие на складе намеренно НЕ проверяется — остаток может стать
// отрицательным (так задумано).
public static class SparePartWriteOffs
{
    public static async Task<(List<PreparedWriteOff> Items, string? Error)> PrepareAsync(
        AppDbContext db, IEnumerable<SparePartQuantityRequest>? requests)
    {
        var list = requests?.ToList() ?? new List<SparePartQuantityRequest>();
        if (list.Any(p => p.Quantity <= 0))
            return (new(), "Количество расходной части должно быть больше нуля");

        // Одну и ту же часть, указанную несколько раз, объединяем в одну строку
        var totals = list
            .GroupBy(p => p.SparePartId)
            .ToDictionary(g => g.Key, g => g.Sum(p => (long)p.Quantity));

        var ids = totals.Keys.ToList();
        var parts = await db.SpareParts.Where(p => ids.Contains(p.Id)).ToListAsync();
        if (parts.Count != ids.Count)
            return (new(), "Одна из расходных частей не найдена");

        foreach (var part in parts)
        {
            var total = totals[part.Id];
            if (total > int.MaxValue || part.Quantity - total < int.MinValue)
                return (new(), $"Слишком большое количество для «{part.Name}»");
        }

        return (parts.Select(p => new PreparedWriteOff(p, (int)totals[p.Id])).ToList(), null);
    }

    // Добавляет строки списания к основанию (ремонту/выдаче) и уменьшает остатки.
    // Сохранение — на вызывающем, чтобы всё шло одной транзакцией.
    public static void Apply(ICollection<SparePartWriteOff> target, IEnumerable<PreparedWriteOff> items)
    {
        foreach (var (part, quantity) in items)
        {
            target.Add(new SparePartWriteOff { SparePart = part, Quantity = quantity });
            part.Quantity -= quantity;
        }
    }

    // Администратор заменяет набор частей у уже зафиксированного ремонта/выдачи. Остатки меняются
    // ТОЛЬКО на разницу «было − стало» по каждой части (изменили 5→3 — на склад вернулось 2; убрали
    // часть — вернулось всё; добавили — списалось). Строки write-offs должны быть загружены вместе
    // с SparePart. Сохранение — на вызывающем (одна транзакция). Возвращает текст ошибки или null.
    public static async Task<string?> ReplaceAsync(
        AppDbContext db, ICollection<SparePartWriteOff> writeOffs, IEnumerable<SparePartQuantityRequest>? requests)
    {
        var list = requests?.ToList() ?? new List<SparePartQuantityRequest>();
        if (list.Any(p => p.Quantity <= 0))
            return "Количество расходной части должно быть больше нуля";

        var newTotals = list
            .GroupBy(p => p.SparePartId)
            .ToDictionary(g => g.Key, g => g.Sum(p => (long)p.Quantity));

        var ids = newTotals.Keys.ToList();
        var newParts = await db.SpareParts.Where(p => ids.Contains(p.Id)).ToListAsync();
        if (newParts.Count != ids.Count)
            return "Одна из расходных частей не найдена";

        var oldGroups = writeOffs.GroupBy(w => w.SparePartId).ToList();
        var oldTotals = oldGroups.ToDictionary(g => g.Key, g => g.Sum(w => (long)w.Quantity));

        // Сначала проверяем все итоговые остатки, затем применяем — чтобы не менять данные наполовину
        var partsById = newParts.Concat(writeOffs.Select(w => w.SparePart)).DistinctBy(p => p.Id).ToDictionary(p => p.Id);
        var newStocks = new Dictionary<int, long>();
        foreach (var partId in oldTotals.Keys.Union(newTotals.Keys))
        {
            var part = partsById[partId];
            var stock = (long)part.Quantity + oldTotals.GetValueOrDefault(partId) - newTotals.GetValueOrDefault(partId);
            if (stock > int.MaxValue || stock < int.MinValue || newTotals.GetValueOrDefault(partId) > int.MaxValue)
                return $"Слишком большое количество для «{part.Name}»";
            newStocks[partId] = stock;
        }

        foreach (var (partId, stock) in newStocks)
            partsById[partId].Quantity = (int)stock;

        // Строки: обновить / удалить лишние / добавить новые (по одной строке на часть)
        foreach (var group in oldGroups)
        {
            var rows = group.ToList();
            if (newTotals.TryGetValue(group.Key, out var total))
            {
                rows[0].Quantity = (int)total;
                foreach (var extra in rows.Skip(1)) RemoveRow(db, writeOffs, extra);
            }
            else
            {
                foreach (var row in rows) RemoveRow(db, writeOffs, row);
            }
        }
        foreach (var (partId, total) in newTotals.Where(t => !oldTotals.ContainsKey(t.Key)))
            writeOffs.Add(new SparePartWriteOff { SparePart = partsById[partId], Quantity = (int)total });

        return null;
    }

    // Полная отмена ремонта/выдачи: всё списанное возвращается на склад, строки удаляются.
    public static string? ReturnAll(AppDbContext db, ICollection<SparePartWriteOff> writeOffs)
    {
        foreach (var group in writeOffs.GroupBy(w => w.SparePartId))
        {
            var part = group.First().SparePart;
            var stock = (long)part.Quantity + group.Sum(w => (long)w.Quantity);
            if (stock > int.MaxValue)
                return $"Слишком большое итоговое количество на складе для «{part.Name}»";
        }
        foreach (var group in writeOffs.GroupBy(w => w.SparePartId))
            group.First().SparePart.Quantity += group.Sum(w => w.Quantity);

        foreach (var row in writeOffs.ToList()) RemoveRow(db, writeOffs, row);
        return null;
    }

    private static void RemoveRow(AppDbContext db, ICollection<SparePartWriteOff> writeOffs, SparePartWriteOff row)
    {
        writeOffs.Remove(row);
        db.SparePartWriteOffs.Remove(row);
    }
}
