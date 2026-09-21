import React, { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../api/client';
import { ExportTree } from '../components/ExportTree';
import { InventoryCardsModal } from '../components/InventoryCardsModal';
import { QrPrintView } from '../components/QrPrintView';
import { downloadBlob, extractErrorMessage } from '../utils/download';
import type { EquipmentUnit, LocationItem } from '../types';

function timestampSuffix(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function ExportPage() {
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [units, setUnits] = useState<EquipmentUnit[]>([]);
  const [checkedUnitIds, setCheckedUnitIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showCardsModal, setShowCardsModal] = useState(false);
  const [qrView, setQrView] = useState<{ mode: 'data' | 'link' } | null>(null);

  const load = async () => {
    const [locRes, unitRes] = await Promise.all([
      apiClient.get<LocationItem[]>('/api/locations'),
      apiClient.get<EquipmentUnit[]>('/api/equipment-units')
    ]);
    setLocations(locRes.data);
    setUnits(unitRes.data);
  };

  useEffect(() => {
    load().catch(() => setError('Не удалось загрузить данные'));
  }, []);

  const locationsById = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);
  const selectedUnits = useMemo(() => units.filter((u) => checkedUnitIds.has(u.id)), [units, checkedUnitIds]);

  if (qrView) {
    return (
      <QrPrintView
        units={selectedUnits}
        locationsById={locationsById}
        mode={qrView.mode}
        onClose={() => setQrView(null)}
      />
    );
  }

  const selectAll = () => setCheckedUnitIds(new Set(units.map((u) => u.id)));
  const selectNone = () => setCheckedUnitIds(new Set());

  const handleEquipmentList = async () => {
    if (selectedUnits.length === 0) return;
    setBusy('list');
    setError(null);
    try {
      const res = await apiClient.post(
        '/api/export/equipment-list',
        { unitIds: Array.from(checkedUnitIds) },
        { responseType: 'blob' }
      );
      downloadBlob(res.data, `spisok-tehniki-${timestampSuffix()}.xlsx`);
    } catch (err: any) {
      setError(await extractErrorMessage(err, 'Не удалось сформировать список'));
    } finally {
      setBusy(null);
    }
  };

  const handleInventoryCards = async (buildingDepth: number, cabinetDepth: number) => {
    setShowCardsModal(false);
    setBusy('cards');
    setError(null);
    try {
      const res = await apiClient.post(
        '/api/export/inventory-cards',
        { unitIds: Array.from(checkedUnitIds), buildingDepth, cabinetDepth },
        { responseType: 'blob' }
      );
      downloadBlob(res.data, `inventarnye-kartochki-${timestampSuffix()}.xlsx`);
    } catch (err: any) {
      setError(await extractErrorMessage(err, 'Не удалось сформировать инвентарные карточки'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="page export-page">
      <h1>Экспорт</h1>
      {error && (
        <div className="error-banner" onClick={() => setError(null)}>
          {error}
        </div>
      )}

      <div className="toolbar">
        <button onClick={selectAll}>Выделить всё</button>
        <button onClick={selectNone}>Снять выделение</button>
        <span className="muted">
          Выбрано: {checkedUnitIds.size} из {units.length}
        </span>
      </div>

      <div className="export-buttons">
        <button onClick={handleEquipmentList} disabled={checkedUnitIds.size === 0 || busy !== null}>
          {busy === 'list' ? 'Формирование...' : 'Excel: список техники'}
        </button>
        <button onClick={() => setShowCardsModal(true)} disabled={checkedUnitIds.size === 0 || busy !== null}>
          {busy === 'cards' ? 'Формирование...' : 'Excel: инвентарные карточки'}
        </button>
        <button onClick={() => setQrView({ mode: 'data' })} disabled={checkedUnitIds.size === 0}>
          QR-коды (данные)
        </button>
        <button onClick={() => setQrView({ mode: 'link' })} disabled={checkedUnitIds.size === 0}>
          QR-коды (ссылки)
        </button>
      </div>

      <div className="tree-panel export-tree-panel">
        <ExportTree locations={locations} units={units} checkedUnitIds={checkedUnitIds} onChange={setCheckedUnitIds} />
      </div>

      {showCardsModal && (
        <InventoryCardsModal
          locations={locations}
          locationsById={locationsById}
          onCancel={() => setShowCardsModal(false)}
          onConfirm={handleInventoryCards}
        />
      )}
    </div>
  );
}
