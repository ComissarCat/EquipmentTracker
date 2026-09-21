import React, { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import type { RepairOperation, SparePart } from '../types';

function todayLocalIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

interface PartRow {
  key: number;
  sparePartId: number | '';
  quantity: string;
}

// Диалог «Зафиксировать ремонт»: дата (по умолчанию сегодня), любое число операций и
// расходных частей, примечание. Наличие частей не проверяется — остаток может стать отрицательным.
export function RepairModal(props: { unitId: number; onCancel: () => void; onSaved: () => void }) {
  const [operations, setOperations] = useState<RepairOperation[]>([]);
  const [spareParts, setSpareParts] = useState<SparePart[]>([]);
  const [date, setDate] = useState(todayLocalIso());
  const [selectedOps, setSelectedOps] = useState<Set<number>>(new Set());
  const [partRows, setPartRows] = useState<PartRow[]>([]);
  const [nextKey, setNextKey] = useState(1);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiClient.get<RepairOperation[]>('/api/repair-operations'),
      apiClient.get<SparePart[]>('/api/spare-parts')
    ])
      .then(([opsRes, partsRes]) => {
        setOperations(opsRes.data);
        setSpareParts(partsRes.data);
      })
      .catch(() => setError('Не удалось загрузить справочники'));
  }, []);

  const toggleOp = (id: number) =>
    setSelectedOps((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const addPartRow = () => {
    setPartRows((rows) => [...rows, { key: nextKey, sparePartId: '', quantity: '1' }]);
    setNextKey((k) => k + 1);
  };
  const updatePartRow = (key: number, patch: Partial<PartRow>) =>
    setPartRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const removePartRow = (key: number) => setPartRows((rows) => rows.filter((r) => r.key !== key));

  // Предупреждение о нехватке: суммируем строки с одной и той же частью и сравниваем с остатком.
  // Носит информационный характер — сохранению ремонта не мешает.
  const shortages = React.useMemo(() => {
    const requested = new Map<number, number>();
    for (const r of partRows) {
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
  }, [partRows, spareParts]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedOps.size === 0) {
      setError('Выберите хотя бы одну ремонтную операцию');
      return;
    }
    const parts = partRows.filter((r) => r.sparePartId !== '');
    if (parts.some((r) => !(Number(r.quantity) > 0))) {
      setError('Количество расходной части должно быть больше нуля');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiClient.post(`/api/equipment-units/${props.unitId}/repairs`, {
        date,
        operationIds: Array.from(selectedOps),
        parts: parts.map((r) => ({ sparePartId: r.sparePartId, quantity: Number(r.quantity) })),
        note: note || null
      });
      props.onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Не удалось зафиксировать ремонт');
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <form className="modal modal-wide" onSubmit={submit}>
        <h2>Зафиксировать ремонт</h2>

        <label>
          Дата ремонта
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>

        <fieldset>
          <legend>Выполненные операции (обязательно)</legend>
          {operations.length === 0 && <span className="muted">Справочник ремонтных операций пуст</span>}
          <div className="check-list">
            {operations.map((o) => (
              <label key={o.id} className="checkbox-label">
                <input type="checkbox" checked={selectedOps.has(o.id)} onChange={() => toggleOp(o.id)} />
                {o.name}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>Израсходованные части</legend>
          {partRows.map((row) => (
            <div key={row.key} className="part-row">
              <select
                value={row.sparePartId}
                onChange={(e) => updatePartRow(row.key, { sparePartId: e.target.value === '' ? '' : Number(e.target.value) })}
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
                onChange={(e) => updatePartRow(row.key, { quantity: e.target.value })}
                style={{ width: 80 }}
              />
              <button type="button" onClick={() => removePartRow(row.key)} title="Убрать">✕</button>
            </div>
          ))}
          <button type="button" onClick={addPartRow} disabled={spareParts.length === 0}>
            + Добавить часть
          </button>
          {shortages.length > 0 && (
            <div className="warning-text">
              Не хватает на складе (ремонт всё равно можно сохранить, остаток станет отрицательным):
              <ul>
                {shortages.map((s) => (
                  <li key={s.name}>
                    {s.name}: нужно {s.requested}, на складе {s.inStock}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </fieldset>

        <label>
          Примечание
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
        </label>

        {error && <div className="error-text">{error}</div>}
        <div className="modal-actions">
          <button type="button" onClick={props.onCancel}>Отмена</button>
          <button type="submit" disabled={saving}>Зафиксировать</button>
        </div>
      </form>
    </div>
  );
}
