namespace EquipmentTracker.Api.Dto;

public record RepairOperationDto(int Id, string Name);
public record CreateRepairOperationRequest(string Name);
public record UpdateRepairOperationRequest(string Name);

public record SparePartDto(int Id, string Name, int Quantity);
public record CreateSparePartRequest(string Name, int Quantity);
public record UpdateSparePartRequest(string Name);
// Администратор: прямая установка количества
public record SetSparePartQuantityRequest(int Quantity);
// Оператор (и администратор): пополнение запаса, Amount должен быть > 0
public record AddSparePartStockRequest(int Amount);
