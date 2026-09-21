namespace EquipmentTracker.Api.Models;

public class EquipmentName
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;

    public int EquipmentTypeId { get; set; }
    public EquipmentType EquipmentType { get; set; } = null!;

    public ICollection<EquipmentUnit> EquipmentUnits { get; set; } = new List<EquipmentUnit>();
}
