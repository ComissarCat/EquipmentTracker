import React from 'react';
import type { EquipmentUnit, LocationItem } from '../types';

interface ExportTreeProps {
  locations: LocationItem[];
  units: EquipmentUnit[];
  checkedUnitIds: Set<number>;
  onChange: (ids: Set<number>) => void;
}

// Дерево локаций/техники с чекбоксами для страницы экспорта. Отмечать можно и целую
// локацию (отметит всю технику в ней и во всех вложенных локациях), и отдельные единицы техники.
export function ExportTree(props: ExportTreeProps) {
  const { locations, units, checkedUnitIds, onChange } = props;

  const [expanded, setExpanded] = React.useState<Set<number>>(new Set());
  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Поиск по серийному/инвентарному номеру, наименованию и типу техники
  const [searchQuery, setSearchQuery] = React.useState('');
  const query = searchQuery.trim().toLowerCase();
  const isSearching = query.length > 0;

  const childrenMap = React.useMemo(() => {
    const map = new Map<number | null, LocationItem[]>();
    for (const l of locations) {
      const arr = map.get(l.parentLocationId) ?? [];
      arr.push(l);
      map.set(l.parentLocationId, arr);
    }
    return map;
  }, [locations]);

  const visibleUnits = React.useMemo(() => {
    if (!isSearching) return units;
    return units.filter((u) => {
      const haystack = `${u.serialNumber} ${u.inventoryNumber ?? ''} ${u.equipmentNameName} ${u.equipmentTypeName}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [units, isSearching, query]);

  const unitsByLocation = React.useMemo(() => {
    const map = new Map<number, EquipmentUnit[]>();
    for (const u of visibleUnits) {
      const arr = map.get(u.locationId) ?? [];
      arr.push(u);
      map.set(u.locationId, arr);
    }
    return map;
  }, [visibleUnits]);

  // При активном поиске показываем только локации, ведущие к найденным единицам техники (их предков)
  const visibleLocationIds = React.useMemo(() => {
    if (!isSearching) return null;
    const locById = new Map(locations.map((l) => [l.id, l]));
    const ids = new Set<number>();
    for (const u of visibleUnits) {
      let cur: number | null = u.locationId;
      while (cur !== null && !ids.has(cur)) {
        ids.add(cur);
        const loc = locById.get(cur);
        cur = loc ? loc.parentLocationId : null;
      }
    }
    return ids;
  }, [isSearching, visibleUnits, locations]);

  // Все id единиц техники, вложенных в данную локацию (рекурсивно, включая её саму)
  const descendantUnitIds = React.useMemo(() => {
    const cache = new Map<number, number[]>();
    const compute = (locationId: number): number[] => {
      if (cache.has(locationId)) return cache.get(locationId)!;
      const own = (unitsByLocation.get(locationId) ?? []).map((u) => u.id);
      const kids = childrenMap.get(locationId) ?? [];
      const nested = kids.flatMap((k) => compute(k.id));
      const result = [...own, ...nested];
      cache.set(locationId, result);
      return result;
    };
    for (const l of locations) compute(l.id);
    return cache;
  }, [locations, childrenMap, unitsByLocation]);

  const toggleUnit = (unitId: number) => {
    const next = new Set(checkedUnitIds);
    if (next.has(unitId)) next.delete(unitId);
    else next.add(unitId);
    onChange(next);
  };

  const toggleLocation = (locationId: number) => {
    const ids = descendantUnitIds.get(locationId) ?? [];
    const allChecked = ids.length > 0 && ids.every((id) => checkedUnitIds.has(id));
    const next = new Set(checkedUnitIds);
    if (allChecked) ids.forEach((id) => next.delete(id));
    else ids.forEach((id) => next.add(id));
    onChange(next);
  };

  const locationCheckState = (locationId: number): 'checked' | 'unchecked' | 'indeterminate' => {
    const ids = descendantUnitIds.get(locationId) ?? [];
    if (ids.length === 0) return 'unchecked';
    const checkedCount = ids.filter((id) => checkedUnitIds.has(id)).length;
    if (checkedCount === 0) return 'unchecked';
    if (checkedCount === ids.length) return 'checked';
    return 'indeterminate';
  };

  const LocationCheckbox = ({ locationId }: { locationId: number }) => {
    const ref = React.useRef<HTMLInputElement>(null);
    const state = locationCheckState(locationId);
    React.useEffect(() => {
      if (ref.current) ref.current.indeterminate = state === 'indeterminate';
    }, [state]);
    return (
      <input
        ref={ref}
        type="checkbox"
        checked={state === 'checked'}
        onChange={(e) => {
          e.stopPropagation();
          toggleLocation(locationId);
        }}
        onClick={(e) => e.stopPropagation()}
      />
    );
  };

  const renderUnit = (unit: EquipmentUnit, depth: number) => (
    <label key={`unit-${unit.id}`} className="tree-row tree-unit export-row" style={{ paddingLeft: depth * 18 }}>
      <input type="checkbox" checked={checkedUnitIds.has(unit.id)} onChange={() => toggleUnit(unit.id)} />
      <span className="tree-icon">🖥️</span>
      <span className="tree-label">
        {unit.equipmentNameName} — S/N {unit.serialNumber}
        {unit.inventoryNumber ? ` (инв. ${unit.inventoryNumber})` : ''}
      </span>
    </label>
  );

  const childrenOf = (parentId: number | null) => {
    const kids = childrenMap.get(parentId) ?? [];
    return isSearching ? kids.filter((l) => visibleLocationIds!.has(l.id)) : kids;
  };

  const renderLocation = (location: LocationItem, depth: number): React.ReactNode => {
    // Во время поиска все ветки, ведущие к совпадениям, раскрыты принудительно
    const isExpanded = isSearching ? true : expanded.has(location.id);
    const kids = childrenOf(location.id);
    const locUnits = unitsByLocation.get(location.id) ?? [];
    const hasChildren = kids.length > 0 || locUnits.length > 0;

    return (
      <div key={`loc-${location.id}`}>
        <div className="tree-row tree-location export-row" style={{ paddingLeft: depth * 18 }}>
          <LocationCheckbox locationId={location.id} />
          <span
            className="tree-toggle"
            onClick={() => hasChildren && toggleExpand(location.id)}
          >
            {hasChildren ? (isExpanded ? '▾' : '▸') : '·'}
          </span>
          <span className="tree-icon">{isExpanded ? '📂' : '📁'}</span>
          <span className="tree-label" onClick={() => hasChildren && toggleExpand(location.id)}>
            {location.name}
          </span>
        </div>
        {isExpanded && (
          <div>
            {kids.map((k) => renderLocation(k, depth + 1))}
            {locUnits.map((u) => renderUnit(u, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const rootLocations = childrenOf(null);
  const nothingFound = isSearching && rootLocations.length === 0;

  return (
    <>
      <div className="tree-search">
        <input
          type="text"
          placeholder="Поиск: серийный/инв. номер, наименование, тип..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {isSearching && (
          <button type="button" className="tree-search-clear" onClick={() => setSearchQuery('')} title="Очистить поиск">
            ✕
          </button>
        )}
      </div>
      <div className="tree-scroll">
        {rootLocations.map((l) => renderLocation(l, 0))}
        {rootLocations.length === 0 && !nothingFound && <div className="tree-empty">Список пуст</div>}
        {nothingFound && <div className="tree-empty">По запросу «{searchQuery}» ничего не найдено</div>}
      </div>
    </>
  );
}
