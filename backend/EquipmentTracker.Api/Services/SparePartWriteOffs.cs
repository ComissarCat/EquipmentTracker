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
}
