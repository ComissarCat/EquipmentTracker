import React, { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import type { RepairOperation, SparePart } from '../types';
import { todayLocalIso } from '../utils/dates';
import { hasInvalidQuantity, SparePartRowsEditor, toPartRequests } from './SparePartRowsEditor';
import type { PartRow } from './SparePartRowsEditor';

// Диалог «Зафиксировать ремонт»: дата (по умолчанию сегодня), хотя бы одна операция,
// любое число расходных частей (необязательно), примечание (необязательно).
// Наличие частей не проверяется — остаток может стать отрицательным.
export function RepairModal(props: { unitId: number; onCancel: () => void; onSaved: () => void }) {
  const [operations, setOperations] = useState<RepairOperation[]>([]);
  const [spareParts, setSpareParts] = useState<SparePart[]>([]);
  const [date, setDate] = useState(todayLocalIso());
  const [selectedOps, setSelectedOps] = useState<Set<number>>(new Set());
  const [partRows, setPartRows] = useState<PartRow[]>([]);
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedOps.size === 0) {
      setError('Выберите хотя бы одну ремонтную операцию');
      return;
    }
    if (hasInvalidQuantity(partRows)) {
      setError('Количество расходной части должно быть больше нуля');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiClient.post(`/api/equipment-units/${props.unitId}/repairs`, {
        date,
        operationIds: Array.from(selectedOps),
        parts: toPartRequests(partRows),
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
          <SparePartRowsEditor spareParts={spareParts} rows={partRows} onChange={setPartRows} />
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
