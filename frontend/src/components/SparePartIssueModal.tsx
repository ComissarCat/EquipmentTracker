import React, { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import type { SparePart } from '../types';
import { todayLocalIso } from '../utils/dates';
import { hasInvalidQuantity, SparePartRowsEditor, toPartRequests } from './SparePartRowsEditor';
import type { PartRow } from './SparePartRowsEditor';

// Диалог «Выдать расходные части» (не связано с ремонтом): дата, кому выдано (текст),
// одна или несколько частей. «Кем выдано» — текущий пользователь, проставляется на сервере.
// Наличие не проверяется — остаток может стать отрицательным.
export function SparePartIssueModal(props: { onCancel: () => void; onSaved: () => void }) {
  const [spareParts, setSpareParts] = useState<SparePart[]>([]);
  const [date, setDate] = useState(todayLocalIso());
  const [recipient, setRecipient] = useState('');
  const [partRows, setPartRows] = useState<PartRow[]>([{ key: 1, sparePartId: '', quantity: '1' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<SparePart[]>('/api/spare-parts')
      .then((res) => setSpareParts(res.data))
      .catch(() => setError('Не удалось загрузить расходные части'));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parts = toPartRequests(partRows);
    if (parts.length === 0) {
      setError('Выберите хотя бы одну расходную часть');
      return;
    }
    if (hasInvalidQuantity(partRows)) {
      setError('Количество должно быть больше нуля');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiClient.post('/api/spare-part-issues', { date, recipient, parts });
      props.onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Не удалось зафиксировать выдачу');
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <form className="modal modal-wide" onSubmit={submit}>
        <h2>Выдать расходные части</h2>

        <label>
          Дата выдачи
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>

        <label>
          Кому выдано
          <input value={recipient} onChange={(e) => setRecipient(e.target.value)} required autoFocus />
        </label>

        <fieldset>
          <legend>Что выдано</legend>
          <SparePartRowsEditor spareParts={spareParts} rows={partRows} onChange={setPartRows} />
        </fieldset>

        {error && <div className="error-text">{error}</div>}
        <div className="modal-actions">
          <button type="button" onClick={props.onCancel}>Отмена</button>
          <button type="submit" disabled={saving}>Выдать</button>
        </div>
      </form>
    </div>
  );
}
