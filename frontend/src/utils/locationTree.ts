import type { LocationItem } from '../types';

// Полная цепочка локаций от корня до данной (включительно), используется и для
// текстового пути ("Здание → Кабинет → Комплект"), и для определения глубины узла.
export function ancestorChain(locationId: number, locationsById: Map<number, LocationItem>): LocationItem[] {
  const chain: LocationItem[] = [];
  let cur = locationsById.get(locationId);
  while (cur) {
    chain.unshift(cur);
    cur = cur.parentLocationId !== null ? locationsById.get(cur.parentLocationId) : undefined;
  }
  return chain;
}

// Глубина узла: 0 для корневых локаций (без родителя)
export function depthOf(locationId: number, locationsById: Map<number, LocationItem>): number {
  return ancestorChain(locationId, locationsById).length - 1;
}

export function fullPath(locationId: number, locationsById: Map<number, LocationItem>): string {
  return ancestorChain(locationId, locationsById)
    .map((l) => l.name)
    .join(' → ');
}

// Список глубин, присутствующих среди локаций (для выпадающих списков в модалке карточек),
// вместе с примером локации на каждой глубине для показа пользователю.
export function distinctDepthExamples(
  locations: LocationItem[],
  locationsById: Map<number, LocationItem>
): { depth: number; example: LocationItem }[] {
  const byDepth = new Map<number, LocationItem>();
  for (const l of locations) {
    const d = depthOf(l.id, locationsById);
    if (!byDepth.has(d)) byDepth.set(d, l);
  }
  return Array.from(byDepth.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([depth, example]) => ({ depth, example }));
}
