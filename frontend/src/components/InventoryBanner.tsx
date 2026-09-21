import { Link } from 'react-router-dom';
import type { InventorySummary } from '../types';
import { percentOf } from '../utils/inventory';

// Плашка «идёт инвентаризация» для главной страницы и карточек техники
export function InventoryBanner({ inventory }: { inventory: InventorySummary }) {
  const percent = percentOf(inventory.confirmedUnits, inventory.totalUnits);
  return (
    <div className="inventory-banner">
      <strong>Идёт инвентаризация</strong>, запущена {new Date(inventory.startedUtc).toLocaleDateString('ru-RU')}.
      Подтверждено {inventory.confirmedUnits} из {inventory.totalUnits} ({percent}%).{' '}
      <Link to={`/inventories/${inventory.id}`}>Подробнее</Link>
    </div>
  );
}
