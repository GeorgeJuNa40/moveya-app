// ============================================================================
// Move yA — Edge Function: whatsapp-connect
// ----------------------------------------------------------------------------
// Completa la conexión del WhatsApp de un estudio hecha con Embedded Signup.
// El navegador solo obtiene un "code" temporal + los ids del número/cuenta;
// aquí (en el servidor) se hace lo sensible:
//   1) Intercambia el code por el token de acceso del negocio del estudio.
//   2) Suscribe ESTA app a los webhooks de esa cuenta (para recibir mensajes).
//   3) Registra el número en la Cloud API (si hace falta).
//   4) Lee el número y el nombre verificado.
//   5) Guarda el TOKEN en la tabla protegida whatsapp_accounts (solo service
//      role) y los METADATOS no sensibles en studios.whatsapp.
//
// Secrets en Supabase (Settings -> Edge Functions -> Secrets):
//   WHATSAPP_APP_ID       -> el App ID de tu app de Meta (público, pero cómodo aquí).
//   WHATSAPP_APP_SECRET   -> el App Secret de tu app de Meta (SECRETO).
//   (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY los da la plataforma.)
//
// Requiere la tabla whatsapp_accounts (ver supabase/whatsapp-embedded-signup.sql).
// Deja "Enforce JWT" ACTIVADO: solo el estudio (admin) puede llamarla.
// ============================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const GRAPH = 'https://graph.facebook.com/v21.0';
const APP_ID = Deno.env.get('WHATSAPP_APP_ID') ?? Deno.env.get('FB_APP_ID') ?? '';
const APP_SECRET = Deno.env.get('WHATSAPP_APP_SECRET') ?? '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
const digits = (s: string) => (s || '').replace(/\D/g, '');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  try {
    if (!APP_ID || !APP_SECRET) {
      return json({ error: 'Falta configurar WHATSAPP_APP_ID / WHATSAPP_APP_SECRET en el servidor.' }, 500);
    }

    // -------- Auth: solo el admin del estudio.
    const authHeader = req.headers.get('Authorization') ?? '';
    const asUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await asUser.auth.getUser();
    const caller = userData.user;
    if (!caller) return json({ error: 'No autorizado' }, 401);

    const { data: me } = await asUser.from('users').select('id, studio_id, role').eq('id', caller.id).single();
    if (!me) return json({ error: 'Usuario no encontrado' }, 404);
    if (me.role !== 'STUDIO_ADMIN') return json({ error: 'Solo el estudio' }, 403);

    const body = await req.json().catch(() => ({}));
    const code = String(body.code ?? '');
    let phoneNumberId = String(body.phoneNumberId ?? '');
    let wabaId = String(body.wabaId ?? '');
    if (!code) return json({ error: 'Falta el código de conexión.' }, 400);

    // -------- 1) code -> token de acceso del negocio del estudio.
    const tokenRes = await fetch(
      `${GRAPH}/oauth/access_token?client_id=${encodeURIComponent(APP_ID)}` +
      `&client_secret=${encodeURIComponent(APP_SECRET)}&code=${encodeURIComponent(code)}`,
    );
    const tokenJson = await tokenRes.json().catch(() => ({}));
    const accessToken = tokenJson?.access_token as string | undefined;
    if (!tokenRes.ok || !accessToken) {
      return json({ error: `No se pudo obtener el token: ${JSON.stringify(tokenJson).slice(0, 200)}` }, 400);
    }
    const authH = { Authorization: `Bearer ${accessToken}` };

    // -------- Descubrir wabaId/phoneNumberId si el navegador no los mandó.
    if (!wabaId) {
      const r = await fetch(`${GRAPH}/debug_token?input_token=${encodeURIComponent(accessToken)}`, { headers: authH });
      const j = await r.json().catch(() => ({}));
      const scopes = j?.data?.granular_scopes as Array<{ scope: string; target_ids?: string[] }> | undefined;
      const wa = scopes?.find((s) => s.scope === 'whatsapp_business_management' || s.scope === 'whatsapp_business_messaging');
      wabaId = wa?.target_ids?.[0] ?? '';
    }
    if (!phoneNumberId && wabaId) {
      const r = await fetch(`${GRAPH}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name`, { headers: authH });
      const j = await r.json().catch(() => ({}));
      phoneNumberId = j?.data?.[0]?.id ?? '';
    }
    if (!wabaId || !phoneNumberId) {
      return json({ error: 'No se identificó tu cuenta o número de WhatsApp. Vuelve a intentar la conexión.' }, 400);
    }

    // -------- 2) Suscribir esta app a los webhooks de la cuenta del estudio.
    await fetch(`${GRAPH}/${wabaId}/subscribed_apps`, { method: 'POST', headers: authH })
      .then((r) => r.text()).then((t) => console.log('subscribed_apps:', t.slice(0, 200)))
      .catch((e) => console.error('subscribed_apps error:', String(e)));

    // -------- 3) Registrar el número en la Cloud API (si aún no lo está).
    await fetch(`${GRAPH}/${phoneNumberId}/register`, {
      method: 'POST',
      headers: { ...authH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', pin: '000000' }),
    }).then((r) => r.text()).then((t) => console.log('register:', t.slice(0, 200)))
      .catch((e) => console.error('register error:', String(e)));

    // -------- 4) Leer número y nombre verificado.
    const infoRes = await fetch(`${GRAPH}/${phoneNumberId}?fields=display_phone_number,verified_name`, { headers: authH });
    const info = await infoRes.json().catch(() => ({}));
    const number = digits(info?.display_phone_number ?? '');
    const verifiedName = (info?.verified_name as string) ?? '';

    // -------- 5) Guardar (service role): token en tabla protegida + metadatos.
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    await admin.from('whatsapp_accounts').upsert({
      studio_id: me.studio_id,
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
      access_token: accessToken,
      display_number: number,
      verified_name: verifiedName,
      connected_at: new Date().toISOString(),
    });

    const { data: studio } = await admin.from('studios').select('whatsapp').eq('id', me.studio_id).single();
    const nextWa = {
      ...(studio?.whatsapp ?? {}),
      number: number || (studio?.whatsapp?.number ?? ''),
      connected: true,
      wabaId,
      phoneNumberId,
      verifiedName,
    };
    await admin.from('studios').update({ whatsapp: nextWa }).eq('id', me.studio_id);

    return json({ connected: true, number, verifiedName, phoneNumberId, wabaId });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
