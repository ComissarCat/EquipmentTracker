import React, { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import type { RepairOperation } from '../types';

// Справочник ремонтных операций — CRUD для роли Оператор/Администратор
export function RepairOperationsCatalog({ onError }: { onError: (message: string) => void }) {
  const { isOperator } = useAuth();
  const [items, setItems] = useState<RepairOperation[]>([]);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<RepairOperation | null>(null);

  const load = async () => {
    const res = await apiClient.get<RepairOperation[]>('/api/repair-operations');
    setItems(res.data);
  };

  useEffect(() => {
    load().catch(() => onError('Не удалось загрузить ремонтные операции'));
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post('/api/repair-operations', { name: newName });
      setNewName('');
      await load();
    } catch (err: any) {
      onError(err?.response?.data?.message || 'Не удалось создать ремонтную операцию');
    }
  };

  const save = async (item: RepairOperation) => {
    try {
      await apiClient.put(`/api/repair-operations/${item.id}`, { name: item.name });
      setEditing(null);
      await load();
    } catch (err: any) {
      onError(err?.response?.data?.message || 'Не удалось сохранить ремонтную операцию');
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm('Удалить ремонтную операцию?')) return;
    try {
      await apiClient.delete(`/api/repair-operations/${id}`);
      await load();
    } catch (err: any) {
      onError(err?.response?.data?.message || 'Не удалось удалить ремонтную операцию');
    }
  };

  return (
    <details className="collapsible">
      <summary>Ремонтные операции <span className="muted">({items.length})</span></summary>
      {isOperator && (
        <form className="inline-form" onSubmit={create}>
          <input placeholder="Новая ремонтная операция" value={newName} onChange={(e) => setNewName(e.target.value)} required />
          <button type="submit">Добавить</button>
        </form>
      )}
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr><th>Название</th>{isOperator && <th></th>}</tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  {editing?.id === item.id ? (
                    <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                  ) : (
                    item.name
                  )}
                </td>
                {isOperator && (
                  <td>
                    {editing?.id === item.id ? (
                      <>
                        <button onClick={() => save(editing)}>Сохранить</button>
                        <button onClick={() => setEditing(null)}>Отмена</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => setEditing(item)}>Изменить</button>
                        <button onClick={() => remove(item.id)}>Удалить</button>
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
