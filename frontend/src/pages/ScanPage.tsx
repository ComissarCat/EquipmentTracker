import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import jsQR from 'jsqr';
import { apiClient } from '../api/client';
import type { EquipmentUnit } from '../types';
import { parseScannedText, qrBytesToText } from '../utils/qrContent';

// Пауза после Enter, прежде чем считать ввод законченным. USB-сканер «печатает» многострочный
// QR-код, нажимая Enter после каждой строки, и следующие символы приходят через миллисекунды;
// человек же после Enter ничего не вводит — тогда ввод и обрабатывается.
const ENTER_SUBMIT_DELAY_MS = 250;
// До какого размера (по большей стороне) уменьшать кадр перед распознаванием
const LIVE_FRAME_MAX = 640;
const PHOTO_SIZES = [1600, 800, 2800];
// Как часто пытаться распознать кадр с камеры — чаще нет смысла, а батарею телефона бережём
const LIVE_DECODE_INTERVAL_MS = 150;

// Живой видеопоток с камеры браузер даёт только в защищённом контексте (HTTPS или localhost).
// Фото через <input capture> работает и по HTTP — это основной способ на телефоне.
const liveCameraAvailable = window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;
// Автофокус поля ввода — только на устройствах с мышью: на телефоне он сразу открыл бы клавиатуру
const autoFocusInput = window.matchMedia?.('(pointer: fine)').matches ?? false;

// Распознаёт QR-код на изображении/кадре, уменьшенном до maxSide по большей стороне
function decodeFrom(
  source: CanvasImageSource,
  width: number,
  height: number,
  maxSide: number,
  canvas: HTMLCanvasElement,
  thorough: boolean
): string | null {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, w, h);
  const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, {
    inversionAttempts: thorough ? 'attemptBoth' : 'dontInvert'
  });
  return code ? qrBytesToText(code.binaryData, code.data) : null;
}

// Поиск и открытие карточки единицы техники по QR-коду: ссылка на карточку, QR «данные» этого
// приложения и старого проекта Hardware (по серийному номеру) или серийный номер вручную.
export function ScanPage() {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvas = () => (canvasRef.current ??= document.createElement('canvas'));
  const streamRef = useRef<MediaStream | null>(null);
  const enterTimerRef = useRef<number | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const handleText = useCallback(
    async (raw: string) => {
      setError(null);
      setLastScanned(raw.trim() || null);
      const target = parseScannedText(raw);
      if (!target) {
        setError('Не удалось найти в коде серийный номер или ссылку на карточку');
        return;
      }
      if (target.kind === 'unitId') {
        navigate(`/equipment-units/${target.id}`);
        return;
      }
      setBusy(true);
      try {
        const res = await apiClient.get<EquipmentUnit>('/api/equipment-units/by-serial', {
          params: { serial: target.serial }
        });
        navigate(`/equipment-units/${res.data.id}`);
      } catch (e: any) {
        setError(e?.response?.data?.message ?? 'Не удалось выполнить поиск');
      } finally {
        setBusy(false);
      }
    },
    [navigate]
  );

  // --- Ручной ввод / USB-сканер ---
  const clearEnterTimer = () => {
    if (enterTimerRef.current !== null) {
      window.clearTimeout(enterTimerRef.current);
      enterTimerRef.current = null;
    }
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    clearEnterTimer();
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const value = input + '\n';
    setInput(value);
    enterTimerRef.current = window.setTimeout(() => {
      enterTimerRef.current = null;
      setInput('');
      handleText(value);
    }, ENTER_SUBMIT_DELAY_MS);
  };

  useEffect(() => clearEnterTimer, []);

  // На ПК после неудачного поиска возвращаем фокус в поле — можно сразу сканировать следующий код
  useEffect(() => {
    if (!busy && autoFocusInput) inputRef.current?.focus();
  }, [busy]);

  // --- Фото ---
  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setBusy(true);
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      let text: string | null = null;
      for (const size of PHOTO_SIZES) {
        text = decodeFrom(img, img.naturalWidth, img.naturalHeight, size, canvas(), true);
        if (text !== null) break;
      }
      if (text === null) {
        setError('QR-код на фото не найден — попробуйте снять ближе и ровнее, без бликов');
        return;
      }
      await handleText(text);
    } catch {
      setError('Не удалось открыть изображение');
    } finally {
      URL.revokeObjectURL(url);
      setBusy(false);
    }
  };

  // --- Камера в реальном времени (только HTTPS) ---
  const startCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });
      streamRef.current = stream;
      setCameraOn(true);
    } catch {
      setError('Нет доступа к камере — разрешите его в настройках браузера или воспользуйтесь фото');
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!cameraOn || !video || !stream) return;

    video.srcObject = stream;
    video.play().catch(() => {});

    let frame = 0;
    let stopped = false;
    let lastDecode = 0;
    const tick = (now: number) => {
      if (stopped) return;
      if (
        now - lastDecode >= LIVE_DECODE_INTERVAL_MS &&
        video.readyState >= video.HAVE_ENOUGH_DATA &&
        video.videoWidth > 0
      ) {
        lastDecode = now;
        const text = decodeFrom(video, video.videoWidth, video.videoHeight, LIVE_FRAME_MAX, canvas(), false);
        if (text !== null) {
          stopCamera();
          handleText(text);
          return;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      video.srcObject = null;
    };
  }, [cameraOn, handleText, stopCamera]);

  return (
    <div className="page scan-page">
      <h1>Сканер</h1>
      <p className="muted">
        Откройте карточку техники по QR-коду: подойдут коды-ссылки, коды с данными (в том числе из старой
        программы) — поиск идёт по серийному номеру. Можно ввести серийный номер вручную.
      </p>

      {error && <div className="error-banner" onClick={() => setError(null)}>{error}</div>}

      <div className="scan-actions">
        <button onClick={() => fileRef.current?.click()} disabled={busy}>
          Сфотографировать QR-код
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onPhoto} />

        {liveCameraAvailable &&
          (cameraOn ? (
            <button onClick={stopCamera}>Выключить камеру</button>
          ) : (
            <button onClick={startCamera} disabled={busy}>
              Сканировать камерой
            </button>
          ))}
      </div>
      {!liveCameraAvailable && (
        <p className="muted">Сканирование камерой в реальном времени доступно только при работе сайта по HTTPS.</p>
      )}

      {cameraOn && (
        <div className="scan-video-wrap">
          <video ref={videoRef} playsInline muted />
          <div className="muted">Наведите камеру на QR-код</div>
        </div>
      )}

      <label className="scan-input-label">
        Серийный номер или содержимое QR-кода (сюда же вводит USB-сканер):
        <textarea
          ref={inputRef}
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onInputKeyDown}
          placeholder="Введите номер и нажмите Enter"
          disabled={busy}
          autoFocus={autoFocusInput}
        />
      </label>

      {busy && <div className="muted">Поиск...</div>}
      {lastScanned && !busy && (
        <details className="muted">
          <summary>Последний распознанный текст</summary>
          <pre className="scan-raw">{lastScanned}</pre>
        </details>
      )}
    </div>
  );
}
