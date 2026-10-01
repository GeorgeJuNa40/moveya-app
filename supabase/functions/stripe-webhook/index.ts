// ============================================================================
// Move yA — Edge Function: stripe-webhook
// ----------------------------------------------------------------------------
// Stripe llama a esta función cuando un pago se confirma. Aquí (en el servidor,
// no en el navegador) creamos el registro real:
//   - Paquete de alumno  -> crea user_package + payment
//   - Suscripción estudio -> marca la suscripción del estudio como ACTIVE
//
// Escribe con la SERVICE ROLE KEY (salta RLS). Es idempotente: si Stripe reenvía
// el mismo evento, no duplica (usa payments.stripe_session_id).
//
// Requiere estos "secrets" en Supabase:
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY
//   (opcional) STRIPE_WEBHOOK_SECRET_CONNECT para el webhook de cuentas conectadas.
//
// IMPORTANTE: despliega esta función con "Enforce JWT" DESACTIVADO (Stripe no
// envía un JWT de usuario; la seguridad la da la firma del webhook).
// ============================================================================
import Stripe from 'npm:stripe@17.0.0';
import { createClient } from 'npm:@supabase/supabase-js@2';

// httpClient de tipo fetch: obligatorio para que Stripe funcione en Supabase (Deno).
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});
// Proveedor de criptografía para verificar la firma del webhook en Deno.
const cryptoProvider = Stripe.createSubtleCryptoProvider();
// Se aceptan DOS secretos: uno para los eventos de tu cuenta (suscripciones) y
// otro para los de las cuentas conectadas (pagos de alumnos con Stripe Connect).
// Cada webhook de Stripe tiene su propio secreto; probamos ambos.
const webhookSecrets = [
  Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '',
  Deno.env.get('STRIPE_WEBHOOK_SECRET_CONNECT') ?? '',
].filter(Boolean);

// Cliente administrador (service role) — solo existe aquí, en el servidor.
const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const DAY = 86400000;

Deno.serve(async (req) => {
  const sig = req.headers.get('stripe-signature') ?? '';
  const raw = await req.text();

  // Verifica la firma probando cada secreto (tu cuenta o cuentas conectadas).
  let event: Stripe.Event | null = null;
  let lastErr = 'sin secreto configurado';
  for (const secret of webhookSecrets) {
    try {
      event = await stripe.webhooks.constructEventAsync(raw, sig, secret, undefined, cryptoProvider);
      break;
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }
  if (!event) return new Response(`Firma inválida: ${lastErr}`, { status: 400 });

  try {
    if (event.type === 'checkout.session.completed') {
      const s = event.data.object as Stripe.Checkout.Session;
      const m = (s.metadata ?? {}) as Record<string, string>;
      if (m.kind === 'package') await applyPackage(m, s);
      else if (m.kind === 'membership_sub') await applyMembershipSub(m, s);
      else if (m.kind === 'subscription') await applySubscription(m, s);
    }
    // Renovación mensual: Stripe cobró el siguiente periodo -> extiende el acceso.
    else if (event.type === 'invoice.payment_succeeded' || event.type === 'invoice.paid') {
      const inv = event.data.object as Stripe.Invoice;
      // deno-lint-ignore no-explicit-any
      const subId = (inv as any).subscription as string | null;
      if (subId) {
        // Primero intenta la suscripción del estudio (SaaS); si no es, la de un
        // miembro (domiciliación de su membresía).
        const handled = await renewSubscription(subId, inv);
        if (!handled) await renewMembership(subId, inv);
      }
    }
    // Impago: marca la suscripción del estudio como vencida (el panel se limita).
    else if (event.type === 'invoice.payment_failed') {
      const inv = event.data.object as Stripe.Invoice;
      // deno-lint-ignore no-explicit-any
      const subId = (inv as any).subscription as string | null;
      if (subId) await setSubStatus(subId, 'PAST_DUE');
    }
    // Cancelación: la suscripción se dio de baja en Stripe (estudio o membresía).
    else if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as Stripe.Subscription;
      const handled = await setSubStatus(sub.id, 'CANCELED');
      if (!handled) await deactivateMembership(sub.id);
    }
  } catch (e) {
    // Devolver 500 hace que Stripe reintente el evento más tarde.
    return new Response(`Error: ${(e as Error).message}`, { status: 500 });
  }

  return new Response('ok', { status: 200 });
});

async function applyPackage(m: Record<string, string>, s: Stripe.Checkout.Session) {
  // Idempotencia: si ya registramos este pago, no lo dupliques.
  const { data: existing } = await admin
    .from('payments')
    .select('id')
    .eq('stripe_session_id', s.id)
    .maybeSingle();
  if (existing) return;

  const { data: pkg } = await admin
    .from('packages')
    .select('*')
    .eq('id', m.package_id)
    .single();
  if (!pkg) return;

  const now = new Date();
  const expires = new Date(now.getTime() + pkg.validity_days * DAY);

  const pkgKind = pkg.kind === 'access' ? 'access' : 'credits';
  await admin.from('user_packages').insert({
    id: crypto.randomUUID(),
    user_id: m.user_id,
    package_id: pkg.id,
    kind: pkgKind,
    credits_total: pkgKind === 'access' ? 0 : pkg.class_credits,
    credits_used: 0,
    purchased_at: now.toISOString(),
    expires_at: expires.toISOString(),
    active: true,
  });

  await admin.from('payments').insert({
    id: crypto.randomUUID(),
    user_id: m.user_id,
    amount_usd: pkg.price_usd,
    method: 'card',
    package_id: pkg.id,
    concept: pkg.name,
    paid_at: now.toISOString(),
    registered_by: 'online',
    stripe_session_id: s.id,
  });
}

// Precios mensuales de referencia (informativos) — deben coincidir con plans.ts.
const PLAN_PRICE_USD: Record<string, number> = { inicio: 24.99, pro: 44.99, premium: 84.99 };

async function applySubscription(m: Record<string, string>, s: Stripe.Checkout.Session) {
  const end = new Date(Date.now() + 30 * DAY);
  const { data: studio } = await admin
    .from('studios')
    .select('subscription, whatsapp')
    .eq('id', m.studio_id)
    .single();

  const plan = m.plan; // 'inicio' | 'pro' | 'premium' (el fundador llega como 'premium')
  const isFounder = m.founder === '1';
  // Fundador: Premium al precio de Pro + el bot ($10) en un solo cargo.
  const priceUsd = isFounder ? PLAN_PRICE_USD.pro + 10 : (PLAN_PRICE_USD[plan] ?? 0);

  const next = {
    ...(studio?.subscription ?? {}),
    status: 'ACTIVE',
    plan,
    priceUsd,
    isPromo: false, // ya está pagando: termina la promo de lanzamiento
    founder: isFounder,
    currentPeriodEnd: end.toISOString(),
    stripeCustomerId: s.customer,
    stripeSubscriptionId: s.subscription,
  };

  // El bot de WhatsApp con IA viene INCLUIDO en Premium (y en el plan Fundador).
  // Al pagar Premium se enciende; en Inicio/Pro se apaga (no lo pagan).
  const whatsapp = { ...(studio?.whatsapp ?? {}), aiActive: plan === 'premium' };

  await admin.from('studios').update({ subscription: next, whatsapp }).eq('id', m.studio_id);
}

// Busca el estudio dueño de una suscripción de Stripe (guardada en el jsonb).
async function findStudioBySub(subId: string) {
  const { data } = await admin
    .from('studios')
    .select('id, subscription')
    .eq('subscription->>stripeSubscriptionId', subId)
    .maybeSingle();
  return data ?? null;
}

// Renovación: extiende el acceso hasta el fin del nuevo periodo pagado y deja
// la suscripción ACTIVE. NO toca plan/aiActive/founder (eso se fijó al contratar).
async function renewSubscription(subId: string, inv: Stripe.Invoice): Promise<boolean> {
  const studio = await findStudioBySub(subId);
  if (!studio) return false; // no es del estudio: puede ser una membresía de miembro
  // deno-lint-ignore no-explicit-any
  const periodEnd = (inv as any)?.lines?.data?.[0]?.period?.end as number | undefined;
  const end = periodEnd ? new Date(periodEnd * 1000) : new Date(Date.now() + 30 * DAY);
  const next = {
    ...(studio.subscription ?? {}),
    status: 'ACTIVE',
    currentPeriodEnd: end.toISOString(),
  };
  await admin.from('studios').update({ subscription: next }).eq('id', studio.id);
  return true;
}

// Cambia el estado de la suscripción del ESTUDIO. Devuelve false si el subId no
// pertenece a ningún estudio (entonces será la membresía de un miembro).
async function setSubStatus(subId: string, status: 'PAST_DUE' | 'CANCELED'): Promise<boolean> {
  const studio = await findStudioBySub(subId);
  if (!studio) return false;
  const next = { ...(studio.subscription ?? {}), status };
  await admin.from('studios').update({ subscription: next }).eq('id', studio.id);
  return true;
}

// ---------------------------------------------------------------------------
// MEMBRESÍAS DOMICILIADAS (cobro mensual de un miembro, en la cuenta del gym)
// ---------------------------------------------------------------------------

// Alta: al completar el checkout de una membresía recurrente, crea el
// user_package de acceso y guarda su suscripción de Stripe. Idempotente.
async function applyMembershipSub(m: Record<string, string>, s: Stripe.Checkout.Session) {
  const subId = (typeof s.subscription === 'string' ? s.subscription : null) ?? null;
  // Idempotencia: si ya existe un user_package para esta suscripción, no dupliques.
  if (subId) {
    const { data: existing } = await admin
      .from('user_packages')
      .select('id')
      .eq('stripe_subscription_id', subId)
      .maybeSingle();
    if (existing) return;
  }

  const { data: pkg } = await admin.from('packages').select('*').eq('id', m.package_id).single();
  if (!pkg) return;

  const now = new Date();
  const expires = new Date(now.getTime() + (pkg.validity_days || 30) * DAY);

  await admin.from('user_packages').insert({
    id: crypto.randomUUID(),
    user_id: m.user_id,
    package_id: pkg.id,
    kind: 'access',
    credits_total: 0,
    credits_used: 0,
    purchased_at: now.toISOString(),
    expires_at: expires.toISOString(),
    active: true,
    stripe_subscription_id: subId,
    cancel_at_period_end: false,
  });

  // Registra el primer pago (idempotente por la sesión de checkout).
  const { data: pay } = await admin.from('payments').select('id').eq('stripe_session_id', s.id).maybeSingle();
  if (!pay) {
    await admin.from('payments').insert({
      id: crypto.randomUUID(),
      user_id: m.user_id,
      amount_usd: pkg.price_usd,
      method: 'card',
      package_id: pkg.id,
      concept: `${pkg.name} (mensualidad)`,
      paid_at: now.toISOString(),
      registered_by: 'online',
      stripe_session_id: s.id,
    });
  }
}

// Renovación mensual de una membresía: extiende la vigencia al nuevo periodo y
// registra el pago. El primer cobro (subscription_create) ya lo hizo el checkout.
async function renewMembership(subId: string, inv: Stripe.Invoice) {
  const { data: up } = await admin
    .from('user_packages')
    .select('id, user_id, package_id')
    .eq('stripe_subscription_id', subId)
    .maybeSingle();
  if (!up) return; // no es una membresía domiciliada conocida

  // deno-lint-ignore no-explicit-any
  const reason = (inv as any)?.billing_reason as string | undefined;
  // deno-lint-ignore no-explicit-any
  const periodEnd = (inv as any)?.lines?.data?.[0]?.period?.end as number | undefined;
  const end = periodEnd ? new Date(periodEnd * 1000) : new Date(Date.now() + 30 * DAY);

  await admin
    .from('user_packages')
    .update({ expires_at: end.toISOString(), active: true })
    .eq('id', up.id);

  // El primer periodo ya se cobró en el checkout; solo registramos renovaciones.
  if (reason && reason !== 'subscription_cycle') return;
  const { data: pay } = await admin.from('payments').select('id').eq('stripe_session_id', inv.id).maybeSingle();
  if (pay) return; // idempotente por id de factura
  const { data: pkg } = await admin.from('packages').select('name, price_usd').eq('id', up.package_id).single();
  await admin.from('payments').insert({
    id: crypto.randomUUID(),
    user_id: up.user_id,
    amount_usd: pkg?.price_usd ?? 0,
    method: 'card',
    package_id: up.package_id,
    concept: `${pkg?.name ?? 'Membresía'} (renovación)`,
    paid_at: new Date().toISOString(),
    registered_by: 'online',
    stripe_session_id: inv.id,
  });
}

// Baja: la suscripción de la membresía se canceló en Stripe -> desactiva el acceso.
async function deactivateMembership(subId: string) {
  await admin
    .from('user_packages')
    .update({ active: false })
    .eq('stripe_subscription_id', subId);
}
