// ============================================================================
// Move yA — Edge Function: mp-checkout  (Mercado Pago · crear pago)
// ----------------------------------------------------------------------------
// Espejo de `stripe-checkout` para Mercado Pago. Crea el link de pago (Checkout
// Pro) o la suscripción (Preapproval) según el `kind`:
//   - 'package'        -> pago único de un paquete (en la cuenta MP del estudio,
//                         con marketplace_fee = comisión de Move yA).
//   - 'membership_sub' -> membresía mensual (preapproval en la cuenta del estudio).
//   - 'subscription'   -> suscripción SaaS del estudio -> Move yA (preapproval en
//                         la cuenta MP de la PLATAFORMA).
//
// La app NUNCA ve datos de tarjeta: se capturan en la página segura de MP.
//
// Secrets: MP_ACCESS_TOKEN (plataforma, para la suscripción SaaS), APP_URL,
//          PLATFORM_FEE_PERCENT (misma comisión que Stripe).
// Desplegar con "Verify JWT" ACTIVADO.
// ============================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const MP_API = 'https://api.mercadopago.com';
const PLATFORM_TOKEN = Deno.env.get('MP_ACCESS_TOKEN') ?? '';
const APP_URL = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '');
const FEE_PERCENT = Number(Deno.env.get('PLATFORM_FEE_PERCENT') ?? '0') || 0;

// Precios de la suscripción SaaS en MXN (MP México cobra en pesos). Mensuales y
// anuales (2 meses gratis). Ajustables por secret sin tocar código.
const SAAS_MXN: Record<string, number> = {
  inicio: Number(Deno.env.get('MP_PLAN_INICIO_MXN') ?? '499') || 499,
  pro: Number(Deno.env.get('MP_PLAN_PRO_MXN') ?? '899') || 899,
  premium: Number(Deno.env.get('MP_PLAN_PREMIUM_MXN') ?? '1699') || 1699,
};
const SAAS_MXN_YEAR: Record<string, number> = {
  inicio: Number(Deno.env.get('MP_PLAN_INICIO_MXN_YEAR') ?? '4990') || 4990,
  pro: Number(Deno.env.get('MP_PLAN_PRO_MXN_YEAR') ?? '8990') || 8990,
  premium: Number(Deno.env.get('MP_PLAN_PREMIUM_MXN_YEAR') ?? '16990') || 16990,
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Comisión de Move yA (marketplace_fee) en unidades de la moneda (no centavos).
const fee = (amount: number) => (FEE_PERCENT > 0 ? Math.round(amount * (FEE_PERCENT / 100) * 100) / 100 : 0);

// URL del webhook de MP (donde MP avisa los pagos).
const notifyUrl = () => `${Deno.env.get('SUPABASE_URL')}/functions/v1/mp-webhook`;

async function mpFetch(path: string, token: string, body: unknown) {
  const res = await fetch(`${MP_API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return json({ error: 'No autorizado' }, 401);
    const { data: me } = await supabase.from('users').select('id, studio_id, role, email').eq('id', user.id).single();
    if (!me) return json({ error: 'Usuario no encontrado' }, 404);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));
    const kind = String(body.kind ?? '');
    // En sandbox el comprador debe ser un usuario de prueba (si no, MP rechaza con
    // "payer and collector must be real or test users"). MP_TEST_PAYER_EMAIL
    // fuerza ese correo de prueba; en producción NO se define y usa el real.
    const payerEmail = Deno.env.get('MP_TEST_PAYER_EMAIL') || me.email;

    // Token MP del estudio (marketplace). Necesario para cobros de alumnos.
    const studioToken = async (studioId: string): Promise<string | null> => {
      const { data } = await admin.from('mp_accounts').select('access_token, connected').eq('studio_id', studioId).maybeSingle();
      return data?.connected && data?.access_token ? data.access_token : null;
    };

    // --------- Pago único de un paquete (cuenta del estudio + comisión) ---------
    if (kind === 'package') {
      const { data: pkg } = await supabase.from('packages').select('*').eq('id', body.packageId).single();
      if (!pkg) return json({ error: 'Paquete no encontrado' }, 404);
      const token = await studioToken(me.studio_id);
      if (!token) return json({ error: 'El estudio aún no conectó su cuenta de Mercado Pago.' }, 400);

      const amount = Number(pkg.price_usd); // monto en la moneda del estudio (MX: MXN)
      const ref = JSON.stringify({ kind: 'package', user_id: me.id, studio_id: me.studio_id, package_id: pkg.id });
      const { ok, data } = await mpFetch('/checkout/preferences', token, {
        items: [{ title: pkg.name, quantity: 1, unit_price: amount, currency_id: 'MXN' }],
        marketplace_fee: fee(amount),
        external_reference: ref,
        notification_url: notifyUrl(),
        back_urls: {
          success: `${APP_URL}/?pago=exito#/app/packages`,
          failure: `${APP_URL}/?pago=cancelado#/app/packages`,
          pending: `${APP_URL}/?pago=pendiente#/app/packages`,
        },
        auto_return: 'approved',
        metadata: { kind: 'package', user_id: me.id, studio_id: me.studio_id, package_id: pkg.id },
      });
      if (!ok) return json({ error: data?.message ?? 'MP rechazó la preferencia', detail: data }, 400);
      return json({ url: data.init_point });
    }

    // --------- Membresía mensual (preapproval en la cuenta del estudio) ---------
    if (kind === 'membership_sub') {
      const { data: pkg } = await supabase.from('packages').select('*').eq('id', body.packageId).single();
      if (!pkg) return json({ error: 'Membresía no encontrada' }, 404);
      if (pkg.kind !== 'access' || !pkg.recurring) return json({ error: 'Esta membresía no es de cobro automático.' }, 400);
      const token = await studioToken(me.studio_id);
      if (!token) return json({ error: 'El estudio aún no conectó su cuenta de Mercado Pago.' }, 400);

      const amount = Number(pkg.price_usd);
      const ref = JSON.stringify({ kind: 'membership_sub', user_id: me.id, studio_id: me.studio_id, package_id: pkg.id });
      const { ok, data } = await mpFetch('/preapproval', token, {
        reason: pkg.name,
        external_reference: ref,
        payer_email: payerEmail,
        auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: amount, currency_id: 'MXN' },
        back_url: `${APP_URL}/?pago=exito#/app/packages`,
        notification_url: notifyUrl(),
        status: 'pending',
      });
      if (!ok) return json({ error: data?.message ?? 'MP rechazó la suscripción', detail: data }, 400);
      return json({ url: data.init_point });
    }

    // --------- Suscripción SaaS del estudio -> Move yA (cuenta PLATAFORMA) ---------
    if (kind === 'subscription') {
      if (me.role !== 'STUDIO_ADMIN') return json({ error: 'Solo el estudio' }, 403);
      if (!PLATFORM_TOKEN) return json({ error: 'Falta MP_ACCESS_TOKEN de la plataforma' }, 500);
      const plan = String(body.plan ?? '');
      const billing = body.billing === 'annual' ? 'annual' : 'monthly';
      const amount = billing === 'annual' ? SAAS_MXN_YEAR[plan] : SAAS_MXN[plan];
      if (!amount) return json({ error: 'Plan inválido' }, 400);
      // Anual = se cobra cada 12 meses (2 meses gratis ya reflejados en el monto).
      const recurring = billing === 'annual'
        ? { frequency: 12, frequency_type: 'months', transaction_amount: amount, currency_id: 'MXN' }
        : { frequency: 1, frequency_type: 'months', transaction_amount: amount, currency_id: 'MXN' };
      const ref = JSON.stringify({ kind: 'subscription', studio_id: me.studio_id, plan, billing });
      const { ok, data } = await mpFetch('/preapproval', PLATFORM_TOKEN, {
        reason: `Move yA · Plan ${plan}${billing === 'annual' ? ' (anual)' : ''}`,
        external_reference: ref,
        payer_email: payerEmail,
        auto_recurring: recurring,
        back_url: `${APP_URL}/?suscripcion=exito#/admin`,
        notification_url: notifyUrl(),
        status: 'pending',
      });
      if (!ok) return json({ error: data?.message ?? 'MP rechazó la suscripción', detail: data }, 400);
      return json({ url: data.init_point });
    }

    return json({ error: 'kind inválido (package | membership_sub | subscription)' }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
