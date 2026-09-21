import React from 'react';
import type { SparePart } from '../types';

export interface PartRow {
  key: number;
  sparePartId: number | '';
  quantity: string;
}

// Строки с непустой частью → тело запроса на списание
export function toPartRequests(rows: PartRow[]): { sparePartId: number; quantity: number }[] {
  return rows
    .filter((r) => r.sparePartId !== '')
    .map((r) => ({ sparePartId: r.sparePartId as number, quantity: Number(r.quantity) }));
}

export function hasInvalidQuantity(rows: PartRow[]): boolean {
  return rows.some((r) => r.sparePartId !== '' && !(Number(r.quantity) > 0));
}

// Общий редактор списываемых расходных частей для ремонта и выдачи: строки «часть + количество»
// и предупреждение о нехватке на складе. Предупреждение информационное — сохранению не мешает.
export function SparePartRowsEditor(props: {
  spareParts: SparePart[];
  rows: PartRow[];
  onChange: (rows: PartRow[]) => void;
}) {
  const { spareParts, rows, onChange } = props;

  const addRow = () => {
    const key = rows.reduce((max, r) => Math.max(max, r.key), 0) + 1;
    onChange([...rows, { key, sparePartId: '', quantity: '1' }]);
  };
  const updateRow = (key: number, patch: Partial<PartRow>) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const removeRow = (key: number) => onChange(rows.filter((r) => r.key !== key));

  // Суммируем строки с одной и той же частью и сравниваем с остатком
  const shortages = React.useMemo(() => {
    const requested = new Map<number, number>();
    for (const r of rows) {
      if (r.sparePartId === '') continue;
      const qty = Number(r.quantity);
      if (!(qty > 0)) continue;
      requested.set(r.sparePartId, (requested.get(r.sparePartId) ?? 0) + qty);
    }
    const result: { name: string; requested: number; inStock: number }[] = [];
    for (const [id, qty] of requested) {
      const part = spareParts.find((p) => p.id === id);
      if (part && qty > part.quantity) result.push({ name: part.name, requested: qty, inStock: part.quantity });
    }
    return result;
  }, [rows, spareParts]);

  return (
    <>
      {rows.map((row) => (
        <div key={row.key} className="part-row">
          <select
            value={row.sparePartId}
            onChange={(e) => updateRow(row.key, { sparePartId: e.target.value === '' ? '' : Number(e.target.value) })}
          >
            <option value="">— выберите —</option>
            {spareParts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} (на складе: {p.quantity})
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            step={1}
            value={row.quantity}
            onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
            style={{ width: 80 }}
          />
          <button type="button" onClick={() => removeRow(row.key)} title="Убрать">✕</button>
        </div>
      ))}
      <button type="button" onClick={addRow} disabled={spareParts.length === 0}>
        + Добавить часть
      </button>
      {shortages.length > 0 && (
        <div className="warning-text">
          Не хватает на складе (сохранить всё равно можно, остаток станет отрицательным):
          <ul>
            {shortages.map((s) => (
              <li key={s.name}>
                {s.name}: нужно {s.requested}, на складе {s.inStock}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
