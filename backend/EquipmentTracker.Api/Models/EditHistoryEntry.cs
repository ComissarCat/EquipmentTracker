namespace EquipmentTracker.Api.Models;

public enum EditAction
{
    Created = 0,
    Updated = 1,
    Deleted = 2
}

// EntityType хранит имя типа сущности (Location, EquipmentType, EquipmentName, EquipmentUnit)
public class EditHistoryEntry
{
    public int Id { get; set; }
    public string EntityType { get; set; } = string.Empty;
    public int EntityId { get; set; }
    public EditAction Action { get; set; }

    // JSON-снимок изменённых полей (старое/новое значение) либо полного состояния при создании/удалении
    public string ChangesJson { get; set; } = string.Empty;

    public int? AccountId { get; set; }
    public string AccountLogin { get; set; } = "система";

    public DateTime TimestampUtc { get; set; } = DateTime.UtcNow;
}
