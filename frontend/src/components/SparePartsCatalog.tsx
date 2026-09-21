import React, { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import type { SparePart } from '../types';

// Справочник расходных частей с остатками.
// Оператор: создаёт позиции, переименовывает и может только ПОПОЛНЯТЬ остаток (положительное число).
// Администратор: дополнительно напрямую задаёт количество и удаляет позиции.
export function SparePartsCatalog({ onError }: { onError: (message: string) => void }) {
  const { isOperator, isAdministrator } = useAuth();
  const [items, setItems] = useState<SparePart[]>([]);

  const [newName, setNewName] = useState('');
  const [newQuantity, setNewQuantity] = useState('0');

  const [renaming, setRenaming] = useState<SparePart | null>(null);
  const [addingToId, setAddingToId] = useState<number | null>(null);
  const [addAmount, setAddAmount] = useState('1');
  const [settingId, setSettingId] = useState<number | null>(null);
  const [setValue, setSetValue] = useState('0');

  const load = async () => {
    const res = await apiClient.get<SparePart[]>('/api/spare-parts');
    setItems(res.data);
  };

  useEffect(() => {
    load().catch(() => onError('Не удалось загрузить расходные части'));
  }, []);

  const run = async (action: () => Promise<unknown>, failure: string) => {
    try {
      await action();
      await load();
    } catch (err: any) {
      onError(err?.response?.data?.message || failure);
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    await run(async () => {
      await apiClient.post('/api/spare-parts', { name: newName, quantity: Number(newQuantity) });
      setNewName('');
      setNewQuantity('0');
    }, 'Не удалось создать расходную часть');
  };

  const rename = (item: SparePart) =>
    run(async () => {
      await apiClient.put(`/api/spare-parts/${item.id}`, { name: item.name });
      setRenaming(null);
    }, 'Не удалось сохранить расходную часть');

  const addStock = (id: number) =>
    run(async () => {
      await apiClient.post(`/api/spare-parts/${id}/add-stock`, { amount: Number(addAmount) });
      setAddingToId(null);
    }, 'Не удалось пополнить запас');

  const setQuantity = (id: number) =>
    run(async () => {
      await apiClient.put(`/api/spare-parts/${id}/quantity`, { quantity: Number(setValue) });
      setSettingId(null);
    }, 'Не удалось изменить количество');

  const remove = async (id: number) => {
    if (!window.confirm('Удалить расходную часть вместе с остатком?')) return;
    await run(() => apiClient.delete(`/api/spare-parts/${id}`), 'Не удалось удалить расходную часть');
  };

  return (
    <details className="collapsible">
      <summary>Расходные части <span className="muted">({items.length})</span></summary>
      {isOperator && (
        <form className="inline-form" onSubmit={create}>
          <input placeholder="Новая расходная часть" value={newName} onChange={(e) => setNewName(e.target.value)} required />
          <input
            type="number"
            min={0}
            step={1}
            title="Начальное количество"
            value={newQuantity}
            onChange={(e) => setNewQuantity(e.target.value)}
            style={{ width: 90 }}
            required
          />
          <button type="submit">Добавить</button>
        </form>
      )}
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr><th>Название</th><th>Количество</th>{isOperator && <th></th>}</tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  {renaming?.id === item.id ? (
                    <input value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} />
                  ) : (
                    item.name
                  )}
                </td>
                <td>
                  {settingId === item.id ? (
                    <input
                      type="number"
                      step={1}
                      value={setValue}
                      onChange={(e) => setSetValue(e.target.value)}
                      style={{ width: 90 }}
                    />
                  ) : (
                    item.quantity
                  )}
                </td>
                {isOperator && (
                  <td>
                    {renaming?.id === item.id ? (
                      <>
                        <button onClick={() => rename(renaming)}>Сохранить</button>
                        <button onClick={() => setRenaming(null)}>Отмена</button>
                      </>
                    ) : settingId === item.id ? (
                      <>
                        <button onClick={() => setQuantity(item.id)}>Сохранить</button>
                        <button onClick={() => setSettingId(null)}>Отмена</button>
                      </>
                    ) : addingToId === item.id ? (
                      <>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={addAmount}
                          onChange={(e) => setAddAmount(e.target.value)}
                          style={{ width: 80 }}
                        />
                        <button onClick={() => addStock(item.id)} disabled={!(Number(addAmount) > 0)}>Добавить</button>
                        <button onClick={() => setAddingToId(null)}>Отмена</button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setAddAmount('1');
                            setAddingToId(item.id);
                          }}
                        >
                          Пополнить
                        </button>
                        <button onClick={() => setRenaming(item)}>Переименовать</button>
                        {isAdministrator && (
                          <>
                            <button
                              onClick={() => {
                                setSetValue(String(item.quantity));
                                setSettingId(item.id);
                              }}
                            >
                              Задать количество
                            </button>
                            <button onClick={() => remove(item.id)}>Удалить</button>
                          </>
                        )}
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
