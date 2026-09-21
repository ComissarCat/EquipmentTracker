namespace EquipmentTracker.Api.Dto;

// TotalUnits/ConfirmedUnits: пока инвентаризация идёт — живые значения, после остановки — итоговые
public record InventorySummaryDto(
    int Id,
    DateTime StartedUtc,
    string StartedByLogin,
    DateTime? EndedUtc,
    string? EndedByLogin,
    bool IsActive,
    int TotalUnits,
    int ConfirmedUnits);

public record InventoryConfirmationDto(int EquipmentUnitId, DateTime ConfirmedUtc, string ConfirmedByLogin);

// Текущая идущая инвентаризация (Inventory = null, если её нет) и подтверждённая в ней техника
public record ActiveInventoryDto(InventorySummaryDto? Inventory, List<InventoryConfirmationDto> Confirmations);

public record InventoryUnresolvedUnitDto(
    int? EquipmentUnitId,
    string TypeName,
    string Name,
    string SerialNumber,
    string? InventoryNumber,
    string? Note,
    string LocationPath);

public record InventoryDetailsDto(InventorySummaryDto Inventory, List<InventoryUnresolvedUnitDto> Unresolved);

// Подтвердить можно и отдельные единицы, и локации целиком (вся техника в них, включая вложенные локации)
public record ConfirmInventoryRequest(List<int>? UnitIds, List<int>? LocationIds);

// Confirmed — сколько единиц подтверждено этим запросом впервые (уже подтверждённые не считаются)
public record ConfirmInventoryResultDto(int Confirmed);
