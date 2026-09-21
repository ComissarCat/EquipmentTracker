namespace EquipmentTracker.Api.Dto;

public record HistoryEntryDto(
    int Id,
    string EntityType,
    int EntityId,
    string Action,
    string ChangesJson,
    string AccountLogin,
    DateTime TimestampUtc);
