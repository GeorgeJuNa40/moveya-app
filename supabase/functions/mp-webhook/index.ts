// ============================================================================
// Move yA — Edge Function: mp-webhook  (Mercado Pago · notificaciones)
// ----------------------------------------------------------------------------
// Espejo de `stripe-webhook`. MP avisa aquí cuando un pago/suscripción cambia de
// estado. En el servidor creamos el registro real (user_package + payment) o
// activamos la suscripción del estudio. Idempotente.
//
// Secrets: MP_ACCESS_TOKEN (plataforma), SUPABASE_SERVICE_ROLE_KEY,
//          (opcional) MP_WEBHOOK_SECRET para validar la firma x-signature.
//
// IMPORTANTE: desplegar con "Verify JWT" DESACTIVADO (MP no manda JWT de usuario).
//
// TODO (al probar con credenciales): confirmar con qué token se consulta cada
// pago de marketplace (plataforma vs. token del estudio) y la validación de la
// firma x-signature según la doc vigente de MP.
// ============================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const MP_API = 'https://api.mercadopago.com';
const PLATFORM_TOKEN = Deno.env.get('MP_ACCESS_TOKEN') ?? '';
const DAY = 86400000;

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

// Lee un recurso de MP. Para pagos de marketplace puede requerir el token del
// estudio; si el de la plataforma no sirve, se reintenta con el del estudio.
async function mpGet(path: string, token: string) {
  const res = await fetch(`${MP_API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

async function studioToken(studioId: string): Promise<string | null> {
  const { data } = await admin.from('mp_accounts').select('access_token').eq('studio_id', studioId).maybeSingle();
  return data?.access_token ?? null;
}

type Ref = { kind?: string; user_id?: string; studio_id?: string; package_id?: string; plan?: string };
const parseRef = (s: unknown): Ref => { try { return JSON.parse(String(s)); } catch { return {}; } };

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok', { status: 200 });
  try {
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    // MP manda el tipo por query (?type=payment&data.id=) o en el cuerpo.
    const type = url.searchParams.get('type') || url.searchParams.get('topic') || body?.type || body?.topic || '';
    const id = url.searchParams.get('data.id') || url.searchParams.get('id') || body?.data?.id || body?.id || '';
    if (!id) return new Response('ok', { status: 200 });

    if (type === 'payment') {
      // Primero intenta con el token de la plataforma; si no, buscará el del estudio.
      let { ok, data: pay } = await mpGet(`/v1/payments/${id}`, PLATFORM_TOKEN);
      const ref = parseRef(pay?.external_reference);
      if ((!ok || !pay?.status) && ref.studio_id) {
        const t = await studioToken(ref.studio_id);
        if (t) ({ ok, data: pay } = await mpGet(`/v1/payments/${id}`, t));
      }
      if (!ok || pay?.status !== 'approved') return new Response('ok', { status: 200 });
      if (ref.kind === 'package') await applyPackage(ref, String(id), Number(pay.transaction_amount) || 0);
      // Las renovaciones de membresía llegan como 'payment' ligadas a un preapproval:
      if (pay?.metadata?.preapproval_id || pay?.point_of_interaction) {/* TODO renovación membresía */}
      return new Response('ok', { status: 200 });
    }

    if (type === 'preapproval' || type === 'subscription_preapproval') {
      const { ok, data: pre } = await mpGet(`/preapproval/${id}`, PLATFORM_TOKEN);
      if (!ok) return new Response('ok', { status: 200 });
      const ref = parseRef(pre?.external_reference);
      const active = pre?.status === 'authorized';
      if (ref.kind === 'subscription' && ref.studio_id) await applySaaS(ref, String(id), active);
      if (ref.kind === 'membership_sub' && active) await applyMembership(ref, String(id));
      return new Response('ok', { status: 200 });
    }

    return new Response('ok', { status: 200 });
  } catch (e) {
    return new Response(`Error: ${(e as Error).message}`, { status: 500 });
  }
});

// -------- Paquete de alumno: crea user_package + payment (idempotente) --------
async function applyPackage(ref: Ref, mpPaymentId: string, amount: number) {
  const { data: existing } = await admin.from('payments').select('id').eq('mp_payment_id', mpPaymentId).maybeSingle();
  if (existing) return;
  const { data: pkg } = await admin.from('packages').select('*').eq('id', ref.package_id).single();
  if (!pkg) return;
  const now = new Date();
  const expires = new Date(now.getTime() + pkg.validity_days * DAY);
  const pkgKind = pkg.kind === 'access' ? 'access' : 'credits';
  await admin.from('user_packages').insert({
    id: crypto.randomUUID(), user_id: ref.user_id, package_id: pkg.id, kind: pkgKind,
    credits_total: pkgKind === 'access' ? 0 : pkg.class_credits, credits_used: 0,
    purchased_at: now.toISOString(), expires_at: expires.toISOString(), active: true, provider: 'mercadopago',
  });
  await admin.from('payments').insert({
    id: crypto.randomUUID(), user_id: ref.user_id, amount_usd: amount || pkg.price_usd, method: 'card',
    package_id: pkg.id, concept: pkg.name, paid_at: now.toISOString(), registered_by: 'online',
    provider: 'mercadopago', mp_payment_id: mpPaymentId,
  });
}

// -------- Suscripción SaaS del estudio (activar/cancelar) --------
async function applySaaS(ref: Ref, preapprovalId: string, active: boolean) {
  const { data: studio } = await admin.from('studios').select('subscription, whatsapp').eq('id', ref.studio_id).single();
  const end = new Date(Date.now() + 30 * DAY);
  const next = {
    ...(studio?.subscription ?? {}),
    status: active ? 'ACTIVE' : 'PAST_DUE',
    plan: ref.plan, isPromo: false, provider: 'mercadopago', mpPreapprovalId: preapprovalId,
    currentPeriodEnd: end.toISOString(),
  };
  const whatsapp = { ...(studio?.whatsapp ?? {}), aiActive: ref.plan === 'premium' && active };
  await admin.from('studios').update({ subscription: next, whatsapp }).eq('id', ref.studio_id);
}

// -------- Membresía domiciliada por MP: crea el acceso (idempotente) --------
async function applyMembership(ref: Ref, preapprovalId: string) {
  const { data: existing } = await admin.from('user_packages').select('id').eq('mp_preapproval_id', preapprovalId).maybeSingle();
  if (existing) return;
  const { data: pkg } = await admin.from('packages').select('*').eq('id', ref.package_id).single();
  if (!pkg) return;
  const now = new Date();
  const expires = new Date(now.getTime() + (pkg.validity_days || 30) * DAY);
  await admin.from('user_packages').insert({
    id: crypto.randomUUID(), user_id: ref.user_id, package_id: pkg.id, kind: 'access',
    credits_total: 0, credits_used: 0, purchased_at: now.toISOString(), expires_at: expires.toISOString(),
    active: true, provider: 'mercadopago', mp_preapproval_id: preapprovalId,
  });
}
