import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import type { InventoryDetails } from '../types';
import { downloadBlob, extractErrorMessage } from '../utils/download';
import { percentOf } from '../utils/inventory';

const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('ru-RU');

function timestampSuffix(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

// Итоги инвентаризации: сколько подтверждено/не подтверждено, список неподтверждённой техники
// и выгрузка этого списка в Excel (в том же формате, что список техники на странице «Экспорт»).
// Для остановленной инвентаризации данные заморожены на момент остановки.
export function InventoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const inventoryId = Number(id);
  const [details, setDetails] = useState<InventoryDetails | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    apiClient
      .get<InventoryDetails>(`/api/inventories/${inventoryId}`)
      .then((res) => setDetails(res.data))
      .catch((err) => {
        if (err?.response?.status === 404) setNotFound(true);
        else setError('Не удалось загрузить итоги инвентаризации');
      });
  }, [inventoryId]);

  const exportUnresolved = async () => {
    setExporting(true);
    setError(null);
    try {
      const res = await apiClient.get(`/api/export/inventories/${inventoryId}/unresolved`, { responseType: 'blob' });
      downloadBlob(res.data, `inventarizaciya-${inventoryId}-nepodtverzhdennaya-tehnika-${timestampSuffix()}.xlsx`);
    } catch (err: any) {
      setError(await extractErrorMessage(err, 'Не удалось сформировать файл'));
    } finally {
      setExporting(false);
    }
  };

  if (notFound) {
    return (
      <div className="page">
        <p>Инвентаризация не найдена.</p>
        <Link to="/inventories">← К списку инвентаризаций</Link>
      </div>
    );
  }
  if (!details) {
    return (
      <div className="page">
        {error ? <div className="error-banner">{error}</div> : 'Загрузка...'}
        <Link to="/inventories">← К списку инвентаризаций</Link>
      </div>
    );
  }

  const inv = details.inventory;
  const unconfirmed = inv.totalUnits - inv.confirmedUnits;
  const percent = percentOf(inv.confirmedUnits, inv.totalUnits);

  return (
    <div className="page">
      <Link to="/inventories" className="back-link">← К списку инвентаризаций</Link>
      {error && <div className="error-banner" onClick={() => setError(null)}>{error}</div>}

      <h1>Инвентаризация от {new Date(inv.startedUtc).toLocaleDateString('ru-RU')}</h1>
      <p className="muted">
        Начало: {fmtDateTime(inv.startedUtc)} ({inv.startedByLogin}).{' '}
        {inv.isActive
          ? 'Инвентаризация идёт — данные ниже актуальны на текущий момент.'
          : `Окончание: ${inv.endedUtc ? fmtDateTime(inv.endedUtc) : '—'} (${inv.endedByLogin ?? '—'}).`}
      </p>

      <div className="stat-cards">
        <div className="stat-card">
          <div className="stat-value">{inv.totalUnits}</div>
          <div className="stat-label">всего техники</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{inv.confirmedUnits}</div>
          <div className="stat-label">подтверждено</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{unconfirmed}</div>
          <div className="stat-label">не подтверждено</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{percent}%</div>
          <div className="stat-label">завершённость</div>
        </div>
      </div>

      <h2>Неподтверждённая техника ({details.unresolved.length})</h2>
      <div className="toolbar">
        <button onClick={exportUnresolved} disabled={exporting || details.unresolved.length === 0}>
          {exporting ? 'Формирование...' : 'Excel: выгрузить список'}
        </button>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Локация</th>
              <th>Тип</th>
              <th>Наименование</th>
              <th>С/н</th>
              <th>И/н</th>
              <th>Примечание</th>
            </tr>
          </thead>
          <tbody>
            {details.unresolved.map((u, i) => (
              <tr key={u.equipmentUnitId ?? `s${i}`}>
                <td>{u.locationPath}</td>
                <td>{u.typeName}</td>
                <td>{u.name}</td>
                <td>
                  {inv.isActive && u.equipmentUnitId !== null ? (
                    <Link to={`/equipment-units/${u.equipmentUnitId}`}>{u.serialNumber}</Link>
                  ) : (
                    u.serialNumber
                  )}
                </td>
                <td>{u.inventoryNumber || '—'}</td>
                <td>{u.note || '—'}</td>
              </tr>
            ))}
            {details.unresolved.length === 0 && (
              <tr>
                <td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 16 }}>
                  Вся техника подтверждена
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
