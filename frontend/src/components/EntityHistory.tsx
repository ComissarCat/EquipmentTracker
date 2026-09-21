import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../api/client';
import type { EquipmentName, HistoryEntry, LocationItem } from '../types';
import { ACTION_LABELS, FieldList, parseHistoryEntry } from '../utils/historyFormat';

// История изменений одной сущности (например, карточки единицы техники) — тот же формат
// «было/стало», что и на общей странице истории.
export function EntityHistory(props: {
  entityType: string;
  entityId: number;
  locations: LocationItem[];
  equipmentNames: EquipmentName[];
  // Меняется при изменении карточки — перезагружает историю
  refreshKey?: unknown;
}) {
  const { entityType, entityId, locations, equipmentNames, refreshKey } = props;
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<HistoryEntry[]>('/api/history', { params: { entityType, entityId, pageSize: 200 } })
      .then((res) => setEntries(res.data))
      .catch(() => setError('Не удалось загрузить историю изменений'));
  }, [entityType, entityId, refreshKey]);

  const locationsById = useMemo(() => new Map(locations.map((l) => [l.id, l.name])), [locations]);
  const namesById = useMemo(
    () => new Map(equipmentNames.map((n) => [n.id, `${n.equipmentTypeName} / ${n.name}`])),
    [equipmentNames]
  );
  const rows = useMemo(
    () => entries.map((entry) => ({ entry, parsed: parseHistoryEntry(entry, locationsById, namesById) })),
    [entries, locationsById, namesById]
  );

  return (
    <details className="collapsible">
      <summary>История изменений <span className="muted">({entries.length})</span></summary>
      {error && <div className="error-text">{error}</div>}
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Дата/время</th>
              <th>Пользователь</th>
              <th>Действие</th>
              <th>Было</th>
              <th>Стало</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ entry, parsed }) => (
              <tr key={entry.id}>
                <td>{new Date(entry.timestampUtc).toLocaleString('ru-RU')}</td>
                <td>{entry.accountLogin}</td>
                <td>{ACTION_LABELS[entry.action] ?? entry.action}</td>
                <td><FieldList items={parsed.before} /></td>
                <td><FieldList items={parsed.after} /></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 16 }}>
                  Записей нет
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </details>
  );
}
