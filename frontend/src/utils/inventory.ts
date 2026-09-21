import type { EquipmentUnit, LocationItem } from '../types';

// Процент завершённости (целая часть: 100% показывается только когда подтверждено всё)
export function percentOf(confirmed: number, total: number): number {
  if (total <= 0) return 100;
  return Math.floor((confirmed * 100) / total);
}

export interface LocationInventoryStatus {
  total: number; // всего единиц техники внутри (включая вложенные локации)
  unconfirmed: number; // из них неподтверждённых
}

// Для каждой локации — сколько техники внутри (рекурсивно) и сколько из неё не подтверждено.
// Локации без техники внутри в результат не попадают.
export function computeLocationStatus(
  locations: LocationItem[],
  units: EquipmentUnit[],
  confirmedIds: { has: (id: number) => boolean }
): Map<number, LocationInventoryStatus> {
  const childrenOf = new Map<number | null, number[]>();
  for (const l of locations) {
    const list = childrenOf.get(l.parentLocationId) ?? [];
    list.push(l.id);
    childrenOf.set(l.parentLocationId, list);
  }
  const ownUnits = new Map<number, EquipmentUnit[]>();
  for (const u of units) {
    const list = ownUnits.get(u.locationId) ?? [];
    list.push(u);
    ownUnits.set(u.locationId, list);
  }

  const result = new Map<number, LocationInventoryStatus>();
  const visit = (id: number): LocationInventoryStatus => {
    let total = 0;
    let unconfirmed = 0;
    for (const u of ownUnits.get(id) ?? []) {
      total++;
      if (!confirmedIds.has(u.id)) unconfirmed++;
    }
    for (const childId of childrenOf.get(id) ?? []) {
      const s = visit(childId);
      total += s.total;
      unconfirmed += s.unconfirmed;
    }
    const status = { total, unconfirmed };
    if (total > 0) result.set(id, status);
    return status;
  };
  for (const rootId of childrenOf.get(null) ?? []) visit(rootId);
  return result;
}

// Все единицы техники, затронутые выделением: выбранные единицы + вся техника в выбранных локациях
// (включая вложенные). Возвращает id единиц без повторов.
export function unitIdsInSelection(
  selectedUnitIds: number[],
  selectedLocationIds: number[],
  locations: LocationItem[],
  units: EquipmentUnit[]
): number[] {
  const childrenOf = new Map<number, number[]>();
  for (const l of locations) {
    if (l.parentLocationId === null) continue;
    const list = childrenOf.get(l.parentLocationId) ?? [];
    list.push(l.id);
    childrenOf.set(l.parentLocationId, list);
  }
  const locationSet = new Set<number>();
  const stack = [...selectedLocationIds];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (locationSet.has(id)) continue;
    locationSet.add(id);
    for (const kid of childrenOf.get(id) ?? []) stack.push(kid);
  }
  const ids = new Set<number>(selectedUnitIds);
  for (const u of units) if (locationSet.has(u.locationId)) ids.add(u.id);
  return Array.from(ids);
}
