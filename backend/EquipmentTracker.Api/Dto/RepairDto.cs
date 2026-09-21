namespace EquipmentTracker.Api.Dto;

public record RepairPartDto(int SparePartId, string Name, int Quantity);

public record RepairDto(
    int Id,
    DateOnly Date,
    string? Note,
    string AccountLogin,
    DateTime CreatedUtc,
    List<RepairOperationDto> Operations,
    List<RepairPartDto> Parts);

public record RepairPartRequest(int SparePartId, int Quantity);

// Date не указана — берётся текущая (UTC) дата сервера; фронтенд по умолчанию передаёт локальную дату.
public record CreateRepairRequest(
    DateOnly? Date,
    List<int>? OperationIds,
    List<RepairPartRequest>? Parts,
    string? Note);
