// ============================================================================
// Move yA — Conexión de WhatsApp por estudio (Embedded Signup de Meta)
// ----------------------------------------------------------------------------
// Deja que CADA estudio conecte su propio número de WhatsApp desde la app, con
// el flujo oficial de Meta (Embedded Signup). El navegador solo obtiene un
// "code" temporal + los ids del número/cuenta; el intercambio por el token real
// lo hace el servidor (Edge Function whatsapp-connect), que guarda el token en
// una tabla protegida. Aquí NUNCA se maneja el token de acceso.
//
// Config (variables públicas de Vercel — NO son secretos):
//   VITE_FB_APP_ID        -> el App ID de tu app de Meta.
//   VITE_FB_CONFIG_ID     -> el "configuration ID" del Embedded Signup de WhatsApp.
//   VITE_FB_GRAPH_VERSION -> (opcional) versión del Graph API, por defecto v21.0.
// ============================================================================
import { supabase } from './supabase';

const FB_APP_ID = import.meta.env.VITE_FB_APP_ID as string | undefined;
const FB_CONFIG_ID = import.meta.env.VITE_FB_CONFIG_ID as string | undefined;
const GRAPH_VERSION = (import.meta.env.VITE_FB_GRAPH_VERSION as string | undefined) || 'v21.0';

// ¿La plataforma ya configuró Meta? Si no, el botón se muestra deshabilitado.
export function whatsappSignupAvailable(): boolean {
  return Boolean(FB_APP_ID && FB_CONFIG_ID);
}

interface FBType {
  init: (o: Record<string, unknown>) => void;
  login: (cb: (r: { authResponse?: { code?: string } }) => void, o: Record<string, unknown>) => void;
}
function fb(): FBType | undefined {
  return (window as unknown as { FB?: FBType }).FB;
}

// Carga el SDK de Facebook una sola vez y lo inicializa.
let sdkPromise: Promise<void> | null = null;
function loadSdk(): Promise<void> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<void>((resolve, reject) => {
    const init = () => {
      fb()!.init({ appId: FB_APP_ID, autoLogAppEvents: true, xfbml: false, version: GRAPH_VERSION });
      resolve();
    };
    if (fb()) return init();
    const s = document.createElement('script');
    s.src = 'https://connect.facebook.net/en_US/sdk.js';
    s.async = true; s.defer = true; s.crossOrigin = 'anonymous';
    s.onload = () => init();
    s.onerror = () => { sdkPromise = null; reject(new Error('No se pudo cargar el SDK de Facebook.')); };
    document.body.appendChild(s);
  });
  return sdkPromise;
}

export interface SignupResult {
  code: string;
  phoneNumberId?: string;
  wabaId?: string;
}

// Abre el diálogo de Embedded Signup y devuelve el code + ids del número/cuenta.
export async function launchWhatsAppSignup(): Promise<SignupResult> {
  if (!whatsappSignupAvailable()) {
    throw new Error('La conexión de WhatsApp aún no está configurada por la plataforma.');
  }
  await loadSdk();

  // Meta manda los ids (phone_number_id, waba_id) por un postMessage aparte.
  const session: { phoneNumberId?: string; wabaId?: string } = {};
  const onMessage = (e: MessageEvent) => {
    if (typeof e.origin !== 'string' || !/facebook\.com$/.test(new URL(e.origin).hostname)) return;
    try {
      const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      if (d?.type === 'WA_EMBEDDED_SIGNUP') {
        if (d.data?.phone_number_id) session.phoneNumberId = d.data.phone_number_id;
        if (d.data?.waba_id) session.wabaId = d.data.waba_id;
      }
    } catch { /* mensajes no-JSON de Meta: se ignoran */ }
  };
  window.addEventListener('message', onMessage);

  try {
    const code = await new Promise<string>((resolve, reject) => {
      fb()!.login(
        (resp) => {
          const c = resp?.authResponse?.code;
          if (c) resolve(c);
          else reject(new Error('Conexión cancelada.'));
        },
        {
          config_id: FB_CONFIG_ID,
          response_type: 'code',
          override_default_response_type: true,
          extras: { setup: {}, featureType: '', sessionInfoVersion: '3' },
        },
      );
    });
    return { code, ...session };
  } finally {
    window.removeEventListener('message', onMessage);
  }
}

export interface ConnectResult {
  connected: boolean;
  number?: string;
  verifiedName?: string;
  phoneNumberId?: string;
  wabaId?: string;
}

// Envía el code al servidor para completar la conexión (intercambio de token,
// suscripción del webhook y guardado del número). Devuelve el estado final.
export async function connectWhatsApp(payload: SignupResult): Promise<ConnectResult> {
  const { data, error } = await supabase.functions.invoke('whatsapp-connect', { body: payload });
  if (error) {
    let detail = error.message || 'No se pudo conectar WhatsApp.';
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.clone === 'function') {
        const b = await ctx.clone().json();
        if (b?.error) detail = String(b.error);
      }
    } catch { /* sin cuerpo JSON: se queda el mensaje base */ }
    throw new Error(detail);
  }
  return (data as ConnectResult) ?? { connected: false };
}
