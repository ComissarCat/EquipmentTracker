namespace EquipmentTracker.Api.Dto;

// Строка списания расходной части (в ремонте или выдаче)
public record WriteOffPartDto(int SparePartId, string Name, int Quantity);

public record RepairDto(
    int Id,
    DateOnly Date,
    string? Note,
    string AccountLogin,
    DateTime CreatedUtc,
    List<RepairOperationDto> Operations,
    List<WriteOffPartDto> Parts);

// Запрос на списание части: используется и при фиксации ремонта, и при выдаче
public record SparePartQuantityRequest(int SparePartId, int Quantity);

// Date не указана — берётся текущая (UTC) дата сервера; фронтенд по умолчанию передаёт локальную дату.
public record CreateRepairRequest(
    DateOnly? Date,
    List<int>? OperationIds,
    List<SparePartQuantityRequest>? Parts,
    string? Note);

public record CreateSparePartIssueRequest(
    DateOnly? Date,
    string? Recipient,
    List<SparePartQuantityRequest>? Parts);

public record SparePartIssueDto(
    int Id,
    DateOnly Date,
    string Recipient,
    string AccountLogin,
    DateTime CreatedUtc,
    List<WriteOffPartDto> Parts);

// Строка истории списаний. Kind: "Repair" | "Issue".
// Для ремонта заполнены RepairId/EquipmentUnitId/EquipmentUnitTitle, для выдачи — Recipient.
public record SparePartWriteOffDto(
    int Id,
    DateOnly Date,
    string Kind,
    int SparePartId,
    string SparePartName,
    int Quantity,
    string AccountLogin,
    DateTime CreatedUtc,
    string? Recipient,
    int? RepairId,
    int? EquipmentUnitId,
    string? EquipmentUnitTitle);

// Администратор: изменение строки списания. Quantity строго > 0 (для обнуления есть отмена).
public record UpdateSparePartWriteOffRequest(int SparePartId, int Quantity);

// Строка общего списка ремонтов (по всей технике)
public record RepairListItemDto(
    int Id,
    DateOnly Date,
    int EquipmentUnitId,
    string EquipmentUnitTitle,
    string? InventoryNumber,
    string? Note,
    string AccountLogin,
    DateTime CreatedUtc,
    List<RepairOperationDto> Operations,
    List<WriteOffPartDto> Parts);
