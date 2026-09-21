import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import type { RepairListItem } from '../types';
import { formatIsoDate, formatModified } from '../utils/dates';

const PAGE_SIZE = 100;
const SEARCH_DEBOUNCE_MS = 300;

// Полный список ремонтов по всей технике — только просмотр (доступен любой роли).
// Поиск выполняется на сервере: слова через пробел, каждое должно встретиться (без учёта регистра)
// в технике (тип, наименование, серийный/инвентарный номер), операциях, расходных частях,
// примечании или логине того, кто зафиксировал ремонт.
export function RepairsPage() {
  const [items, setItems] = useState<RepairListItem[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Небольшая задержка, чтобы не слать запрос на каждый введённый символ
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchPage = useCallback(
    async (pageToLoad: number) => {
      const res = await apiClient.get<RepairListItem[]>('/api/repairs', {
        params: {
          page: pageToLoad,
          pageSize: PAGE_SIZE,
          ...(search ? { search } : {}),
          ...(from ? { from } : {}),
          ...(to ? { to } : {})
        }
      });
      setItems((prev) => (pageToLoad === 1 ? res.data : [...prev, ...res.data]));
      setHasMore(res.data.length === PAGE_SIZE);
      setPage(pageToLoad);
    },
    [search, from, to]
  );

  useEffect(() => {
    setLoading(true);
    fetchPage(1)
      .catch(() => setError('Не удалось загрузить список ремонтов'))
      .finally(() => setLoading(false));
  }, [fetchPage]);

  return (
    <div className="page">
      <h1>Ремонты</h1>
      {error && <div className="error-banner" onClick={() => setError(null)}>{error}</div>}

      <div className="inline-form" style={{ flexWrap: 'wrap' }}>
        <input
          type="search"
          placeholder="Поиск: техника, номер, операция, часть, примечание, автор..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          style={{ flex: 1, minWidth: 260 }}
        />
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
              <th>Техника</th>
              <th>Инв. номер</th>
              <th>Операции</th>
              <th>Расходные части</th>
              <th>Примечание</th>
              <th>Зафиксировал</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id}>
                <td>{formatIsoDate(r.date)}</td>
                <td>
                  <Link to={`/equipment-units/${r.equipmentUnitId}`}>{r.equipmentUnitTitle}</Link>
                </td>
                <td>{r.inventoryNumber || '—'}</td>
                <td>{r.operations.length > 0 ? r.operations.map((o) => o.name).join(', ') : '—'}</td>
                <td>{r.parts.length > 0 ? r.parts.map((p) => `${p.name} × ${p.quantity}`).join(', ') : '—'}</td>
                <td style={{ whiteSpace: 'pre-wrap' }}>{r.note || '—'}</td>
                <td>
                  {r.accountLogin}
                  {r.modifiedUtc && <div className="muted">{formatModified(r.modifiedByLogin, r.modifiedUtc)}</div>}
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 16 }}>
                  Ремонтов не найдено
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="detail-actions">
          <button onClick={() => fetchPage(page + 1).catch(() => setError('Не удалось загрузить список ремонтов'))}>
            Показать ещё
          </button>
        </div>
      )}
    </div>
  );
}
