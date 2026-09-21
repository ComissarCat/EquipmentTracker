namespace EquipmentTracker.Api.Models;

// Справочник ремонтных операций (например, «Замена термопасты», «Чистка от пыли»)
public class RepairOperation
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
}
