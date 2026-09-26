// ============================================================================
// Move yA — Auto-actualización (evita quedarse en una versión vieja)
// ----------------------------------------------------------------------------
// En cada despliegue, el build genera un id (__BUILD_ID__) y un archivo
// /version.json con ESE id. La app revisa /version.json (al abrir, al volver a
// la pestaña y cada 30 s). Si el id del servidor es distinto al que está
// corriendo, hay una versión nueva publicada.
//
// Estrategia en 2 pasos (para que NUNCA se quede pegada, ni siquiera una app
// instalada con un service worker viejo):
//   1) RECARGA SUAVE: limpia las cachés y recarga una vez. Conserva el service
//      worker (y por tanto la suscripción a notificaciones push).
//   2) Si tras la recarga suave SIGUE en la versión vieja (service worker
//      atorado), RECARGA DURA: da de baja el/los service workers, limpia todo
//      y recarga. Esto despega cualquier copia vieja sí o sí.
// El sessionStorage evita bucles: cada paso se intenta una sola vez por versión.
// ============================================================================

declare const __BUILD_ID__: string;
const CURRENT = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : '';

// Id de esta compilación (para mostrarlo en la app y saber si es la última).
export const BUILD_ID = CURRENT;
// Etiqueta legible tipo "MM-DD HH:MM" a partir del id (timestamp del build).
export function buildLabel(): string {
  const n = Number(CURRENT);
  if (!n) return '';
  try {
    const d = new Date(n);
    const p = (x: number) => String(x).padStart(2, '0');
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch {
    return '';
  }
}

const SOFT_KEY = 'mya_reload_target'; // versión para la que ya intentamos recarga suave
const HARD_KEY = 'mya_hard_reload_target'; // versión para la que ya intentamos recarga dura

async function clearCaches() {
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {
    /* ignore */
  }
}

async function unregisterServiceWorkers() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    /* ignore */
  }
}

const read = (k: string) => {
  try {
    return sessionStorage.getItem(k) ?? '';
  } catch {
    return '';
  }
};
const write = (k: string, v: string) => {
  try {
    sessionStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};

let checking = false;

async function check() {
  if (checking || !CURRENT || typeof fetch === 'undefined') return;
  checking = true;
  try {
    const res = await fetch(`/version.json?_=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = (await res.json()) as { id?: string };
    const serverId = data?.id;
    if (!serverId || serverId === CURRENT) return;

    // Hay una versión nueva. Pedimos también al service worker que se actualice.
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        await reg?.update();
      }
    } catch {
      /* ignore */
    }

    const softTried = read(SOFT_KEY) === serverId;
    if (!softTried) {
      // Paso 1: recarga suave (conserva el service worker y el push).
      write(SOFT_KEY, serverId);
      await clearCaches();
      window.location.reload();
      return;
    }

    // La recarga suave no bastó: seguimos en la versión vieja.
    const hardTried = read(HARD_KEY) === serverId;
    if (!hardTried) {
      // Paso 2: recarga dura (da de baja el service worker atorado y limpia todo).
      write(HARD_KEY, serverId);
      await clearCaches();
      await unregisterServiceWorkers();
      window.location.reload();
      return;
    }
    // Ya intentamos ambos pasos para esta versión: no hacemos bucle. Se
    // reintentará en el siguiente despliegue.
  } catch {
    /* sin red o error: se reintenta luego */
  } finally {
    checking = false;
  }
}

export function startVersionWatch() {
  check();
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', check);
    // pageshow cubre cuando la app instalada se reanuda desde segundo plano
    // (en Android/iOS muchas veces no dispara 'focus' ni 'visibilitychange').
    window.addEventListener('pageshow', () => check());
    setInterval(check, 30000); // revisa cada 30 s mientras está abierta
  }
}
