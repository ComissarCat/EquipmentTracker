import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { SparePartIssueModal } from '../components/SparePartIssueModal';
import type { SparePart, SparePartWriteOff } from '../types';
import { formatIsoDate } from '../utils/dates';

const PAGE_SIZE = 100;

// История списаний расходных частей: и через ремонты, и через выдачи (одна таблица на сервере).
// Здесь же — кнопка «Выдать расходные части» для фиксации выдачи, не связанной с ремонтом.
export function WriteOffsPage() {
  const [items, setItems] = useState<SparePartWriteOff[]>([]);
  const [spareParts, setSpareParts] = useState<SparePart[]>([]);
  const [sparePartId, setSparePartId] = useState('');
  const [kind, setKind] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showIssueModal, setShowIssueModal] = useState(false);

  const fetchPage = useCallback(
    async (pageToLoad: number) => {
      const res = await apiClient.get<SparePartWriteOff[]>('/api/spare-part-write-offs', {
        params: {
          page: pageToLoad,
          pageSize: PAGE_SIZE,
          ...(sparePartId ? { sparePartId } : {}),
          ...(kind ? { kind } : {}),
          ...(from ? { from } : {}),
          ...(to ? { to } : {})
        }
      });
      setItems((prev) => (pageToLoad === 1 ? res.data : [...prev, ...res.data]));
      setHasMore(res.data.length === PAGE_SIZE);
      setPage(pageToLoad);
    },
    [sparePartId, kind, from, to]
  );

  const reload = useCallback(() => {
    fetchPage(1).catch(() => setError('Не удалось загрузить историю списаний'));
  }, [fetchPage]);

  useEffect(() => {
    apiClient
      .get<SparePart[]>('/api/spare-parts')
      .then((res) => setSpareParts(res.data))
      .catch(() => setError('Не удалось загрузить расходные части'));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <div className="page">
      <h1>Списания расходных частей</h1>
      {error && <div className="error-banner" onClick={() => setError(null)}>{error}</div>}

      <div className="toolbar">
        <button onClick={() => setShowIssueModal(true)}>Выдать расходные части</button>
      </div>

      <div className="inline-form" style={{ flexWrap: 'wrap' }}>
        <label>
          Часть:{' '}
          <select value={sparePartId} onChange={(e) => setSparePartId(e.target.value)}>
            <option value="">Все</option>
            {spareParts.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label>
          Основание:{' '}
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">Все</option>
            <option value="Repair">Ремонт</option>
            <option value="Issue">Выдача</option>
          </select>
        </label>
        <label>
          С: <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          По: <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Основание</th>
              <th>Расходная часть</th>
              <th>Количество</th>
              <th>Кому / на какую технику</th>
              <th>Кем зафиксировано</th>
            </tr>
          </thead>
          <tbody>
            {items.map((w) => (
              <tr key={w.id}>
                <td>{formatIsoDate(w.date)}</td>
                <td>{w.kind === 'Repair' ? 'Ремонт' : 'Выдача'}</td>
                <td>{w.sparePartName}</td>
                <td>{w.quantity}</td>
                <td>
                  {w.kind === 'Repair' ? (
                    <Link to={`/equipment-units/${w.equipmentUnitId}`}>{w.equipmentUnitTitle}</Link>
                  ) : (
                    w.recipient
                  )}
                </td>
                <td>{w.accountLogin}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 16 }}>
                  Списаний не найдено
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="detail-actions">
          <button onClick={() => fetchPage(page + 1).catch(() => setError('Не удалось загрузить историю списаний'))}>
            Показать ещё
          </button>
        </div>
      )}

      {showIssueModal && (
        <SparePartIssueModal
          onCancel={() => setShowIssueModal(false)}
          onSaved={() => {
            setShowIssueModal(false);
            reload();
            // остатки изменились — обновим список частей (в фильтре и т.п.)
            apiClient.get<SparePart[]>('/api/spare-parts').then((res) => setSpareParts(res.data)).catch(() => {});
          }}
        />
      )}
    </div>
  );
}
