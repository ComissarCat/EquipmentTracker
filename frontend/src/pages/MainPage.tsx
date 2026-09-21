import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { TreeExplorer, type NodeKey, type DragPayload, parseKey } from '../components/TreeExplorer';
import type { EquipmentName, EquipmentUnit, LocationItem } from '../types';

type ModalState =
  | { kind: 'none' }
  | { kind: 'newLocation'; parentLocationId: number | null }
  | { kind: 'editLocation'; location: LocationItem }
  | { kind: 'newUnit'; locationId: number | null }
  | { kind: 'editUnit'; unit: EquipmentUnit };

export function MainPage() {
  const { isOperator } = useAuth();
  const navigate = useNavigate();

  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [units, setUnits] = useState<EquipmentUnit[]>([]);
  const [equipmentNames, setEquipmentNames] = useState<EquipmentName[]>([]);

  const [leftSelected, setLeftSelected] = useState<Set<NodeKey>>(new Set());
  const [rightSelected, setRightSelected] = useState<Set<NodeKey>>(new Set());

  const [modal, setModal] = useState<ModalState>({ kind: 'none' });
  const [error, setError] = useState<string | null>(null);

  const loadAll = async () => {
    const [locRes, unitRes, nameRes] = await Promise.all([
      apiClient.get<LocationItem[]>('/api/locations'),
      apiClient.get<EquipmentUnit[]>('/api/equipment-units'),
      apiClient.get<EquipmentName[]>('/api/equipment-names')
    ]);
    setLocations(locRes.data);
    setUnits(unitRes.data);
    setEquipmentNames(nameRes.data);
  };

  useEffect(() => {
    loadAll().catch(() => setError('Не удалось загрузить данные'));
  }, []);

  // Резолвит локацию узла (для локации — она сама, для единицы техники — её текущая локация)
  const locationIdOfNode = (kind: 'location' | 'unit', id: number): number | null => {
    if (kind === 'location') return id;
    return units.find((u) => u.id === id)?.locationId ?? null;
  };

  // Для кнопок "+ Локация"/"+ Техника": если у всех выбранных узлов панели общая локация — используем её
  const resolveCommonLocationId = (keys: Set<NodeKey>): number | null => {
    if (keys.size === 0) return null;
    const ids = Array.from(keys).map((k) => {
      const { kind, id } = parseKey(k);
      return locationIdOfNode(kind, id);
    });
    const first = ids[0];
    return ids.every((v) => v === first) ? first : null;
  };

  // Перемещение (пакетом) по drag-and-drop или по кнопкам между панелями
  const moveItems = async (payload: DragPayload, targetLocationId: number | null) => {
    if (!isOperator || payload.length === 0) return;
    if (targetLocationId === null && payload.some((p) => p.kind === 'unit')) {
      setError('У единицы техники обязательно должна быть локация — выберите конкретную локацию, а не корень');
      return;
    }
    const errors: string[] = [];
    for (const item of payload) {
      try {
        if (item.kind === 'unit') {
          await apiClient.post(`/api/equipment-units/${item.id}/move`, { newLocationId: targetLocationId });
        } else {
          if (item.id === targetLocationId) continue; // локация не может быть своим же родителем
          await apiClient.post(`/api/locations/${item.id}/move`, { newParentLocationId: targetLocationId });
        }
      } catch (err: any) {
        errors.push(err?.response?.data?.message || `Не удалось переместить элемент #${item.id}`);
      }
    }
    if (errors.length > 0) setError(errors.join('; '));
    await loadAll();
  };

  // Кнопки "→" / "←" перемещают весь выбор одной панели в единственную выбранную локацию другой панели
  const moveSelectionTo = async (sourceKeys: Set<NodeKey>, targetKeys: Set<NodeKey>) => {
    if (sourceKeys.size === 0) return;
    if (targetKeys.size !== 1) {
      setError('Выберите ровно одну целевую локацию в другой панели');
      return;
    }
    const targetKey = Array.from(targetKeys)[0];
    const { kind: targetKind, id: targetId } = parseKey(targetKey);
    const targetLocationId = locationIdOfNode(targetKind, targetId);
    const payload: DragPayload = Array.from(sourceKeys).map(parseKey);
    await moveItems(payload, targetLocationId);
  };

  const deleteSelection = async (keys: Set<NodeKey>, clearSide: 'left' | 'right' | 'both') => {
    if (keys.size === 0 || !isOperator) return;
    const confirmMsg = keys.size === 1 ? 'Удалить выбранный элемент?' : `Удалить выбранные элементы (${keys.size} шт.)?`;
    if (!window.confirm(confirmMsg)) return;
    const errors: string[] = [];
    for (const key of keys) {
      const { kind, id } = parseKey(key);
      try {
        if (kind === 'location') await apiClient.delete(`/api/locations/${id}`);
        else await apiClient.delete(`/api/equipment-units/${id}`);
      } catch (err: any) {
        errors.push(err?.response?.data?.message || `Не удалось удалить элемент #${id}`);
      }
    }
    if (errors.length > 0) setError(errors.join('; '));
    if (clearSide === 'left' || clearSide === 'both') setLeftSelected(new Set());
    if (clearSide === 'right' || clearSide === 'both') setRightSelected(new Set());
    await loadAll();
  };

  const openEdit = (keys: Set<NodeKey>) => {
    if (keys.size !== 1) return;
    const { kind, id } = parseKey(Array.from(keys)[0]);
    if (kind === 'location') setModal({ kind: 'editLocation', location: locations.find((l) => l.id === id)! });
    else setModal({ kind: 'editUnit', unit: units.find((u) => u.id === id)! });
  };

  const openUnitPage = (keys: Set<NodeKey>) => {
    if (keys.size !== 1) return;
    const { kind, id } = parseKey(Array.from(keys)[0]);
    if (kind === 'unit') navigate(`/equipment-units/${id}`);
  };

  const closeModal = () => setModal({ kind: 'none' });

  // Панель инструментов одной стороны (слева/справа) — создание, открытие, редактирование, удаление
  const renderPaneToolbar = (selected: Set<NodeKey>, setSelected: (s: Set<NodeKey>) => void) => {
    const singleKey = selected.size === 1 ? Array.from(selected)[0] : null;
    const singleIsUnit = singleKey !== null && parseKey(singleKey).kind === 'unit';
    return (
      <div className="pane-toolbar">
        {isOperator && (
          <>
            <button onClick={() => setModal({ kind: 'newLocation', parentLocationId: resolveCommonLocationId(selected) })}>
              + Локация
            </button>
            <button onClick={() => setModal({ kind: 'newUnit', locationId: resolveCommonLocationId(selected) })}>
              + Техника
            </button>
          </>
        )}
        <button onClick={() => openUnitPage(selected)} disabled={!singleIsUnit} title="Открыть карточку единицы техники">
          Открыть
        </button>
        {isOperator && (
          <>
            <button onClick={() => openEdit(selected)} disabled={selected.size !== 1}>
              Редактировать
            </button>
            <button onClick={() => deleteSelection(selected, setSelected === setLeftSelected ? 'left' : 'right')} disabled={selected.size === 0}>
              Удалить{selected.size > 1 ? ` (${selected.size})` : ''}
            </button>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="main-page">
      {error && (
        <div className="error-banner" onClick={() => setError(null)}>
          {error} (нажмите, чтобы скрыть)
        </div>
      )}

      <div className="dual-pane">
        <div className="pane-column">
          {renderPaneToolbar(leftSelected, setLeftSelected)}
          <TreeExplorer
            panelTitle="Левая панель"
            locations={locations}
            units={units}
            selectedKeys={leftSelected}
            onSelectionChange={setLeftSelected}
            canEdit={isOperator}
            onDropOnLocation={moveItems}
            onOpenUnit={(unitId) => navigate(`/equipment-units/${unitId}`)}
          />
        </div>

        {isOperator && (
          <div className="move-buttons-column">
            <button
              title="Переместить выбранное слева в выбранную локацию справа"
              onClick={() => moveSelectionTo(leftSelected, rightSelected)}
              disabled={leftSelected.size === 0}
            >
              →
            </button>
            <button
              title="Переместить выбранное справа в выбранную локацию слева"
              onClick={() => moveSelectionTo(rightSelected, leftSelected)}
              disabled={rightSelected.size === 0}
            >
              ←
            </button>
          </div>
        )}

        <div className="pane-column">
          {renderPaneToolbar(rightSelected, setRightSelected)}
          <TreeExplorer
            panelTitle="Правая панель"
            locations={locations}
            units={units}
            selectedKeys={rightSelected}
            onSelectionChange={setRightSelected}
            canEdit={isOperator}
            onDropOnLocation={moveItems}
            onOpenUnit={(unitId) => navigate(`/equipment-units/${unitId}`)}
          />
        </div>
      </div>

      {modal.kind === 'newLocation' && (
        <LocationModal
          title="Новая локация"
          initialName=""
          initialParentId={modal.parentLocationId}
          locations={locations}
          onCancel={closeModal}
          onSave={async (name, parentId) => {
            await apiClient.post('/api/locations', { name, parentLocationId: parentId });
            closeModal();
            await loadAll();
          }}
        />
      )}

      {modal.kind === 'editLocation' && (
        <LocationModal
          title="Редактирование локации"
          initialName={modal.location.name}
          initialParentId={modal.location.parentLocationId}
          locations={locations.filter((l) => l.id !== modal.location.id)}
          onCancel={closeModal}
          onSave={async (name, parentId) => {
            await apiClient.put(`/api/locations/${modal.location.id}`, { name, parentLocationId: parentId });
            closeModal();
            await loadAll();
          }}
        />
      )}

      {modal.kind === 'newUnit' && (
        <UnitModal
          title="Новая единица техники"
          equipmentNames={equipmentNames}
          locations={locations}
          initial={{
            equipmentNameId: equipmentNames[0]?.id ?? 0,
            serialNumber: '',
            inventoryNumber: '',
            note: '',
            locationId: modal.locationId ?? locations[0]?.id ?? 0
          }}
          onCancel={closeModal}
          onSave={async (data) => {
            await apiClient.post('/api/equipment-units', data);
            closeModal();
            await loadAll();
          }}
        />
      )}

      {modal.kind === 'editUnit' && (
        <UnitModal
          title="Редактирование единицы техники"
          equipmentNames={equipmentNames}
          locations={locations}
          initial={{
            equipmentNameId: modal.unit.equipmentNameId,
            serialNumber: modal.unit.serialNumber,
            inventoryNumber: modal.unit.inventoryNumber ?? '',
            note: modal.unit.note ?? '',
            locationId: modal.unit.locationId
          }}
          onCancel={closeModal}
          onSave={async (data) => {
            await apiClient.put(`/api/equipment-units/${modal.unit.id}`, data);
            closeModal();
            await loadAll();
          }}
        />
      )}
    </div>
  );
}

// --- Модальные формы ---

function LocationModal(props: {
  title: string;
  initialName: string;
  initialParentId: number | null;
  locations: LocationItem[];
  onCancel: () => void;
  onSave: (name: string, parentId: number | null) => Promise<void>;
}) {
  const [name, setName] = useState(props.initialName);
  const [parentId, setParentId] = useState<number | null>(props.initialParentId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await props.onSave(name, parentId);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <form className="modal" onSubmit={submit}>
        <h2>{props.title}</h2>
        <label>
          Название
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </label>
        <label>
          Родительская локация
          <select
            value={parentId ?? ''}
            onChange={(e) => setParentId(e.target.value === '' ? null : Number(e.target.value))}
          >
            <option value="">— нет (корень) —</option>
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
    </div>
  );
}

function UnitModal(props: {
  title: string;
  equipmentNames: EquipmentName[];
  locations: LocationItem[];
  initial: { equipmentNameId: number; serialNumber: string; inventoryNumber: string; note: string; locationId: number };
  onCancel: () => void;
  onSave: (data: {
    equipmentNameId: number;
    serialNumber: string;
    inventoryNumber: string | null;
    note: string | null;
    locationId: number;
  }) => Promise<void>;
}) {
  const [equipmentNameId, setEquipmentNameId] = useState(props.initial.equipmentNameId);
  const [serialNumber, setSerialNumber] = useState(props.initial.serialNumber);
  const [inventoryNumber, setInventoryNumber] = useState(props.initial.inventoryNumber);
  const [note, setNote] = useState(props.initial.note);
  const [locationId, setLocationId] = useState<number>(props.initial.locationId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locationId) {
      setError('Выберите локацию — она обязательна для единицы техники');
      return;
    }
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
    <div className="modal-overlay">
      <form className="modal" onSubmit={submit}>
        <h2>{props.title}</h2>
        <label>
          Наименование техники
          <select value={equipmentNameId} onChange={(e) => setEquipmentNameId(Number(e.target.value))} required>
            {props.equipmentNames.length === 0 && <option value={0}>Сначала создайте наименование в справочниках</option>}
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
            {props.locations.length === 0 && <option value={0}>Сначала создайте локацию</option>}
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
    </div>
  );
}
