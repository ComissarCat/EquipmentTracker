export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// При responseType: 'blob' axios не парсит JSON-ошибку сервера — тело ошибки тоже
// приходит как Blob. Вытаскиваем из него message, если это возможно.
export async function extractErrorMessage(err: any, fallback: string): Promise<string> {
  const data = err?.response?.data;
  if (data instanceof Blob) {
    try {
      const text = await data.text();
      const parsed = JSON.parse(text);
      if (parsed?.message) return parsed.message;
    } catch {
      /* тело не JSON — используем запасной текст */
    }
  }
  return err?.response?.data?.message || fallback;
}
