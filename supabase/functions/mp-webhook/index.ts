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

// Lee un recurso de MP (pago o preapproval) probando primero el token de la
// PLATAFORMA (cobros que cobra la plataforma: SaaS, promo) y, si no lo puede
// leer, el token de CADA estudio conectado. Un pago de marketplace pertenece a
// la cuenta del vendedor (el estudio), así que la plataforma no puede leerlo:
// hay que usar el token de ese estudio. El token de un estudio solo puede leer
// SUS propios recursos (los ajenos devuelven 404), así que esto no cruza datos.
async function readWithAnyToken(path: string): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const first = await mpGet(path, PLATFORM_TOKEN);
  if (first.ok && first.data?.status) return first;
  const { data: accts } = await admin
    .from('mp_accounts')
    .select('access_token')
    .eq('connected', true)
    .not('access_token', 'is', null);
  for (const a of accts ?? []) {
    const r = await mpGet(path, a.access_token as string);
    if (r.ok && r.data?.status) return r;
  }
  return first; // devuelve el primer intento (fallido) para no romper el flujo
}

type Ref = { kind?: string; user_id?: string; studio_id?: string; package_id?: string; order_id?: string; plan?: string; founder?: boolean };
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
      const { ok, data: pay } = await readWithAnyToken(`/v1/payments/${id}`);
      const ref = parseRef(pay?.external_reference);
      const preId = (pay?.metadata as Record<string, unknown>)?.preapproval_id ?? pay?.preapproval_id ?? null;
      console.log('mp-wh payment:', JSON.stringify({ id, status: pay?.status, kind: ref.kind, studio: ref.studio_id, preId }));
      if (!ok || pay?.status !== 'approved') return new Response('ok', { status: 200 });

      if (ref.kind === 'package') {
        await applyPackage(ref, String(id), Number(pay.transaction_amount) || 0);
      } else if (ref.kind === 'store' && ref.order_id) {
        await applyStoreOrder(ref, String(id), Number(pay.transaction_amount) || 0);
      } else if (ref.kind === 'promo' && ref.studio_id) {
        // Promo de bienvenida pagada → abre 14 días de acceso Premium.
        await applyPromo(ref, String(id));
      } else if (ref.kind === 'subscription' && ref.studio_id) {
        // Pago de la suscripción SaaS aprobado → activa el plan del estudio.
        await applySaaS(ref, String(preId ?? id), true);
      } else if (preId) {
        // El pago viene ligado a un preapproval: lo consultamos para su referencia.
        const { ok: pok, data: pre } = await readWithAnyToken(`/preapproval/${preId}`);
        if (pok) {
          const pref = parseRef(pre?.external_reference);
          if (pref.kind === 'subscription' && pref.studio_id) await applySaaS(pref, String(preId), pre?.status === 'authorized' || pay?.status === 'approved');
          if (pref.kind === 'membership_sub' && (pre?.status === 'authorized' || pay?.status === 'approved')) await applyMembership(pref, String(preId));
        }
      }
      return new Response('ok', { status: 200 });
    }

    if (type === 'preapproval' || type === 'subscription_preapproval') {
      const { ok, data: pre } = await readWithAnyToken(`/preapproval/${id}`);
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

// -------- Pedido de tienda pagado en linea: marca entregado + registra pago --------
async function applyStoreOrder(ref: Ref, mpPaymentId: string, amount: number) {
  const { data: existing } = await admin.from('payments').select('id').eq('mp_payment_id', mpPaymentId).maybeSingle();
  if (existing) return;
  const { data: order } = await admin.from('store_orders').select('*').eq('id', ref.order_id).single();
  if (!order) return;
  // Entrega atomica: marca entregado, DESCUENTA STOCK y registra cada venta en
  // product_sales (sold_by='online'). Idempotente por el estado del pedido.
  await admin.rpc('fulfill_store_order', {
    p_order_id: order.id,
    p_provider: 'mercadopago',
    p_paid_ref: mpPaymentId,
  });
  await admin.from('payments').insert({
    id: crypto.randomUUID(), user_id: ref.user_id, amount_usd: amount || order.total, method: 'card',
    concept: 'Tienda: pedido en linea', paid_at: new Date().toISOString(), registered_by: 'online',
    provider: 'mercadopago', mp_payment_id: mpPaymentId,
  });
}

// -------- Promo de bienvenida: abre 14 días de acceso Premium (idempotente) --------
async function applyPromo(ref: Ref, mpPaymentId: string) {
  const { data: studio } = await admin.from('studios').select('subscription, whatsapp').eq('id', ref.studio_id).single();
  const sub = studio?.subscription ?? {};
  if (sub.promoPaymentId === mpPaymentId) return; // ya aplicada
  const end = new Date(Date.now() + 14 * DAY);
  const next = {
    ...sub,
    status: 'TRIALING', plan: 'premium', isPromo: true, provider: 'mercadopago',
    trialDays: 14, trialEndsAt: end.toISOString(), currentPeriodEnd: end.toISOString(),
    promoPaymentId: mpPaymentId,
  };
  // El bot con IA (costo) NO se enciende en la promo; se activa al pagar Premium.
  const whatsapp = { ...(studio?.whatsapp ?? {}), aiActive: false };
  await admin.from('studios').update({ subscription: next, whatsapp }).eq('id', ref.studio_id);
}

// -------- Suscripción SaaS del estudio (activar/cancelar) --------
async function applySaaS(ref: Ref, preapprovalId: string, active: boolean) {
  const { data: studio } = await admin.from('studios').select('subscription, whatsapp').eq('id', ref.studio_id).single();
  const end = new Date(Date.now() + 30 * DAY);
  const next = {
    ...(studio?.subscription ?? {}),
    status: active ? 'ACTIVE' : 'PAST_DUE',
    plan: ref.plan, founder: !!ref.founder, isPromo: false, provider: 'mercadopago', mpPreapprovalId: preapprovalId,
    currentPeriodEnd: end.toISOString(),
  };
  // Premium (y Fundador, que ES premium) incluye el bot con IA.
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
