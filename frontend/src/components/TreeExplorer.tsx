import React from 'react';
import type { EquipmentUnit, LocationItem } from '../types';

// Ключ узла дерева: "loc:5" или "unit:12" — строкой, чтобы удобно хранить в Set для мультивыбора
export type NodeKey = string;
export const keyOf = (kind: 'location' | 'unit', id: number): NodeKey => `${kind}:${id}`;
export const parseKey = (key: NodeKey): { kind: 'location' | 'unit'; id: number } => {
  const idx = key.indexOf(':');
  return { kind: key.slice(0, idx) as 'location' | 'unit', id: Number(key.slice(idx + 1)) };
};

// Перетаскиваемая "полезная нагрузка" — массив, т.к. можно тащить сразу несколько выбранных элементов
export type DragPayload = { kind: 'location' | 'unit'; id: number }[];

interface TreeExplorerProps {
  panelTitle: string;
  locations: LocationItem[];
  units: EquipmentUnit[];
  selectedKeys: Set<NodeKey>;
  onSelectionChange: (keys: Set<NodeKey>) => void;
  canEdit: boolean;
  // Вызывается когда пользователь перетащил выбранные элементы (locationId — новый родитель/локация, null = корень)
  onDropOnLocation: (payload: DragPayload, targetLocationId: number | null) => void;
  // Открыть страницу единицы техники (двойной клик по строке)
  onOpenUnit: (unitId: number) => void;
}

const ROOT_KEY = -1; // виртуальный "корень" панели, обозначает locationId = null

export function TreeExplorer(props: TreeExplorerProps) {
  const { locations, units, selectedKeys, onSelectionChange, canEdit, onDropOnLocation, panelTitle, onOpenUnit } = props;

  // Каждая панель раскрывает/сворачивает узлы независимо от другой панели
  const [expanded, setExpanded] = React.useState<Set<number>>(new Set());
  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Опорная точка для выделения диапазона по Shift — id последнего "обычного"/Ctrl-клика
  const anchorRef = React.useRef<NodeKey | null>(null);

  // Поиск по серийному/инвентарному номеру, наименованию и типу техники — своя строка на каждую панель
  const [searchQuery, setSearchQuery] = React.useState('');
  const query = searchQuery.trim().toLowerCase();
  const isSearching = query.length > 0;

  const visibleUnits = React.useMemo(() => {
    if (!isSearching) return units;
    return units.filter((u) => {
      const haystack = `${u.serialNumber} ${u.inventoryNumber ?? ''} ${u.equipmentNameName} ${u.equipmentTypeName}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [units, isSearching, query]);

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

  const [dragOverKey, setDragOverKey] = React.useState<number | null>(null);

  const childrenOf = (parentId: number | null) => {
    const kids = locations.filter((l) => l.parentLocationId === parentId);
    return isSearching ? kids.filter((l) => visibleLocationIds!.has(l.id)) : kids;
  };
  const unitsOf = (locationId: number) => visibleUnits.filter((u) => u.locationId === locationId);

  // Плоский порядок видимых узлов сверху вниз — как они реально отрисованы сейчас.
  // Заполняется во время этого рендера (renderLocation/renderUnit пушат в него по ходу вызова)
  // и используется обработчиками кликов для расчёта диапазона по Shift.
  const visibleOrder: NodeKey[] = [];

  const selectWithModifiers = (e: React.MouseEvent, key: NodeKey) => {
    e.stopPropagation();
    if (e.shiftKey && anchorRef.current) {
      const anchorIdx = visibleOrder.indexOf(anchorRef.current);
      const clickIdx = visibleOrder.indexOf(key);
      if (anchorIdx !== -1 && clickIdx !== -1) {
        const [from, to] = anchorIdx < clickIdx ? [anchorIdx, clickIdx] : [clickIdx, anchorIdx];
        onSelectionChange(new Set(visibleOrder.slice(from, to + 1)));
        return;
      }
    }
    if (e.ctrlKey || e.metaKey) {
      const next = new Set(selectedKeys);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      onSelectionChange(next);
      anchorRef.current = key;
      return;
    }
    onSelectionChange(new Set([key]));
    anchorRef.current = key;
  };

  const handleDragStart = (e: React.DragEvent, key: NodeKey) => {
    // Если тащим элемент, входящий в текущее мультивыделение — тащим всё выделение целиком.
    // Если тащим элемент вне выделения — выделение схлопывается до одного этого элемента (как в проводнике).
    let keysToDrag: NodeKey[];
    if (selectedKeys.has(key) && selectedKeys.size > 1) {
      keysToDrag = Array.from(selectedKeys);
    } else {
      keysToDrag = [key];
      onSelectionChange(new Set([key]));
      anchorRef.current = key;
    }
    const payload: DragPayload = keysToDrag.map(parseKey);
    e.dataTransfer.setData('application/json', JSON.stringify(payload));
  };

  const handleDrop = (e: React.DragEvent, targetLocationId: number | null) => {
    e.preventDefault();
    setDragOverKey(null);
    const raw = e.dataTransfer.getData('application/json');
    if (!raw) return;
    try {
      const payload: DragPayload = JSON.parse(raw);
      // У единицы техники локация обязательна — "уронить" её в корень (targetLocationId = null) нельзя
      if (targetLocationId === null && payload.some((p) => p.kind === 'unit')) return;
      onDropOnLocation(payload, targetLocationId);
    } catch {
      /* игнорируем некорректный payload */
    }
  };

  const renderUnit = (unit: EquipmentUnit) => {
    const key = keyOf('unit', unit.id);
    visibleOrder.push(key);
    const isSelected = selectedKeys.has(key);
    return (
      <div
        key={key}
        className={`tree-row tree-unit ${isSelected ? 'selected' : ''}`}
        draggable={canEdit}
        onDragStart={(e) => handleDragStart(e, key)}
        onClick={(e) => selectWithModifiers(e, key)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onOpenUnit(unit.id);
        }}
        title={unit.note ?? undefined}
      >
        <span className="tree-icon">🖥️</span>
        <span className="tree-label">
          {unit.equipmentNameName} — S/N {unit.serialNumber}
          {unit.inventoryNumber ? ` (инв. ${unit.inventoryNumber})` : ''}
        </span>
      </div>
    );
  };

  const renderLocation = (location: LocationItem, depth: number) => {
    const key = keyOf('location', location.id);
    visibleOrder.push(key);
    // Во время поиска все ветки, ведущие к совпадениям, раскрыты принудительно
    const isExpanded = isSearching ? true : expanded.has(location.id);
    const isSelected = selectedKeys.has(key);
    const isDragOver = dragOverKey === location.id;
    const kids = childrenOf(location.id);
    const locUnits = unitsOf(location.id);
    const hasChildren = kids.length > 0 || locUnits.length > 0;

    return (
      <div key={`wrap-${key}`}>
        <div
          className={`tree-row tree-location ${isSelected ? 'selected' : ''} ${isDragOver ? 'drag-over' : ''}`}
          style={{ paddingLeft: depth * 18 }}
          draggable={canEdit}
          onDragStart={(e) => handleDragStart(e, key)}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation(); // не даём событию всплыть до корневого контейнера панели
            setDragOverKey((k) => (k === location.id ? k : location.id)); // без изменений — не триггерим лишний рендер
          }}
          onDragLeave={(e) => {
            e.stopPropagation();
            setDragOverKey((k) => (k === location.id ? null : k));
          }}
          onDrop={(e) => {
            e.stopPropagation();
            handleDrop(e, location.id);
          }}
          onClick={(e) => selectWithModifiers(e, key)}
        >
          <span
            className="tree-toggle"
            onClick={(e) => {
              e.stopPropagation();
              if (hasChildren && !isSearching) toggleExpand(location.id);
            }}
          >
            {hasChildren ? (isExpanded ? '▾' : '▸') : '·'}
          </span>
          <span className="tree-icon">{isExpanded ? '📂' : '📁'}</span>
          <span className="tree-label">{location.name}</span>
        </div>
        {isExpanded && (
          <div>
            {kids.map((k) => renderLocation(k, depth + 1))}
            {locUnits.map((u) => (
              <div key={`unit-wrap-${u.id}`} style={{ paddingLeft: (depth + 1) * 18 }}>
                {renderUnit(u)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const rootLocations = childrenOf(null);
  const isRootDragOver = dragOverKey === ROOT_KEY;
  const nothingFound = isSearching && rootLocations.length === 0;
  const renderedRoots = rootLocations.map((l) => renderLocation(l, 0)); // заполняет visibleOrder по ходу рендера

  return (
    <div className="tree-panel">
      <div className="tree-panel-title">
        {panelTitle}
        {selectedKeys.size > 1 && <span className="tree-panel-count"> · выбрано: {selectedKeys.size}</span>}
      </div>
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
      <div
        className={`tree-scroll ${isRootDragOver ? 'drag-over-root' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOverKey((k) => (k === ROOT_KEY ? k : ROOT_KEY));
        }}
        onDragLeave={() => setDragOverKey((k) => (k === ROOT_KEY ? null : k))}
        onDrop={(e) => handleDrop(e, null)}
        onClick={() => onSelectionChange(new Set())}
      >
        {renderedRoots}

        {rootLocations.length === 0 && !nothingFound && (
          <div className="tree-empty">
            Список пуст. Создайте хотя бы одну локацию — у каждой единицы техники обязательно должна быть локация.
          </div>
        )}
        {nothingFound && <div className="tree-empty">По запросу «{searchQuery}» ничего не найдено</div>}
      </div>
    </div>
  );
}

export { ROOT_KEY };
