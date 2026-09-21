namespace EquipmentTracker.Api.Dto;

public record EquipmentTypeDto(int Id, string Name);
public record CreateEquipmentTypeRequest(string Name);
public record UpdateEquipmentTypeRequest(string Name);

public record EquipmentNameDto(int Id, string Name, int EquipmentTypeId, string EquipmentTypeName);
public record CreateEquipmentNameRequest(string Name, int EquipmentTypeId);
public record UpdateEquipmentNameRequest(string Name, int EquipmentTypeId);

public record EquipmentUnitDto(
    int Id,
    int EquipmentNameId,
    string EquipmentNameName,
    string EquipmentTypeName,
    string SerialNumber,
    string? InventoryNumber,
    string? Note,
    int LocationId);

public record CreateEquipmentUnitRequest(
    int EquipmentNameId,
    string SerialNumber,
    string? InventoryNumber,
    string? Note,
    int LocationId);

public record UpdateEquipmentUnitRequest(
    int EquipmentNameId,
    string SerialNumber,
    string? InventoryNumber,
    string? Note,
    int LocationId);

public record MoveEquipmentUnitRequest(int NewLocationId);
