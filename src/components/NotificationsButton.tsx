import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import {
  disablePush,
  enablePush,
  hasActivePush,
  isPushConfigured,
  isPushSupported,
  pushPermission,
} from '../lib/push';

// Botón para activar/desactivar las notificaciones push (avisos que llegan como
// los de WhatsApp/Facebook). Se muestra en la barra lateral.
export default function NotificationsButton({ className = '' }: { className?: string }) {
  const { currentUser, accountUser } = useStore();
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    setDenied(pushPermission() === 'denied');
    hasActivePush().then(setActive);
  }, []);

  // Si el navegador no soporta push o faltan las llaves, no mostramos nada.
  if (!isPushSupported() || !isPushConfigured() || !currentUser) return null;

  const toggle = async () => {
    setBusy(true);
    try {
      if (active) {
        await disablePush();
        setActive(false);
      } else {
        const acc = accountUser ?? currentUser; // las notificaciones van a la cuenta (titular)
        const ok = await enablePush(acc.id, acc.studioId);
        setActive(ok);
        setDenied(pushPermission() === 'denied');
      }
    } finally {
      setBusy(false);
    }
  };

  if (denied) {
    return (
      <p className={`text-xs text-ink-faint ${className}`}>
        🔕 Notificaciones bloqueadas. Actívalas desde los ajustes del navegador.
      </p>
    );
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`w-full rounded-xl px-3 py-2 text-sm font-medium transition ${
        active
          ? 'bg-cream-dark text-ink-soft hover:bg-cream-dark/70'
          : 'bg-brand text-cream hover:opacity-90'
      } ${className}`}
    >
      {busy ? '…' : active ? '🔔 Notificaciones activas' : '🔔 Activar notificaciones'}
    </button>
  );
}
