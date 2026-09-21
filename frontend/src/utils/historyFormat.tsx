import React from 'react';
import type { HistoryEntry } from '../types';

export const ENTITY_TYPE_LABELS: Record<string, string> = {
  Location: 'Локация',
  EquipmentType: 'Тип техники',
  EquipmentName: 'Наименование техники',
  EquipmentUnit: 'Единица техники',
  RepairOperation: 'Ремонтная операция',
  SparePart: 'Расходная часть'
};

export const ACTION_LABELS: Record<string, string> = {
  Created: 'Создание',
  Updated: 'Изменение',
  Deleted: 'Удаление'
};

// Русские подписи для технических имён полей моделей
export const FIELD_LABELS: Record<string, string> = {
  Name: 'Название',
  ParentLocationId: 'Родительская локация',
  EquipmentTypeId: 'Тип техники',
  EquipmentNameId: 'Наименование техники',
  SerialNumber: 'Серийный номер',
  InventoryNumber: 'Инвентарный номер',
  Note: 'Примечание',
  LocationId: 'Локация',
  Quantity: 'Количество'
};

// Поля-идентификаторы, для которых стоит попытаться подставить человекочитаемое название вместо ID
const ID_LOOKUP_FIELDS = new Set(['ParentLocationId', 'LocationId', 'EquipmentNameId']);

export interface ParsedField {
  field: string;
  value: string;
}

export interface ParsedEntry {
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

export function parseHistoryEntry(
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

export function FieldList({ items }: { items: ParsedField[] }) {
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
