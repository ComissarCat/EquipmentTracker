import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import type { InventorySummary } from '../types';
import { percentOf } from '../utils/inventory';

const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('ru-RU');

// Список инвентаризаций (доступен всем ролям). Администратор запускает новую (одновременно идёт
// не более одной) и может остановить идущую. Итоги каждой — по ссылке «Итоги».
export function InventoriesPage() {
  const { isAdministrator } = useAuth();
  const [items, setItems] = useState<InventorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get<InventorySummary[]>('/api/inventories');
      setItems(res.data);
    } catch {
      setError('Не удалось загрузить список инвентаризаций');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const active = items.find((i) => i.isActive) ?? null;

  const start = async () => {
    if (!window.confirm('Запустить новую инвентаризацию? Вся текущая техника станет неподтверждённой.')) return;
    setBusy(true);
    try {
      await apiClient.post('/api/inventories');
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Не удалось запустить инвентаризацию');
    } finally {
      setBusy(false);
    }
  };

  const stop = async (inv: InventorySummary) => {
    const left = inv.totalUnits - inv.confirmedUnits;
    if (
      !window.confirm(
        `Остановить инвентаризацию? Индикация и кнопки подтверждения исчезнут, итоги сохранятся ` +
          `(не подтверждено: ${left} из ${inv.totalUnits}). Возобновить её будет нельзя.`
      )
    )
      return;
    setBusy(true);
    try {
      await apiClient.post(`/api/inventories/${inv.id}/stop`);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Не удалось остановить инвентаризацию');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <h1>Инвентаризации</h1>
      {error && <div className="error-banner" onClick={() => setError(null)}>{error}</div>}

      {isAdministrator && !active && (
        <div className="toolbar">
          <button onClick={start} disabled={busy}>Запустить инвентаризацию</button>
        </div>
      )}

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Начало</th>
              <th>Окончание</th>
              <th>Статус</th>
              <th>Завершённость</th>
              <th>Запустил</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((inv) => {
              const percent = percentOf(inv.confirmedUnits, inv.totalUnits);
              return (
                <tr key={inv.id}>
                  <td>{fmtDateTime(inv.startedUtc)}</td>
                  <td>{inv.endedUtc ? fmtDateTime(inv.endedUtc) : '—'}</td>
                  <td>{inv.isActive ? 'Идёт' : 'Остановлена'}</td>
                  <td>
                    <span className="progress" title={`${percent}%`}>
                      <span style={{ width: `${percent}%` }} />
                    </span>
                    {percent}% ({inv.confirmedUnits} из {inv.totalUnits})
                  </td>
                  <td>{inv.startedByLogin}</td>
                  <td>
                    <Link to={`/inventories/${inv.id}`}>Итоги</Link>
                    {isAdministrator && inv.isActive && (
                      <button onClick={() => stop(inv)} disabled={busy} style={{ marginLeft: 8 }}>
                        Остановить
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 16 }}>
                  Инвентаризаций ещё не было
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
