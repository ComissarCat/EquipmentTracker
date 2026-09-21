namespace EquipmentTracker.Api.Models;

// Зафиксированный ремонт единицы техники: дата, выполненные операции, израсходованные
// расходные части и примечание. Кто зафиксировал — хранится снимком (AccountLogin), как и в
// истории редактирования, чтобы запись не зависела от дальнейшей судьбы учётной записи.
public class Repair
{
    public int Id { get; set; }

    public int EquipmentUnitId { get; set; }
    public EquipmentUnit EquipmentUnit { get; set; } = null!;

    public DateOnly Date { get; set; }
    public string? Note { get; set; }

    public int? AccountId { get; set; }
    public string AccountLogin { get; set; } = string.Empty;

    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;

    public ICollection<RepairOperationItem> Operations { get; set; } = new List<RepairOperationItem>();
    public ICollection<RepairPartItem> Parts { get; set; } = new List<RepairPartItem>();
}

public class RepairOperationItem
{
    public int RepairId { get; set; }
    public Repair Repair { get; set; } = null!;

    public int RepairOperationId { get; set; }
    public RepairOperation RepairOperation { get; set; } = null!;
}

public class RepairPartItem
{
    public int RepairId { get; set; }
    public Repair Repair { get; set; } = null!;

    public int SparePartId { get; set; }
    public SparePart SparePart { get; set; } = null!;

    public int Quantity { get; set; }
}
