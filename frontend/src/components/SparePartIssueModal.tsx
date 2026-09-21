import React, { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import type { SparePart, SparePartIssue } from '../types';
import { todayLocalIso } from '../utils/dates';
import { hasInvalidQuantity, SparePartRowsEditor, toPartRequests } from './SparePartRowsEditor';
import type { PartRow } from './SparePartRowsEditor';

// Диалог «Выдать расходные части» (не связано с ремонтом): дата, кому выдано (текст),
// одна или несколько частей. «Кем выдано» — текущий пользователь, проставляется на сервере.
// Наличие не проверяется — остаток может стать отрицательным.
// Если передан issue — режим изменения (только администратор): поля заполнены текущими значениями,
// остатки пересчитываются на разницу, доступно удаление выдачи (всё выданное вернётся на склад).
export function SparePartIssueModal(props: {
  issue?: SparePartIssue;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { issue } = props;
  const [spareParts, setSpareParts] = useState<SparePart[]>([]);
  const [date, setDate] = useState(issue?.date ?? todayLocalIso());
  const [recipient, setRecipient] = useState(issue?.recipient ?? '');
  const [partRows, setPartRows] = useState<PartRow[]>(
    issue
      ? issue.parts.map((p, i) => ({ key: i + 1, sparePartId: p.sparePartId, quantity: String(p.quantity) }))
      : [{ key: 1, sparePartId: '', quantity: '1' }]
  );
  const alreadyWrittenOff = React.useMemo(
    () => new Map((issue?.parts ?? []).map((p) => [p.sparePartId, p.quantity] as [number, number])),
    [issue]
  );
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
      const body = { date, recipient, parts };
      if (issue) await apiClient.put(`/api/spare-part-issues/${issue.id}`, body);
      else await apiClient.post('/api/spare-part-issues', body);
      props.onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.message || (issue ? 'Не удалось изменить выдачу' : 'Не удалось зафиксировать выдачу'));
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!issue) return;
    if (!window.confirm('Удалить выдачу целиком? Выданные части вернутся на склад.')) return;
    setSaving(true);
    try {
      await apiClient.delete(`/api/spare-part-issues/${issue.id}`);
      props.onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Не удалось удалить выдачу');
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <form className="modal modal-wide" onSubmit={submit}>
        <h2>{issue ? 'Изменить выдачу' : 'Выдать расходные части'}</h2>

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
          <SparePartRowsEditor
            spareParts={spareParts}
            rows={partRows}
            onChange={setPartRows}
            alreadyWrittenOff={alreadyWrittenOff}
          />
        </fieldset>

        {error && <div className="error-text">{error}</div>}
        <div className="modal-actions">
          {issue && (
            <button type="button" onClick={remove} disabled={saving} style={{ marginRight: 'auto' }}>
              Удалить выдачу
            </button>
          )}
          <button type="button" onClick={props.onCancel}>Отмена</button>
          <button type="submit" disabled={saving}>{issue ? 'Сохранить' : 'Выдать'}</button>
        </div>
      </form>
    </div>
  );
}
