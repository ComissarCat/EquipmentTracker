namespace EquipmentTracker.Api.Models;

public class EquipmentType
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;

    public ICollection<EquipmentName> EquipmentNames { get; set; } = new List<EquipmentName>();
}
