namespace EquipmentTracker.Api.Dto;

public record LocationDto(int Id, string Name, int? ParentLocationId);
public record CreateLocationRequest(string Name, int? ParentLocationId);
public record UpdateLocationRequest(string Name, int? ParentLocationId);
public record MoveLocationRequest(int? NewParentLocationId);
