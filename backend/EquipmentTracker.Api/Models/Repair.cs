namespace EquipmentTracker.Api.Models;

// Зафиксированный ремонт единицы техники: дата, выполненные операции, списанные расходные
// части (общая таблица списаний SparePartWriteOff) и примечание. Кто зафиксировал — хранится
// снимком (AccountLogin), как и в истории редактирования, чтобы запись не зависела от
// дальнейшей судьбы учётной записи.
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

    // Заполняются, когда администратор изменил запись после создания
    public DateTime? ModifiedUtc { get; set; }
    public string? ModifiedByLogin { get; set; }

    public ICollection<RepairOperationItem> Operations { get; set; } = new List<RepairOperationItem>();
    public ICollection<SparePartWriteOff> WriteOffs { get; set; } = new List<SparePartWriteOff>();
}

public class RepairOperationItem
{
    public int RepairId { get; set; }
    public Repair Repair { get; set; } = null!;

    public int RepairOperationId { get; set; }
    public RepairOperation RepairOperation { get; set; } = null!;
}
