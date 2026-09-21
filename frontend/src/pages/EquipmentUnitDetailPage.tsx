import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import type { EquipmentName, EquipmentUnit, LocationItem, Repair } from '../types';
import { EntityHistory } from '../components/EntityHistory';
import { RepairHistory } from '../components/RepairHistory';
import { RepairModal } from '../components/RepairModal';

// Карточка одной единицы техники: полные данные, полный путь локации до корня,
// и (для Оператора/Администратора) возможность редактирования на месте.
export function EquipmentUnitDetailPage() {
  const { id } = useParams<{ id: string }>();
  const unitId = Number(id);
  const { isOperator, isAdministrator } = useAuth();
  const navigate = useNavigate();

  const [unit, setUnit] = useState<EquipmentUnit | null>(null);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [equipmentNames, setEquipmentNames] = useState<EquipmentName[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [showRepairModal, setShowRepairModal] = useState(false);
  const [editingRepair, setEditingRepair] = useState<Repair | null>(null);
  // Растёт при каждом изменении данных карточки — обновляет блок истории изменений
  const [historyVersion, setHistoryVersion] = useState(0);

  const load = async () => {
    setLoading(true);
    setNotFound(false);
    try {
      const [unitRes, locRes, nameRes, repairsRes] = await Promise.all([
        apiClient.get<EquipmentUnit>(`/api/equipment-units/${unitId}`),
        apiClient.get<LocationItem[]>('/api/locations'),
        apiClient.get<EquipmentName[]>('/api/equipment-names'),
        apiClient.get<Repair[]>(`/api/equipment-units/${unitId}/repairs`)
      ]);
      setUnit(unitRes.data);
      setLocations(locRes.data);
      setEquipmentNames(nameRes.data);
      setRepairs(repairsRes.data);
      setHistoryVersion((v) => v + 1);
    } catch (err: any) {
      if (err?.response?.status === 404) setNotFound(true);
      else setError('Не удалось загрузить данные единицы техники');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => setError('Не удалось загрузить данные'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId]);

  const locationsById = React.useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);

  const breadcrumb = React.useMemo(() => {
    if (!unit) return [];
    const chain: LocationItem[] = [];
    let cur: LocationItem | undefined = locationsById.get(unit.locationId);
    while (cur) {
      chain.unshift(cur);
      cur = cur.parentLocationId !== null ? locationsById.get(cur.parentLocationId) : undefined;
    }
    return chain;
  }, [unit, locationsById]);

  const removeRepair = async (repair: Repair) => {
    if (!window.confirm('Удалить этот ремонт? Списанные в нём расходные части вернутся на склад.')) return;
    try {
      await apiClient.delete(`/api/equipment-units/${unitId}/repairs/${repair.id}`);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Не удалось удалить ремонт');
    }
  };

  const remove = async () => {
    if (!unit) return;
    if (!window.confirm('Удалить эту единицу техники?')) return;
    try {
      await apiClient.delete(`/api/equipment-units/${unit.id}`);
      navigate('/');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Не удалось удалить единицу техники');
    }
  };

  if (loading) return <div className="page">Загрузка...</div>;

  if (notFound) {
    return (
      <div className="page">
        <p>Единица техники не найдена.</p>
        <Link to="/">← Назад к списку</Link>
      </div>
    );
  }

  if (!unit) {
    return (
      <div className="page">
        {error && <div className="error-banner" onClick={() => setError(null)}>{error}</div>}
        <Link to="/">← Назад к списку</Link>
      </div>
    );
  }

  return (
    <div className="page">
      <Link to="/" className="back-link">← Назад к списку</Link>
      {error && <div className="error-banner" onClick={() => setError(null)}>{error}</div>}

      <h1>
        {unit.equipmentNameName} — S/N {unit.serialNumber}
      </h1>

      {!editing && (
        <>
          <div className="detail-card">
            <div className="detail-row">
              <span className="detail-label">Тип техники</span>
              <span>{unit.equipmentTypeName}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Наименование техники</span>
              <span>{unit.equipmentNameName}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Серийный номер</span>
              <span>{unit.serialNumber}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Инвентарный номер</span>
              <span>{unit.inventoryNumber || '—'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Примечание</span>
              <span>{unit.note || '—'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Локация</span>
              <span>
                {breadcrumb.length > 0 ? breadcrumb.map((l) => l.name).join(' → ') : '—'}
              </span>
            </div>
          </div>

          {isOperator && (
            <div className="detail-actions">
              <button onClick={() => setShowRepairModal(true)}>Зафиксировать ремонт</button>
              <button onClick={() => setEditing(true)}>Редактировать</button>
              <button onClick={remove}>Удалить</button>
            </div>
          )}
        </>
      )}

      {editing && (
        <EditForm
          unit={unit}
          equipmentNames={equipmentNames}
          locations={locations}
          onCancel={() => setEditing(false)}
          onSave={async (data) => {
            await apiClient.put(`/api/equipment-units/${unit.id}`, data);
            setEditing(false);
            await load();
          }}
        />
      )}

      <div className="detail-blocks">
        <RepairHistory
          repairs={repairs}
          canEdit={isAdministrator}
          onEdit={setEditingRepair}
          onDelete={removeRepair}
        />
        <EntityHistory
          entityType="EquipmentUnit"
          entityId={unit.id}
          locations={locations}
          equipmentNames={equipmentNames}
          refreshKey={historyVersion}
        />
      </div>

      {(showRepairModal || editingRepair) && (
        <RepairModal
          unitId={unit.id}
          repair={editingRepair ?? undefined}
          onCancel={() => {
            setShowRepairModal(false);
            setEditingRepair(null);
          }}
          onSaved={async () => {
            setShowRepairModal(false);
            setEditingRepair(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function EditForm(props: {
  unit: EquipmentUnit;
  equipmentNames: EquipmentName[];
  locations: LocationItem[];
  onCancel: () => void;
  onSave: (data: {
    equipmentNameId: number;
    serialNumber: string;
    inventoryNumber: string | null;
    note: string | null;
    locationId: number;
  }) => Promise<void>;
}) {
  const { unit } = props;
  const [equipmentNameId, setEquipmentNameId] = useState(unit.equipmentNameId);
  const [serialNumber, setSerialNumber] = useState(unit.serialNumber);
  const [inventoryNumber, setInventoryNumber] = useState(unit.inventoryNumber ?? '');
  const [note, setNote] = useState(unit.note ?? '');
  const [locationId, setLocationId] = useState<number>(unit.locationId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await props.onSave({
        equipmentNameId,
        serialNumber,
        inventoryNumber: inventoryNumber || null,
        note: note || null,
        locationId
      });
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="detail-card detail-form" onSubmit={submit}>
      <label>
        Наименование техники
        <select value={equipmentNameId} onChange={(e) => setEquipmentNameId(Number(e.target.value))} required>
          {props.equipmentNames.map((n) => (
            <option key={n.id} value={n.id}>
              {n.equipmentTypeName} / {n.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Серийный номер
        <input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} required autoFocus />
      </label>
      <label>
        Инвентарный номер
        <input value={inventoryNumber} onChange={(e) => setInventoryNumber(e.target.value)} />
      </label>
      <label>
        Примечание
        <textarea value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <label>
        Локация
        <select value={locationId} onChange={(e) => setLocationId(Number(e.target.value))} required>
          {props.locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
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
  );
}
