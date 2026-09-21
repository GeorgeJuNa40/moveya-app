// ============================================================================
// Move yA — Edge Function: stripe-checkout
// ----------------------------------------------------------------------------
// Crea una sesión de Stripe Checkout (página de pago segura de Stripe) para:
//   - kind: 'package'       -> compra única de un paquete por un alumno
//   - kind: 'subscription'  -> suscripción mensual del estudio (Inicio/Pro/Premium)
//
// La app NUNCA recibe datos de tarjeta: el alumno los captura en la página de
// Stripe (cumplimiento PCI). Aquí solo se crea la sesión y se devuelve la URL.
//
// Requiere estos "secrets" en Supabase (Settings → Edge Functions → Secrets):
//   STRIPE_SECRET_KEY, APP_URL
// (SUPABASE_URL y SUPABASE_ANON_KEY ya vienen dados por la plataforma.)
//
// Esta función SÍ valida el JWT del usuario (déjala con "Enforce JWT" activado).
// ============================================================================
import Stripe from 'npm:stripe@17.0.0';
import { createClient } from 'npm:@supabase/supabase-js@2';

// httpClient de tipo fetch: obligatorio para que Stripe funcione en Supabase (Deno).
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});
const APP_URL = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '');

// Devuelve el origen (https://host) desde donde el cliente inició, SOLO si es un
// dominio permitido; si no, usa APP_URL. Así Stripe regresa al mismo dominio del
// usuario (conserva su sesión) sin abrir un "open redirect".
function safeBase(origin: unknown): string {
  try {
    const u = new URL(String(origin));
    if (u.protocol !== 'https:') return '';
    const h = u.hostname;
    if (h === 'moveyaapp.app' || h.endsWith('.moveyaapp.app') || h.endsWith('.vercel.app')) {
      return `${u.protocol}//${u.host}`;
    }
    return '';
  } catch {
    return '';
  }
}

// Precios mensuales de los planes del estudio (en centavos de USD).
const PLAN_PRICES: Record<string, number> = { inicio: 2499, pro: 4499, premium: 8499 };

// -------- Comisión de plataforma (Move yA) sobre los pagos en línea de alumnos
// Se cobra AL ESTUDIO: sale de su parte del cargo directo (no se le suma al
// alumno). Sirve para cubrir el costo de Stripe/Radar por cuentas conectadas y
// dejar margen. Se configura con "secrets" en Supabase, SIN tocar el código:
//   PLATFORM_FEE_PERCENT -> % del monto (ej. "5" = 5%)
//   PLATFORM_FEE_FIXED   -> monto fijo por transacción, en la MISMA moneda del
//                           paquete (ej. "3" = 3 pesos). Opcional.
// Si ambos están en 0 (o sin definir), no se cobra comisión (0%).
const FEE_PERCENT = Number(Deno.env.get('PLATFORM_FEE_PERCENT') ?? '0') || 0;
const FEE_FIXED = Number(Deno.env.get('PLATFORM_FEE_FIXED') ?? '0') || 0;

// Calcula la comisión (en la unidad mínima: centavos) a partir del monto total.
// Nunca cobra más que el propio pago: deja al menos 1 unidad al estudio.
function platformFee(amountMinor: number): number {
  const fee = Math.round(amountMinor * (FEE_PERCENT / 100)) + Math.round(FEE_FIXED * 100);
  return Math.max(0, Math.min(fee, amountMinor - 1));
}

// Encabezados CORS: se permiten los que envía la librería de Supabase
// (authorization, x-client-info, apikey, content-type).
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  try {
    // Cliente con el token del usuario: RLS asegura que solo vea su estudio.
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return json({ error: 'No autorizado' }, 401);

    const { data: me } = await supabase
      .from('users')
      .select('id, studio_id, role')
      .eq('id', user.id)
      .single();
    if (!me) return json({ error: 'Usuario no encontrado' }, 404);

    const body = await req.json().catch(() => ({}));
    const kind = body.kind as string;
    // Origen al que regresará Stripe (el mismo del usuario, o APP_URL de reserva).
    const base = safeBase(body.origin) || APP_URL;

    if (kind === 'package') {
      const { data: pkg } = await supabase
        .from('packages')
        .select('*')
        .eq('id', body.packageId)
        .single();
      if (!pkg) return json({ error: 'Paquete no encontrado' }, 404);

      const { data: studio } = await supabase
        .from('studios')
        .select('branding, stripe_account_id, stripe_charges_enabled')
        .eq('id', me.studio_id)
        .single();

      // Cargo DIRECTO en la cuenta Connect del estudio: el dinero llega a SU
      // cuenta (la plataforma no lo toca). Requiere que el estudio haya
      // conectado su cuenta y pueda recibir cobros.
      const acct = studio?.stripe_account_id as string | undefined;
      if (!acct || !studio?.stripe_charges_enabled) {
        return json(
          {
            error:
              'El estudio aún no activó los pagos en línea. Pídele que conecte su cuenta de Stripe en la sección Suscripción.',
          },
          400,
        );
      }
      const currency = (studio?.branding?.currencyCode ?? 'USD').toLowerCase();
      const amountMinor = Math.round(Number(pkg.price_usd) * 100);
      // Comisión de Move yA (sale de la parte del estudio). Si es 0, no se cobra.
      const fee = platformFee(amountMinor);

      const session = await stripe.checkout.sessions.create(
        {
          mode: 'payment',
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency,
                unit_amount: amountMinor,
                product_data: {
                  name: pkg.name,
                  description: pkg.description || undefined,
                },
              },
            },
          ],
          // application_fee_amount: parte que se transfiere de la cuenta del
          // estudio a la plataforma (Move yA). Solo se agrega si hay comisión.
          ...(fee > 0 ? { payment_intent_data: { application_fee_amount: fee } } : {}),
          // Al volver de Stripe, regresa DIRECTO a la pantalla del alumno (con
          // hash de la ruta) en vez de la raíz (que mandaba al login/dashboard).
          success_url: `${base}/?pago=exito#/app/packages`,
          cancel_url: `${base}/?pago=cancelado#/app/packages`,
          metadata: {
            kind: 'package',
            user_id: me.id,
            studio_id: me.studio_id,
            package_id: pkg.id,
          },
        },
        { stripeAccount: acct },
      );
      return json({ url: session.url });
    }

    if (kind === 'subscription') {
      if (me.role !== 'STUDIO_ADMIN') return json({ error: 'Solo el estudio' }, 403);
      const plan = String(body.plan);

      // Programa Fundador (primeros 10): acceso Premium al precio de Pro + el
      // bot de WhatsApp ($10), en UN SOLO cargo mensual, de por vida. Se limita
      // a FOUNDER_LIMIT estudios; al llenarse, todo vuelve a los precios normales.
      const isFounder = plan === 'founder';
      const metaPlan = isFounder ? 'premium' : plan; // por debajo, el fundador ES premium
      let amount: number;
      let productName: string;

      if (isFounder) {
        // Tope duro en el servidor: cuenta cuántos fundadores ya existen.
        const admin = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );
        const { count } = await admin
          .from('studios')
          .select('id', { count: 'exact', head: true })
          .eq('subscription->>founder', 'true');
        const limit = Number(Deno.env.get('FOUNDER_LIMIT') ?? '10') || 10;
        if ((count ?? 0) >= limit) {
          return json(
            { error: 'El programa Fundador ya está completo. Elige uno de los planes normales.' },
            400,
          );
        }
        const botUsd = Number(Deno.env.get('FOUNDER_BOT_PRICE') ?? '10') || 10;
        amount = PLAN_PRICES.pro + Math.round(botUsd * 100); // Premium al precio de Pro + bot
        productName = 'Move yA · Fundador (acceso Premium + Bot WhatsApp)';
      } else {
        amount = PLAN_PRICES[plan];
        if (!amount) return json({ error: 'Plan inválido' }, 400);
        productName = `Move yA · Plan ${plan}`;
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'usd', // la suscripción SaaS se cobra en USD
              unit_amount: amount,
              recurring: { interval: 'month' },
              product_data: { name: productName },
            },
          },
        ],
        // Al volver de Stripe, regresa DIRECTO a la pantalla de Suscripción del
        // estudio (con hash de la ruta) en vez de la raíz (que mandaba al login).
        // Tras pagar la membresía, el estudio entra DIRECTO a su dashboard.
        success_url: `${base}/?suscripcion=exito#/admin`,
        cancel_url: `${base}/?suscripcion=cancelado#/admin/subscription`,
        metadata: { kind: 'subscription', studio_id: me.studio_id, plan: metaPlan, founder: isFounder ? '1' : '0' },
      });
      return json({ url: session.url });
    }

    return json({ error: 'kind inválido (usa "package" o "subscription")' }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
