import type { Repair } from '../types';

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

// История ремонтов единицы техники (новые сверху)
export function RepairHistory({ repairs }: { repairs: Repair[] }) {
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
            </tr>
          </thead>
          <tbody>
            {repairs.map((r) => (
              <tr key={r.id}>
                <td>{formatDate(r.date)}</td>
                <td>{r.operations.length > 0 ? r.operations.map((o) => o.name).join(', ') : '—'}</td>
                <td>{r.parts.length > 0 ? r.parts.map((p) => `${p.name} × ${p.quantity}`).join(', ') : '—'}</td>
                <td style={{ whiteSpace: 'pre-wrap' }}>{r.note || '—'}</td>
                <td>{r.accountLogin}</td>
              </tr>
            ))}
            {repairs.length === 0 && (
              <tr>
                <td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 16 }}>
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
