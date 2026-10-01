// ============================================================================
// Move yA — Edge Function: membership-cancel
// ----------------------------------------------------------------------------
// Cancela la DOMICILIACIÓN (cobro mensual) de una membresía. El acceso se
// conserva hasta el final del periodo ya pagado (cancel_at_period_end).
// La puede cancelar el propio miembro o el personal (admin/coach) del estudio.
//
// Body JSON: { userPackageId: string }
// Secrets: STRIPE_SECRET_KEY, SUPABASE_URL/ANON/SERVICE_ROLE (plataforma).
// Deja "Verify JWT" ACTIVADO.
// ============================================================================
import Stripe from 'npm:stripe@17.0.0';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await asUser.auth.getUser();
    const caller = userData.user;
    if (!caller) return json({ error: 'No autorizado' }, 401);

    const { data: me } = await asUser.from('users').select('id, studio_id, role').eq('id', caller.id).single();
    if (!me) return json({ error: 'Usuario no encontrado' }, 404);

    const body = await req.json().catch(() => ({}));
    const userPackageId = String(body.userPackageId ?? '');
    if (!userPackageId) return json({ error: 'Falta la membresía' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: up } = await admin
      .from('user_packages')
      .select('id, user_id, package_id, stripe_subscription_id')
      .eq('id', userPackageId)
      .single();
    if (!up) return json({ error: 'Membresía no encontrada' }, 404);
    if (!up.stripe_subscription_id) return json({ error: 'Esta membresía no es de cobro automático.' }, 400);

    // Estudio dueño de la membresía (por el paquete) + su cuenta Connect.
    const { data: pkg } = await admin.from('packages').select('studio_id').eq('id', up.package_id).single();
    const studioId = pkg?.studio_id as string | undefined;
    const { data: studio } = studioId
      ? await admin.from('studios').select('stripe_account_id').eq('id', studioId).single()
      : { data: null };

    // Autorización: el dueño, o el personal del MISMO estudio.
    const isOwner = up.user_id === me.id;
    const isStaff = (me.role === 'STUDIO_ADMIN' || me.role === 'COACH') && me.studio_id === studioId;
    if (!isOwner && !isStaff) return json({ error: 'No autorizado' }, 403);

    const acct = studio?.stripe_account_id as string | undefined;
    if (!acct) return json({ error: 'El estudio no tiene cuenta de pagos conectada.' }, 400);

    // Cancela al final del periodo (conserva el acceso ya pagado).
    await stripe.subscriptions.update(
      up.stripe_subscription_id,
      { cancel_at_period_end: true },
      { stripeAccount: acct },
    );
    await admin.from('user_packages').update({ cancel_at_period_end: true }).eq('id', up.id);

    return json({ ok: true });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
