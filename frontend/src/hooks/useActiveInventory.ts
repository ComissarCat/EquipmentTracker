import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../api/client';
import type { ActiveInventory, InventoryConfirmation, InventorySummary } from '../types';

export interface ActiveInventoryState {
  // Идущая инвентаризация или null, если её нет
  inventory: InventorySummary | null;
  // Подтверждённая в ней техника: id единицы → кто и когда подтвердил
  confirmations: Map<number, InventoryConfirmation>;
  refresh: () => Promise<void>;
}

// Состояние идущей инвентаризации для индикации в списках и карточках техники.
// refresh() нужно вызывать после действий, меняющих данные (подтверждение, добавление/удаление техники).
export function useActiveInventory(): ActiveInventoryState {
  const [data, setData] = useState<ActiveInventory>({ inventory: null, confirmations: [] });

  const refresh = useCallback(async () => {
    try {
      const res = await apiClient.get<ActiveInventory>('/api/inventories/active');
      setData(res.data);
    } catch {
      /* индикация инвентаризации не должна ломать основную работу страницы */
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const confirmations = useMemo(
    () => new Map(data.confirmations.map((c) => [c.equipmentUnitId, c] as [number, InventoryConfirmation])),
    [data.confirmations]
  );

  return { inventory: data.inventory, confirmations, refresh };
}
