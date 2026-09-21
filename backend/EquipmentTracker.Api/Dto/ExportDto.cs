namespace EquipmentTracker.Api.Dto;

public record ExportUnitIdsRequest(List<int> UnitIds);

// BuildingDepth/CabinetDepth — глубина уровня "здание"/"кабинет" в дереве локаций
// (0 = корень); вычисляется на фронтенде по двум примерам локаций, которые указал
// пользователь, т.к. в новой схеме нет жёстко заданных таблиц Buildings/Cabinets.
public record InventoryCardsRequest(List<int> UnitIds, int BuildingDepth, int CabinetDepth);
