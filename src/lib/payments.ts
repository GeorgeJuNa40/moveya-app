import { supabase } from './supabase';
import { notifyError } from './notify';

// Datos para iniciar un pago con Stripe (vía la Edge Function stripe-checkout).
type CheckoutBody =
  | { kind: 'package'; packageId: string }
  | { kind: 'subscription'; plan: string };

// Pide a Stripe una sesión de pago y redirige a su página segura.
// Devuelve false si algo falla (para que quien llama reactive el botón).
export async function startStripeCheckout(body: CheckoutBody): Promise<boolean> {
  try {
    // Enviamos el origen actual para que Stripe regrese EXACTAMENTE al mismo
    // dominio desde donde el alumno/estudio inició (así conserva su sesión y no
    // cae en el login). El servidor lo valida contra dominios permitidos.
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const { data, error } = await supabase.functions.invoke('stripe-checkout', { body: { ...body, origin } });
    if (error) {
      // Intenta leer el mensaje real que devolvió la función para mostrarlo.
      let detail = error.message || 'Error desconocido';
      try {
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.clone === 'function') {
          const b = await ctx.clone().json();
          if (b?.error) detail = String(b.error);
        }
      } catch {
        /* si no hay cuerpo JSON, se queda el mensaje base */
      }
      console.error('stripe-checkout error:', error, detail);
      notifyError('pago', detail);
      return false;
    }
    const url = (data as { url?: string } | null)?.url;
    if (!url) {
      notifyError('pago', 'No se recibió el enlace de pago.');
      return false;
    }
    window.location.href = url; // redirige a la página segura de Stripe Checkout
    return true;
  } catch (e) {
    console.error('stripe-checkout exception:', e);
    notifyError('pago', String((e as Error)?.message ?? e));
    return false;
  }
}

// ---------------------------------------------------------------------------
// Stripe Connect: cada estudio conecta su propia cuenta para recibir los pagos
// de sus alumnos directo en su banco (la app no toca ese dinero).
// ---------------------------------------------------------------------------
export interface ConnectStatus {
  connected: boolean;
  chargesEnabled: boolean;
}

// Llama a la Edge Function stripe-connect y devuelve su JSON (o lanza el error).
async function invokeConnect(action: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('stripe-connect', { body: { action } });
  if (error) {
    let detail = error.message || 'Error desconocido';
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.clone === 'function') {
        const b = await ctx.clone().json();
        if (b?.error) detail = String(b.error);
      }
    } catch {
      /* sin cuerpo JSON: se queda el mensaje base */
    }
    throw new Error(detail);
  }
  return (data as Record<string, unknown>) ?? {};
}

// Inicia (o continúa) el registro del estudio en Stripe y redirige a su página.
export async function startStripeOnboarding(): Promise<boolean> {
  try {
    const data = await invokeConnect('onboard');
    const url = data.url as string | undefined;
    if (!url) {
      notifyError('cuenta de pagos', 'No se recibió el enlace de registro.');
      return false;
    }
    window.location.href = url;
    return true;
  } catch (e) {
    notifyError('cuenta de pagos', String((e as Error)?.message ?? e));
    return false;
  }
}

// Consulta si el estudio ya conectó su cuenta y si puede recibir cobros.
export async function getStripeConnectStatus(): Promise<ConnectStatus> {
  try {
    const data = await invokeConnect('status');
    return {
      connected: Boolean(data.connected),
      chargesEnabled: Boolean(data.chargesEnabled),
    };
  } catch {
    return { connected: false, chargesEnabled: false };
  }
}

// Abre el panel de Stripe del estudio (ver cobros y pagos) en una pestaña nueva.
export async function openStripeDashboard(): Promise<void> {
  try {
    const data = await invokeConnect('dashboard');
    const url = data.url as string | undefined;
    if (url) window.open(url, '_blank', 'noopener');
    else notifyError('cuenta de pagos', 'No se pudo abrir tu panel de Stripe.');
  } catch (e) {
    notifyError('cuenta de pagos', String((e as Error)?.message ?? e));
  }
}
