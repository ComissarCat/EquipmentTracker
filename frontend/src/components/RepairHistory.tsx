import type { Repair } from '../types';
import { formatIsoDate, formatModified } from '../utils/dates';

// История ремонтов единицы техники (новые сверху). Для администратора (canEdit) — кнопки
// изменения и удаления ремонта.
export function RepairHistory(props: {
  repairs: Repair[];
  canEdit?: boolean;
  onEdit?: (repair: Repair) => void;
  onDelete?: (repair: Repair) => void;
}) {
  const { repairs, canEdit, onEdit, onDelete } = props;
  return (
    <details className="collapsible" open>
      <summary>История ремонтов <span className="muted">({repairs.length})</span></summary>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Операции</th>
              <th>Расходные части</th>
              <th>Примечание</th>
              <th>Зафиксировал</th>
              {canEdit && <th></th>}
            </tr>
          </thead>
          <tbody>
            {repairs.map((r) => (
              <tr key={r.id}>
                <td>{formatIsoDate(r.date)}</td>
                <td>{r.operations.length > 0 ? r.operations.map((o) => o.name).join(', ') : '—'}</td>
                <td>{r.parts.length > 0 ? r.parts.map((p) => `${p.name} × ${p.quantity}`).join(', ') : '—'}</td>
                <td style={{ whiteSpace: 'pre-wrap' }}>{r.note || '—'}</td>
                <td>
                  {r.accountLogin}
                  {r.modifiedUtc && <div className="muted">{formatModified(r.modifiedByLogin, r.modifiedUtc)}</div>}
                </td>
                {canEdit && (
                  <td>
                    <button onClick={() => onEdit?.(r)}>Изменить</button>
                    <button onClick={() => onDelete?.(r)}>Удалить</button>
                  </td>
                )}
              </tr>
            ))}
            {repairs.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 6 : 5} className="muted" style={{ textAlign: 'center', padding: 16 }}>
                  Ремонтов не зафиксировано
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </details>
  );
}
