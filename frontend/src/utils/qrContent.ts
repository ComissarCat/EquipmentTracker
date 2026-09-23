// Разбор содержимого отсканированного QR-кода (или введённого вручную текста) для страницы «Сканер».
// Поддерживаемые форматы:
//  - ссылка на карточку: http(s)://<любой адрес>/equipment-units/<id> (QR-коды «ссылки»; адрес сервера
//    мог смениться, поэтому хост не проверяется);
//  - QR-коды «данные» этого приложения: строка «S/N: <номер>»;
//  - QR-коды старого проекта Hardware (QRCoder): строка «С/н: <номер>»;
//  - одна строка без подписи — это сам серийный номер (ручной ввод, заводской штрихкод).
export type ScanTarget = { kind: 'unitId'; id: number } | { kind: 'serial'; serial: string };

const LINK_RE = /^https?:\/\/[^/\s]+\/equipment-units\/(\d+)(?:[/?#]|$)/i;
// «С» в старом формате — кириллическая, но на всякий случай принимаем и латинскую
const SERIAL_LINE_RE = /^\s*(?:S\/N|[СC]\/н)\s*:\s*(.*?)\s*$/iu;

export function parseScannedText(raw: string): ScanTarget | null {
  const text = raw.replace(/\r/g, '').trim();
  if (!text) return null;

  const link = text.match(LINK_RE);
  if (link) return { kind: 'unitId', id: Number(link[1]) };

  const lines = text.split('\n');
  for (const line of lines) {
    const m = line.match(SERIAL_LINE_RE);
    // Подпись есть, а номер пустой — искать нечего
    if (m) return m[1] ? { kind: 'serial', serial: m[1] } : null;
  }

  // Посторонняя ссылка (не на карточку) серийным номером не считается
  if (lines.length === 1 && !/^https?:\/\//i.test(text)) return { kind: 'serial', serial: text };
  return null;
}

// Текст QR-кода из данных jsQR. Байты декодируем как UTF-8 сами: кириллица в кодах записана в UTF-8
// (и нашим qrcode, и QRCoder старого проекта), а встроенное декодирование jsQR не всегда с этим справляется.
export function qrBytesToText(binaryData: number[], fallback: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binaryData));
  } catch {
    return fallback;
  }
}
