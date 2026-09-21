import React from 'react';
import QRCode from 'qrcode';
import type { EquipmentUnit, LocationItem } from '../types';

interface QrPrintViewProps {
  units: EquipmentUnit[];
  locationsById: Map<number, LocationItem>;
  // 'data' — в код зашиты сведения о технике текстом; 'link' — ссылка на карточку единицы техники
  mode: 'data' | 'link';
  onClose: () => void;
}

interface QrCell {
  unitId: number;
  svg: string;
  locationLabel: string;
  serialNumber: string;
}

// Печатная страница с QR-кодами: по одной наклейке на единицу техники, подписанной
// локацией и серийным номером (чтобы можно было опознать код без сканирования).
// QR рисуются как SVG (лёгкие векторные строки), а не растровые канвасы — это
// на порядок экономнее по памяти при генерации тысяч кодов разом.
export function QrPrintView(props: QrPrintViewProps) {
  const { units, locationsById, mode, onClose } = props;
  const [cells, setCells] = React.useState<QrCell[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;

    async function generate() {
      const result: QrCell[] = [];
      // Генерируем пачками с уступкой event loop между ними, чтобы не подвешивать вкладку
      // на большом количестве кодов и чтобы прогресс успевал перерисовываться.
      const BATCH = 40;
      for (let i = 0; i < units.length; i += BATCH) {
        const batch = units.slice(i, i + BATCH);
        for (const u of batch) {
          const content =
            mode === 'link'
              ? `${window.location.origin}/equipment-units/${u.id}`
              : [`Тип: ${u.equipmentTypeName}`, `Наименование: ${u.equipmentNameName}`, `S/N: ${u.serialNumber}`, `Инв. №: ${u.inventoryNumber || '—'}`].join('\n');
          const svg = await QRCode.toString(content, { type: 'svg', margin: 1, width: 128 });
          result.push({
            unitId: u.id,
            svg,
            locationLabel: locationsById.get(u.locationId)?.name ?? '',
            serialNumber: u.serialNumber
          });
        }
        if (cancelled) return;
        setProgress(result.length);
        await new Promise((r) => setTimeout(r, 0));
      }
      if (!cancelled) setCells(result);
    }

    generate().catch(() => setError('Не удалось сгенерировать QR-коды'));
    return () => {
      cancelled = true;
    };
  }, [units, mode, locationsById]);

  return (
    <div className="qr-print-root">
      <div className="no-print qr-toolbar">
        <button onClick={onClose}>← Назад</button>
        <span className="muted">
          {cells ? `Готово: ${cells.length} из ${units.length}` : `Генерация... ${progress} из ${units.length}`}
        </span>
        <button onClick={() => window.print()} disabled={!cells}>
          Печать
        </button>
      </div>

      {error && <div className="error-banner no-print">{error}</div>}

      {cells && (
        <div className="qr-grid">
          {cells.map((c) => (
            <div className="qr-cell" key={c.unitId}>
              <div className="qr-image" dangerouslySetInnerHTML={{ __html: c.svg }} />
              <div className="qr-caption">
                <div className="qr-caption-location">{c.locationLabel}</div>
                <div className="qr-caption-serial">{c.serialNumber}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
