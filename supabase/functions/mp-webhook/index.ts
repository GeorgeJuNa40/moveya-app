// ============================================================================
// Move yA — Edge Function: mp-webhook  (Mercado Pago · notificaciones)
// ----------------------------------------------------------------------------
// MP avisa aquí cuando un pago/suscripción cambia de estado. Activamos el plan
// del estudio o creamos el paquete del alumno. Idempotente.
// Desplegar con "Verify JWT" DESACTIVADO (MP no manda JWT de usuario).
// ============================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const MP_API = 'https://api.mercadopago.com';
const PLATFORM_TOKEN = Deno.env.get('MP_ACCESS_TOKEN') ?? '';
const DAY = 86400000;

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

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
    const type = url.searchParams.get('type') || url.searchParams.get('topic') || body?.type || body?.topic || '';
    const id = url.searchParams.get('data.id') || url.searchParams.get('id') || body?.data?.id || body?.id || '';
    if (!id) return new Response('ok', { status: 200 });

    if (type === 'payment') {
      let { ok, data: pay } = await mpGet(`/v1/payments/${id}`, PLATFORM_TOKEN);
      let ref = parseRef(pay?.external_reference);
      if ((!ok || !pay?.status) && ref.studio_id) {
        const t = await studioToken(ref.studio_id);
        if (t) ({ ok, data: pay } = await mpGet(`/v1/payments/${id}`, t));
      }
      const preId = pay?.metadata?.preapproval_id ?? pay?.preapproval_id ?? null;
      console.log('mp-wh payment:', JSON.stringify({ id, status: pay?.status, kind: ref.kind, studio: ref.studio_id, preId }));
      if (!ok || pay?.status !== 'approved') return new Response('ok', { status: 200 });

      if (ref.kind === 'package') {
        await applyPackage(ref, String(id), Number(pay.transaction_amount) || 0);
      } else if (ref.kind === 'subscription' && ref.studio_id) {
        // Pago de la suscripción SaaS aprobado → activa el plan del estudio.
        await applySaaS(ref, String(preId ?? id), true);
      } else if (preId) {
        // El pago viene ligado a un preapproval: lo consultamos para su referencia.
        const { ok: pok, data: pre } = await mpGet(`/preapproval/${preId}`, PLATFORM_TOKEN);
        if (pok) {
          const pref = parseRef(pre?.external_reference);
          if (pref.kind === 'subscription' && pref.studio_id) await applySaaS(pref, String(preId), pre?.status === 'authorized' || pay?.status === 'approved');
          if (pref.kind === 'membership_sub' && (pre?.status === 'authorized' || pay?.status === 'approved')) await applyMembership(pref, String(preId));
        }
      }
      return new Response('ok', { status: 200 });
    }

    if (type === 'preapproval' || type === 'subscription_preapproval') {
      const { ok, data: pre } = await mpGet(`/preapproval/${id}`, PLATFORM_TOKEN);
      if (!ok) return new Response('ok', { status: 200 });
      const ref = parseRef(pre?.external_reference);
      const active = pre?.status === 'authorized';
      console.log('mp-wh preapproval:', JSON.stringify({ id, status: pre?.status, kind: ref.kind, studio: ref.studio_id }));
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
