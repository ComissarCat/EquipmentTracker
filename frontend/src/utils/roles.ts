// Роли системы (имена — как на сервере) и их подписи в интерфейсе
export const ALL_ROLES = ['Viewer', 'Operator', 'Administrator'];

const ROLE_LABELS: Record<string, string> = {
  Viewer: 'Только чтение',
  Operator: 'Оператор',
  Administrator: 'Администратор'
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}
