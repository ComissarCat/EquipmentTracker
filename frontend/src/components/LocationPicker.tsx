import React from 'react';
import type { LocationItem } from '../types';
import { ancestorChain } from '../utils/locationTree';

interface LocationPickerProps {
  locations: LocationItem[];
  value: number;
  onChange: (locationId: number) => void;
}

// Выбор локации деревом (вместо плоского выпадающего списка): только локации, одиночный выбор,
// поиск по названию. При открытии раскрыт путь до текущей локации.
export function LocationPicker({ locations, value, onChange }: LocationPickerProps) {
  const locationsById = React.useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);

  const [expanded, setExpanded] = React.useState<Set<number>>(
    () => new Set(ancestorChain(value, locationsById).slice(0, -1).map((l) => l.id))
  );
  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const [searchQuery, setSearchQuery] = React.useState('');
  const query = searchQuery.trim().toLowerCase();
  const isSearching = query.length > 0;

  // При поиске показываем совпавшие локации и их предков (ветки раскрыты принудительно)
  const visibleIds = React.useMemo(() => {
    if (!isSearching) return null;
    const ids = new Set<number>();
    for (const l of locations) {
      if (!l.name.toLowerCase().includes(query)) continue;
      for (const a of ancestorChain(l.id, locationsById)) ids.add(a.id);
    }
    return ids;
  }, [isSearching, query, locations, locationsById]);

  const childrenOf = (parentId: number | null) => {
    const kids = locations.filter((l) => l.parentLocationId === parentId);
    return visibleIds ? kids.filter((l) => visibleIds.has(l.id)) : kids;
  };

  // Прокрутить к текущей локации при открытии
  const selectedRowRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    selectedRowRef.current?.scrollIntoView({ block: 'nearest' });
  }, []);

  const renderLocation = (location: LocationItem, depth: number): React.ReactNode => {
    const kids = childrenOf(location.id);
    const hasChildren = kids.length > 0;
    const isExpanded = isSearching || expanded.has(location.id);
    const isSelected = location.id === value;
    return (
      <div key={location.id}>
        <div
          ref={isSelected ? selectedRowRef : undefined}
          className={`tree-row tree-location ${isSelected ? 'selected' : ''}`}
          style={{ paddingLeft: depth * 18 }}
          onClick={() => onChange(location.id)}
          onDoubleClick={() => hasChildren && !isSearching && toggleExpand(location.id)}
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
          <span className="tree-icon">{isExpanded && hasChildren ? '📂' : '📁'}</span>
          <span className="tree-label">{location.name}</span>
        </div>
        {isExpanded && kids.map((k) => renderLocation(k, depth + 1))}
      </div>
    );
  };

  const roots = childrenOf(null);
  const selectedPath = ancestorChain(value, locationsById).map((l) => l.name).join(' → ');

  return (
    <div className="tree-panel location-picker">
      <div className="tree-panel-title">Выбрано: {selectedPath || '—'}</div>
      <div className="tree-search">
        <input
          type="text"
          placeholder="Поиск локации по названию..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          // Enter в поиске не должен отправлять форму редактирования
          onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
        />
        {isSearching && (
          <button type="button" className="tree-search-clear" onClick={() => setSearchQuery('')} title="Очистить поиск">
            ✕
          </button>
        )}
      </div>
      <div className="tree-scroll">
        {roots.map((l) => renderLocation(l, 0))}
        {roots.length === 0 && (
          <div className="tree-empty">
            {isSearching ? `По запросу «${searchQuery}» ничего не найдено` : 'Локаций нет — сначала создайте локацию'}
          </div>
        )}
      </div>
    </div>
  );
}
