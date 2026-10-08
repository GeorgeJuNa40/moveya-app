// ============================================================================
// Move yA — Edge Function: mp-connect  (Mercado Pago · OAuth del estudio)
// ----------------------------------------------------------------------------
// Espejo de `stripe-connect`: permite que cada estudio conecte SU cuenta de
// Mercado Pago (marketplace) para recibir los pagos de sus alumnos directo en
// su cuenta. Move yA solo guarda el access_token del estudio (en mp_accounts,
// tabla protegida) y cobra su comisión vía marketplace_fee en el checkout.
//
// Flujo OAuth:
//   1) action 'authorize' -> devuelve la URL de autorización de MP.
//   2) El estudio autoriza en MP y MP redirige a APP_URL con ?code=...&state=...
//   3) La app llama action 'callback' con ese code -> aquí lo canjeamos por el
//      access_token/refresh_token del estudio y lo guardamos.
//
// Secrets requeridos (Supabase -> Edge Functions -> Secrets):
//   MP_CLIENT_ID, MP_CLIENT_SECRET, APP_URL
//   (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY ya los da la plataforma)
//
// Desplegar con "Verify JWT" ACTIVADO (todas las acciones requieren sesión).
// ============================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const MP_CLIENT_ID = Deno.env.get('MP_CLIENT_ID') ?? '';
const MP_CLIENT_SECRET = Deno.env.get('MP_CLIENT_SECRET') ?? '';
const APP_URL = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '');
// Dominio de MP para México (auth). Para otros países se cambia el host.
const MP_AUTH = 'https://auth.mercadopago.com.mx/authorization';
const MP_TOKEN = 'https://api.mercadopago.com/oauth/token';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// A dónde regresa MP tras autorizar (una ruta de la app que lea ?code&state).
const redirectUri = () => `${APP_URL}/?mp=callback`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  try {
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
      .from('users').select('id, studio_id, role').eq('id', user.id).single();
    if (!me || me.role !== 'STUDIO_ADMIN') return json({ error: 'Solo el estudio' }, 403);

    // Cliente admin (service role) para escribir en mp_accounts (protegida).
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? '');

    // ---- 1) URL de autorización de MP ----
    if (action === 'authorize') {
      if (!MP_CLIENT_ID) return json({ error: 'Falta MP_CLIENT_ID en secrets' }, 500);
      const url =
        `${MP_AUTH}?client_id=${encodeURIComponent(MP_CLIENT_ID)}` +
        `&response_type=code&platform_id=mp` +
        `&state=${encodeURIComponent(me.studio_id)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri())}`;
      return json({ url });
    }

    // ---- 2) Canjear el code por el token del estudio ----
    if (action === 'callback') {
      const code = String(body.code ?? '');
      if (!code) return json({ error: 'Falta code' }, 400);
      const res = await fetch(MP_TOKEN, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: MP_CLIENT_ID,
          client_secret: MP_CLIENT_SECRET,
          code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri(),
        }),
      });
      const tok = await res.json();
      if (!res.ok) return json({ error: tok?.message ?? 'No se pudo conectar MP', detail: tok }, 400);

      const expiresAt = tok.expires_in ? new Date(Date.now() + Number(tok.expires_in) * 1000).toISOString() : null;
      await admin.from('mp_accounts').upsert({
        studio_id: me.studio_id,
        mp_user_id: String(tok.user_id ?? ''),
        access_token: tok.access_token ?? null,
        refresh_token: tok.refresh_token ?? null,
        public_key: tok.public_key ?? null,
        connected: true,
        token_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      });
      // Bandera pública (no sensible) para que el alumno vea el botón de MP.
      await admin.from('studios').update({ mp_connected: true }).eq('id', me.studio_id);
      return json({ connected: true });
    }

    // ---- Estado de conexión ----
    if (action === 'status') {
      const { data } = await admin.from('mp_accounts').select('connected').eq('studio_id', me.studio_id).maybeSingle();
      return json({ connected: Boolean(data?.connected) });
    }

    // ---- Desconectar ----
    if (action === 'disconnect') {
      await admin.from('mp_accounts').update({ connected: false, access_token: null, refresh_token: null })
        .eq('studio_id', me.studio_id);
      await admin.from('studios').update({ mp_connected: false }).eq('id', me.studio_id);
      return json({ connected: false });
    }

    return json({ error: 'action inválida (authorize | callback | status | disconnect)' }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
