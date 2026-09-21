// Текущая локальная дата в формате yyyy-MM-dd (для <input type="date">)
export function todayLocalIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// yyyy-MM-dd → dd.MM.yyyy
export function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

// Пометка «изменено администратором» для записей, которые правили после создания
export function formatModified(login: string | null, utc: string | null): string | null {
  if (!utc) return null;
  return `изменено: ${login ?? '—'}, ${new Date(utc).toLocaleString('ru-RU')}`;
}
