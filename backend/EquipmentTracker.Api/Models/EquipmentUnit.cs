namespace EquipmentTracker.Api.Models;

// Примечание: поле LocationId не было явно указано в исходном списке полей
// "Единицы техники", но добавлено как необходимое для работы дерева
// локаций и функции перемещения техники между локациями на главной странице.
// Локация обязательна: у каждой единицы техники всегда есть текущее расположение.
public class EquipmentUnit
{
    public int Id { get; set; }

    public int EquipmentNameId { get; set; }
    public EquipmentName EquipmentName { get; set; } = null!;

    public string SerialNumber { get; set; } = string.Empty;
    public string? InventoryNumber { get; set; }
    public string? Note { get; set; }

    public int LocationId { get; set; }
    public Location Location { get; set; } = null!;
}
