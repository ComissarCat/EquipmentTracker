namespace EquipmentTracker.Api.Models;

// Инвентаризация: в каждый момент может идти не более одной (IsActive + уникальный индекс в БД).
// Пока идёт — «всего» и «подтверждено» считаются по живым данным (новая техника автоматически
// считается неподтверждённой, удалённая выпадает из подсчёта). При остановке итоги замораживаются:
// FinalTotalUnits/FinalConfirmedUnits и снимок неподтверждённой техники (InventoryUnresolvedUnit) —
// чтобы результаты не менялись от последующих правок и удалений техники.
public class Inventory
{
    public int Id { get; set; }

    public DateTime StartedUtc { get; set; } = DateTime.UtcNow;
    public int? StartedByAccountId { get; set; }
    public string StartedByLogin { get; set; } = string.Empty;

    public bool IsActive { get; set; } = true;

    public DateTime? EndedUtc { get; set; }
    public string? EndedByLogin { get; set; }

    // Заполняются при остановке
    public int? FinalTotalUnits { get; set; }
    public int? FinalConfirmedUnits { get; set; }

    public ICollection<InventoryConfirmation> Confirmations { get; set; } = new List<InventoryConfirmation>();
    public ICollection<InventoryUnresolvedUnit> UnresolvedUnits { get; set; } = new List<InventoryUnresolvedUnit>();
}

// «Данные подтверждены»: единица техники подтверждена в рамках инвентаризации.
// Удаление техники каскадно удаляет и её подтверждение.
public class InventoryConfirmation
{
    public int InventoryId { get; set; }
    public Inventory Inventory { get; set; } = null!;

    public int EquipmentUnitId { get; set; }
    public EquipmentUnit EquipmentUnit { get; set; } = null!;

    public DateTime ConfirmedUtc { get; set; } = DateTime.UtcNow;
    public string ConfirmedByLogin { get; set; } = string.Empty;
}

// Снимок неподтверждённой техники на момент остановки инвентаризации (без внешнего ключа на технику:
// сама единица могла быть позже удалена или изменена, а итоги должны остаться как были).
public class InventoryUnresolvedUnit
{
    public int Id { get; set; }

    public int InventoryId { get; set; }
    public Inventory Inventory { get; set; } = null!;

    public int? EquipmentUnitId { get; set; }
    public string TypeName { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string SerialNumber { get; set; } = string.Empty;
    public string? InventoryNumber { get; set; }
    public string? Note { get; set; }
    public string LocationPath { get; set; } = string.Empty;
}
