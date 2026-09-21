namespace EquipmentTracker.Api.Models;

public class Location
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;

    public int? ParentLocationId { get; set; }
    public Location? ParentLocation { get; set; }

    public ICollection<Location> ChildLocations { get; set; } = new List<Location>();
    public ICollection<EquipmentUnit> EquipmentUnits { get; set; } = new List<EquipmentUnit>();
}
