// ============================================================================
// Move yA — Auto-actualización (evita quedarse en una versión vieja)
// ----------------------------------------------------------------------------
// En cada despliegue, el build genera un id (__BUILD_ID__) y un archivo
// /version.json con ESE id. La app revisa /version.json (al abrir, al volver a
// la pestaña y cada minuto). Si el id del servidor es distinto al que está
// corriendo, hay una versión nueva publicada: limpiamos cachés y recargamos una
// sola vez. Así, aunque la app ya esté abierta o instalada, agarra lo más nuevo
// sin que el usuario tenga que recargar a mano.
// ============================================================================

declare const __BUILD_ID__: string;
const CURRENT = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : '';

const KEY = 'mya_reload_target'; // evita bucles de recarga

async function check() {
  if (!CURRENT || typeof fetch === 'undefined') return;
  try {
    const res = await fetch(`/version.json?_=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = (await res.json()) as { id?: string };
    const serverId = data?.id;
    if (!serverId || serverId === CURRENT) return;

    // Ya intentamos recargar para esta versión y seguimos en la vieja: no hacemos
    // bucle (la carga por red debería haberla actualizado). Se reintenta al
    // siguiente despliegue.
    let already = '';
    try { already = sessionStorage.getItem(KEY) ?? ''; } catch { /* ignore */ }
    if (already === serverId) return;
    try { sessionStorage.setItem(KEY, serverId); } catch { /* ignore */ }

    // Limpia las cachés del service worker y recarga para tomar la versión nueva.
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch { /* ignore */ }
    window.location.reload();
  } catch {
    /* sin red o error: se reintenta luego */
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
    setInterval(check, 60000); // revisa cada minuto mientras está abierta
  }
}
