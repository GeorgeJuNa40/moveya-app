import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

// Lector de QR con la cámara, DENTRO de la app (sin salir a la cámara del cel).
// Abre la cámara trasera, escanea en vivo y llama onResult con el texto del QR.
export default function QrScanner({ onResult, onClose }: { onResult: (text: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const doneRef = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const stop = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };

    const tick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const w = video.videoWidth;
      const h = video.videoHeight;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      ctx.drawImage(video, 0, 0, w, h);
      const img = ctx.getImageData(0, 0, w, h);
      const code = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
      if (code && code.data && !doneRef.current) {
        doneRef.current = true;
        stop();
        onResult(code.data);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current!;
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        await video.play();
        rafRef.current = requestAnimationFrame(tick);
      } catch (e) {
        const name = (e as Error)?.name ?? '';
        setError(
          name === 'NotAllowedError'
            ? 'No diste permiso a la cámara. Actívalo en los ajustes del navegador e inténtalo de nuevo.'
            : 'No pude abrir la cámara en este dispositivo.',
        );
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, [onResult]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-zen">
        <div className="relative aspect-square bg-black">
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
          <canvas ref={canvasRef} className="hidden" />
          {/* Marco guía */}
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="h-48 w-48 rounded-2xl border-4 border-white/80" />
          </div>
        </div>
        <div className="p-4 text-center">
          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : (
            <p className="text-sm text-ink-soft">Apunta la cámara al código QR.</p>
          )}
          <button onClick={onClose} className="mt-3 rounded-2xl border border-cream-dark px-5 py-2 text-sm font-medium text-ink-soft">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// Extrae los parámetros de un QR de check-in de Move yA (URL con /checkin?s=&u=).
// Devuelve { studio, user } o null si no es un QR válido de la app.
export function parseCheckinQr(text: string): { studio: string; user: string | null } | null {
  try {
    if (!/\/checkin/i.test(text)) return null;
    const q = text.split('?')[1] ?? '';
    const p = new URLSearchParams(q);
    const studio = p.get('s') ?? '';
    if (!studio) return null;
    return { studio, user: p.get('u') };
  } catch {
    return null;
  }
}
