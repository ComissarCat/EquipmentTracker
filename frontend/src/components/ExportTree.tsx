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

  const childrenMap = React.useMemo(() => {
    const map = new Map<number | null, LocationItem[]>();
    for (const l of locations) {
      const arr = map.get(l.parentLocationId) ?? [];
      arr.push(l);
      map.set(l.parentLocationId, arr);
    }
    return map;
  }, [locations]);

  const unitsByLocation = React.useMemo(() => {
    const map = new Map<number, EquipmentUnit[]>();
    for (const u of units) {
      const arr = map.get(u.locationId) ?? [];
      arr.push(u);
      map.set(u.locationId, arr);
    }
    return map;
  }, [units]);

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

  const renderLocation = (location: LocationItem, depth: number): React.ReactNode => {
    const isExpanded = expanded.has(location.id);
    const kids = childrenMap.get(location.id) ?? [];
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

  const rootLocations = childrenMap.get(null) ?? [];

  return (
    <div className="tree-scroll">
      {rootLocations.map((l) => renderLocation(l, 0))}
      {rootLocations.length === 0 && <div className="tree-empty">Список пуст</div>}
    </div>
  );
}
