import React, { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../api/client';
import type { EquipmentName, HistoryEntry, LocationItem } from '../types';

const ENTITY_TYPE_LABELS: Record<string, string> = {
  Location: 'Локация',
  EquipmentType: 'Тип техники',
  EquipmentName: 'Наименование техники',
  EquipmentUnit: 'Единица техники'
};

const ACTION_LABELS: Record<string, string> = {
  Created: 'Создание',
  Updated: 'Изменение',
  Deleted: 'Удаление'
};

// Русские подписи для технических имён полей моделей
const FIELD_LABELS: Record<string, string> = {
  Name: 'Название',
  ParentLocationId: 'Родительская локация',
  EquipmentTypeId: 'Тип техники',
  EquipmentNameId: 'Наименование техники',
  SerialNumber: 'Серийный номер',
  InventoryNumber: 'Инвентарный номер',
  Note: 'Примечание',
  LocationId: 'Локация'
};

// Поля-идентификаторы, для которых стоит попытаться подставить человекочитаемое название вместо ID
const ID_LOOKUP_FIELDS = new Set(['ParentLocationId', 'LocationId', 'EquipmentNameId']);

interface ParsedField {
  field: string;
  value: string;
}

interface ParsedEntry {
  before: ParsedField[];
  after: ParsedField[];
}

function formatValue(fieldName: string, raw: unknown, locationsById: Map<number, string>, namesById: Map<number, string>): string {
  if (raw === null || raw === undefined) return '—';
  if (fieldName === 'ParentLocationId' || fieldName === 'LocationId') {
    const id = Number(raw);
    return locationsById.get(id) ?? `#${raw}`;
  }
  if (fieldName === 'EquipmentNameId') {
    const id = Number(raw);
    return namesById.get(id) ?? `#${raw}`;
  }
  return String(raw);
}

function parseHistoryEntry(
  entry: HistoryEntry,
  locationsById: Map<number, string>,
  namesById: Map<number, string>
): ParsedEntry {
  let payload: Record<string, any>;
  try {
    payload = JSON.parse(entry.changesJson);
  } catch {
    return { before: [], after: [] };
  }

  const fields = Object.keys(payload).filter((f) => f !== 'Id');

  if (entry.action === 'Updated') {
    const before: ParsedField[] = [];
    const after: ParsedField[] = [];
    for (const f of fields) {
      const label = FIELD_LABELS[f] ?? f;
      const change = payload[f];
      before.push({ field: label, value: formatValue(f, change?.old, locationsById, namesById) });
      after.push({ field: label, value: formatValue(f, change?.new, locationsById, namesById) });
    }
    return { before, after };
  }

  if (entry.action === 'Created') {
    const after = fields.map((f) => ({ field: FIELD_LABELS[f] ?? f, value: formatValue(f, payload[f], locationsById, namesById) }));
    return { before: [], after };
  }

  // Deleted — показываем состояние объекта на момент удаления в столбце "Было"
  const before = fields.map((f) => ({ field: FIELD_LABELS[f] ?? f, value: formatValue(f, payload[f], locationsById, namesById) }));
  return { before, after: [] };
}

function FieldList({ items }: { items: ParsedField[] }) {
  if (items.length === 0) return <span className="muted">—</span>;
  return (
    <div className="history-fields">
      {items.map((it, i) => (
        <div key={i} className="history-field-row">
          <span className="history-field-name">{it.field}:</span> <span>{it.value}</span>
        </div>
      ))}
    </div>
  );
}

export function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [equipmentNames, setEquipmentNames] = useState<EquipmentName[]>([]);
  const [entityType, setEntityType] = useState('');
  const [searchText, setSearchText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const [historyRes, locRes, namesRes] = await Promise.all([
      apiClient.get<HistoryEntry[]>('/api/history', {
        // Берём с запасом, т.к. поиск по тексту ниже выполняется на клиенте среди загруженной страницы
        params: { pageSize: 200, ...(entityType ? { entityType } : {}) }
      }),
      apiClient.get<LocationItem[]>('/api/locations'),
      apiClient.get<EquipmentName[]>('/api/equipment-names')
    ]);
    setEntries(historyRes.data);
    setLocations(locRes.data);
    setEquipmentNames(namesRes.data);
  };

  useEffect(() => {
    load().catch(() => setError('Не удалось загрузить историю'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType]);

  const locationsById = useMemo(() => new Map(locations.map((l) => [l.id, l.name])), [locations]);
  const namesById = useMemo(() => new Map(equipmentNames.map((n) => [n.id, `${n.equipmentTypeName} / ${n.name}`])), [equipmentNames]);

  const parsedEntries = useMemo(
    () => entries.map((h) => ({ entry: h, parsed: parseHistoryEntry(h, locationsById, namesById) })),
    [entries, locationsById, namesById]
  );

  const filteredEntries = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return parsedEntries;
    return parsedEntries.filter(({ entry, parsed }) => {
      const haystack = [
        entry.accountLogin,
        String(entry.entityId),
        ENTITY_TYPE_LABELS[entry.entityType] ?? entry.entityType,
        ACTION_LABELS[entry.action] ?? entry.action,
        ...parsed.before.map((f) => `${f.field} ${f.value}`),
        ...parsed.after.map((f) => `${f.field} ${f.value}`)
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [parsedEntries, searchText]);

  return (
    <div className="page">
      <h1>История редактирования</h1>
      {error && <div className="error-banner" onClick={() => setError(null)}>{error}</div>}

      <div className="inline-form">
        <label>
          Тип сущности:{' '}
          <select value={entityType} onChange={(e) => setEntityType(e.target.value)}>
            <option value="">Все</option>
            {Object.entries(ENTITY_TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <input
          type="text"
          placeholder="Поиск по пользователю, полю, значению..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ flex: 1, minWidth: 220 }}
        />
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Дата/время (UTC)</th>
              <th>Пользователь</th>
              <th>Сущность</th>
              <th>ID</th>
              <th>Действие</th>
              <th>Было</th>
              <th>Стало</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.map(({ entry: h, parsed }) => (
              <tr key={h.id}>
                <td>{new Date(h.timestampUtc).toLocaleString('ru-RU')}</td>
                <td>{h.accountLogin}</td>
                <td>{ENTITY_TYPE_LABELS[h.entityType] ?? h.entityType}</td>
                <td>{h.entityId}</td>
                <td>{ACTION_LABELS[h.action] ?? h.action}</td>
                <td><FieldList items={parsed.before} /></td>
                <td><FieldList items={parsed.after} /></td>
              </tr>
            ))}
            {filteredEntries.length === 0 && (
              <tr>
                <td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 16 }}>
                  Ничего не найдено
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
