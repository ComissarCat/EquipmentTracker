import React from 'react';
import type { LocationItem } from '../types';
import { fullPath, depthOf, distinctDepthExamples } from '../utils/locationTree';

interface InventoryCardsModalProps {
  locations: LocationItem[];
  locationsById: Map<number, LocationItem>;
  onCancel: () => void;
  onConfirm: (buildingDepth: number, cabinetDepth: number) => void;
}

// Т.к. в дереве локаций нет жёстко заданных уровней "здание"/"кабинет" (в отличие от
// старой БД, где это были отдельные таблицы), перед генерацией карточек просим
// указать один пример локации каждого уровня — дальше определяем нужную глубину
// по всему дереву автоматически.
export function InventoryCardsModal(props: InventoryCardsModalProps) {
  const { locations, locationsById } = props;
  const depthExamples = React.useMemo(() => distinctDepthExamples(locations, locationsById), [locations, locationsById]);

  const [buildingLocationId, setBuildingLocationId] = React.useState<number | null>(
    depthExamples[0]?.example.id ?? null
  );
  const [cabinetLocationId, setCabinetLocationId] = React.useState<number | null>(
    depthExamples[1]?.example.id ?? depthExamples[0]?.example.id ?? null
  );
  const [error, setError] = React.useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (buildingLocationId === null || cabinetLocationId === null) {
      setError('Выберите обе локации-примеры');
      return;
    }
    const buildingDepth = depthOf(buildingLocationId, locationsById);
    const cabinetDepth = depthOf(cabinetLocationId, locationsById);
    if (cabinetDepth !== buildingDepth + 1) {
      setError('«Кабинет» должен находиться на один уровень глубже, чем «Здание» (быть прямым потомком уровня здания)');
      return;
    }
    props.onConfirm(buildingDepth, cabinetDepth);
  };

  return (
    <div className="modal-overlay">
      <form className="modal" onSubmit={submit}>
        <h2>Инвентарные карточки</h2>
        <p className="muted">
          Укажите по одному примеру: какая локация в вашем дереве соответствует уровню «здание», а какая — уровню
          «кабинет». Это определит группировку карточек для всей выбранной техники, не только для этих двух локаций.
        </p>
        <label>
          Пример локации уровня «Здание»
          <select
            value={buildingLocationId ?? ''}
            onChange={(e) => setBuildingLocationId(e.target.value === '' ? null : Number(e.target.value))}
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {fullPath(l.id, locationsById)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Пример локации уровня «Кабинет»
          <select
            value={cabinetLocationId ?? ''}
            onChange={(e) => setCabinetLocationId(e.target.value === '' ? null : Number(e.target.value))}
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {fullPath(l.id, locationsById)}
              </option>
            ))}
          </select>
        </label>
        {error && <div className="error-text">{error}</div>}
        <div className="modal-actions">
          <button type="button" onClick={props.onCancel}>
            Отмена
          </button>
          <button type="submit">Сформировать</button>
        </div>
      </form>
    </div>
  );
}
