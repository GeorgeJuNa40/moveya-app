import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { enablePush, isPushConfigured, isPushSupported, pushPermission } from '../lib/push';

// Aviso automático (una sola vez) para activar las notificaciones, como hacen
// las apps normales al abrirlas. Los navegadores EXIGEN un toque del usuario
// para permitir push; esto lo hace con un solo botón, sin que tenga que buscar
// nada en el menú. Si ya decidió (permitió o bloqueó), no vuelve a aparecer.
const KEY = 'moveya_push_asked_at';
const SNOOZE_MS = 3 * 24 * 3600 * 1000; // si dice "ahora no", re-pregunta en 3 días

export default function NotificationsPrompt() {
  const { currentUser, accountUser } = useStore();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    if (!isPushSupported() || !isPushConfigured()) return;
    if (pushPermission() !== 'default') return; // ya permitió o bloqueó antes
    const asked = Number(localStorage.getItem(KEY) || 0);
    if (Date.now() - asked < SNOOZE_MS) return;
    const t = setTimeout(() => setShow(true), 1200); // deja cargar la pantalla
    return () => clearTimeout(t);
  }, [currentUser]);

  if (!show || !currentUser) return null;

  const enable = async () => {
    setBusy(true);
    try {
      const acc = accountUser ?? currentUser; // notificaciones a la cuenta (titular)
      await enablePush(acc.id, acc.studioId);
    } finally {
      localStorage.setItem(KEY, String(Date.now()));
      setBusy(false);
      setShow(false);
    }
  };

  const later = () => {
    localStorage.setItem(KEY, String(Date.now()));
    setShow(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40" onClick={later} />
      <div className="relative m-4 w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
        <div className="text-4xl">🔔</div>
        <h3 className="mt-2 text-lg font-bold text-ink">Activa las notificaciones</h3>
        <p className="mt-2 text-sm text-ink-soft">
          Recibe el recordatorio de tus clases y el aviso cuando tu paquete esté por vencer,
          directo en tu celular.
        </p>
        <button
          onClick={enable}
          disabled={busy}
          className="mt-4 w-full rounded-xl bg-brand px-3 py-2.5 text-sm font-semibold text-cream hover:opacity-90"
        >
          {busy ? 'Activando…' : 'Activar notificaciones'}
        </button>
        <button onClick={later} className="mt-2 w-full rounded-xl px-3 py-2 text-sm text-ink-soft">
          Ahora no
        </button>
      </div>
    </div>
  );
}
