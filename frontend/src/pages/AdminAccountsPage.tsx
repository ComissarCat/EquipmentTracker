import React, { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import type { Account } from '../types';

const ALL_ROLES = ['Operator', 'Administrator'];

export function AdminAccountsPage() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Account | 'new' | null>(null);

  const load = async () => {
    const res = await apiClient.get<Account[]>('/api/accounts');
    setAccounts(res.data);
  };

  useEffect(() => {
    load().catch(() => setError('Не удалось загрузить список учётных записей'));
  }, []);

  const remove = async (id: number) => {
    if (!window.confirm('Удалить учётную запись?')) return;
    try {
      await apiClient.delete(`/api/accounts/${id}`);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Не удалось удалить учётную запись');
    }
  };

  return (
    <div className="page">
      <h1>Учётные записи</h1>
      {error && <div className="error-banner" onClick={() => setError(null)}>{error}</div>}
      <button onClick={() => setEditing('new')}>+ Новая учётная запись</button>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Логин</th>
              <th>ФИО</th>
              <th>Роли</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => {
              const isSelf = a.login === user?.login;
              return (
                <tr key={a.id}>
                  <td>{a.login}{isSelf && <span className="muted"> (это вы)</span>}</td>
                  <td>{a.fullName}</td>
                  <td>{a.roles.join(', ')}</td>
                  <td>
                    <button onClick={() => setEditing(a)}>Изменить</button>
                    <button
                      onClick={() => remove(a.id)}
                      disabled={isSelf}
                      title={isSelf ? 'Нельзя удалить собственную учётную запись' : undefined}
                    >
                      Удалить
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <AccountModal
          account={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSave={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function AccountModal(props: { account: Account | null; onCancel: () => void; onSave: () => Promise<void> }) {
  const isNew = props.account === null;
  const [login, setLogin] = useState(props.account?.login ?? '');
  const [fullName, setFullName] = useState(props.account?.fullName ?? '');
  const [password, setPassword] = useState('');
  const [roles, setRoles] = useState<string[]>(props.account?.roles ?? []);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const toggleRole = (role: string) => {
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        await apiClient.post('/api/accounts', { login, password, fullName, roles });
      } else {
        await apiClient.put(`/api/accounts/${props.account!.id}`, {
          fullName,
          roles,
          newPassword: password || null
        });
      }
      await props.onSave();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <form className="modal" onSubmit={submit}>
        <h2>{isNew ? 'Новая учётная запись' : `Редактирование: ${props.account!.login}`}</h2>
        <label>
          Логин
          <input value={login} onChange={(e) => setLogin(e.target.value)} disabled={!isNew} required autoFocus />
        </label>
        <label>
          ФИО
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </label>
        <label>
          {isNew ? 'Пароль' : 'Новый пароль (оставьте пустым, чтобы не менять)'}
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required={isNew} />
        </label>
        <fieldset>
          <legend>Роли</legend>
          {ALL_ROLES.map((role) => (
            <label key={role} className="checkbox-label">
              <input type="checkbox" checked={roles.includes(role)} onChange={() => toggleRole(role)} />
              {role === 'Operator' ? 'Оператор' : 'Администратор'}
            </label>
          ))}
        </fieldset>
        {error && <div className="error-text">{error}</div>}
        <div className="modal-actions">
          <button type="button" onClick={props.onCancel}>
            Отмена
          </button>
          <button type="submit" disabled={saving}>
            Сохранить
          </button>
        </div>
      </form>
    </div>
  );
}
