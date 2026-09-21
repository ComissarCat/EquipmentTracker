import React, { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import type { EquipmentName, EquipmentType } from '../types';
import { RepairOperationsCatalog } from '../components/RepairOperationsCatalog';
import { SparePartsCatalog } from '../components/SparePartsCatalog';

// Справочники "Тип техники" и "Наименование техники" — CRUD для роли Оператор/Администратор
export function CatalogsPage() {
  const { isOperator } = useAuth();
  const [types, setTypes] = useState<EquipmentType[]>([]);
  const [names, setNames] = useState<EquipmentName[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [newTypeName, setNewTypeName] = useState('');
  const [editingType, setEditingType] = useState<EquipmentType | null>(null);

  const [newNameText, setNewNameText] = useState('');
  const [newNameTypeId, setNewNameTypeId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState<EquipmentName | null>(null);

  const load = async () => {
    const [typesRes, namesRes] = await Promise.all([
      apiClient.get<EquipmentType[]>('/api/equipment-types'),
      apiClient.get<EquipmentName[]>('/api/equipment-names')
    ]);
    setTypes(typesRes.data);
    setNames(namesRes.data);
    if (typesRes.data.length > 0 && newNameTypeId === null) setNewNameTypeId(typesRes.data[0].id);
  };

  useEffect(() => {
    load().catch(() => setError('Не удалось загрузить справочники'));
  }, []);

  const createType = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post('/api/equipment-types', { name: newTypeName });
      setNewTypeName('');
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Не удалось создать тип');
    }
  };

  const saveType = async (t: EquipmentType) => {
    try {
      await apiClient.put(`/api/equipment-types/${t.id}`, { name: t.name });
      setEditingType(null);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Не удалось сохранить тип');
    }
  };

  const deleteType = async (id: number) => {
    if (!window.confirm('Удалить тип техники?')) return;
    try {
      await apiClient.delete(`/api/equipment-types/${id}`);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Не удалось удалить тип');
    }
  };

  const createName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newNameTypeId === null) return;
    try {
      await apiClient.post('/api/equipment-names', { name: newNameText, equipmentTypeId: newNameTypeId });
      setNewNameText('');
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Не удалось создать наименование');
    }
  };

  const saveName = async (n: EquipmentName) => {
    try {
      await apiClient.put(`/api/equipment-names/${n.id}`, { name: n.name, equipmentTypeId: n.equipmentTypeId });
      setEditingName(null);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Не удалось сохранить наименование');
    }
  };

  const deleteName = async (id: number) => {
    if (!window.confirm('Удалить наименование техники?')) return;
    try {
      await apiClient.delete(`/api/equipment-names/${id}`);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Не удалось удалить наименование');
    }
  };

  return (
    <div className="page">
      <h1>Справочники техники</h1>
      {error && <div className="error-banner" onClick={() => setError(null)}>{error}</div>}

      <details className="collapsible">
        <summary>Типы техники <span className="muted">({types.length})</span></summary>
        {isOperator && (
          <form className="inline-form" onSubmit={createType}>
            <input placeholder="Новый тип" value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} required />
            <button type="submit">Добавить</button>
          </form>
        )}
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr><th>Название</th>{isOperator && <th></th>}</tr>
            </thead>
          <tbody>
            {types.map((t) => (
              <tr key={t.id}>
                <td>
                  {editingType?.id === t.id ? (
                    <input
                      value={editingType.name}
                      onChange={(e) => setEditingType({ ...editingType, name: e.target.value })}
                    />
                  ) : (
                    t.name
                  )}
                </td>
                {isOperator && (
                  <td>
                    {editingType?.id === t.id ? (
                      <>
                        <button onClick={() => saveType(editingType)}>Сохранить</button>
                        <button onClick={() => setEditingType(null)}>Отмена</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => setEditingType(t)}>Изменить</button>
                        <button onClick={() => deleteType(t.id)}>Удалить</button>
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

      <details className="collapsible">
        <summary>Наименования техники <span className="muted">({names.length})</span></summary>
        {isOperator && (
          <form className="inline-form" onSubmit={createName}>
            <select value={newNameTypeId ?? ''} onChange={(e) => setNewNameTypeId(Number(e.target.value))} required>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <input placeholder="Новое наименование" value={newNameText} onChange={(e) => setNewNameText(e.target.value)} required />
            <button type="submit">Добавить</button>
          </form>
        )}
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr><th>Тип</th><th>Название</th>{isOperator && <th></th>}</tr>
            </thead>
          <tbody>
            {names.map((n) => (
              <tr key={n.id}>
                <td>
                  {editingName?.id === n.id ? (
                    <select
                      value={editingName.equipmentTypeId}
                      onChange={(e) => setEditingName({ ...editingName, equipmentTypeId: Number(e.target.value) })}
                    >
                      {types.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    n.equipmentTypeName
                  )}
                </td>
                <td>
                  {editingName?.id === n.id ? (
                    <input value={editingName.name} onChange={(e) => setEditingName({ ...editingName, name: e.target.value })} />
                  ) : (
                    n.name
                  )}
                </td>
                {isOperator && (
                  <td>
                    {editingName?.id === n.id ? (
                      <>
                        <button onClick={() => saveName(editingName)}>Сохранить</button>
                        <button onClick={() => setEditingName(null)}>Отмена</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => setEditingName(n)}>Изменить</button>
                        <button onClick={() => deleteName(n.id)}>Удалить</button>
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

      <RepairOperationsCatalog onError={setError} />
      <SparePartsCatalog onError={setError} />
    </div>
  );
}
