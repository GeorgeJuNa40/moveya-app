// ============================================================================
// Move yA — Edge Function: notify-waitlist   (Verify JWT: ACTIVADO)
// ----------------------------------------------------------------------------
// Al liberarse un lugar (alguien canceló), avisa por push al PRIMERO de la lista
// de espera de esa sesión. La llama el cliente que canceló. Usa service role.
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (opcional),
//          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY.
// ============================================================================
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:soporte@moveya.app';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  try { webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE); } catch { /* claves inválidas */ }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: ud } = await asUser.auth.getUser();
    if (!ud.user) return json({ error: 'No autorizado' }, 401);

    const body = await req.json().catch(() => ({}));
    const sessionId = String(body.sessionId ?? '');
    if (!sessionId) return json({ ok: false });

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // El que llama debe pertenecer al mismo estudio de la sesión.
    const { data: me } = await admin.from('users').select('studio_id').eq('id', ud.user.id).maybeSingle();
    const { data: sess } = await admin
      .from('class_sessions')
      .select('id, studio_id, template_id, starts_at')
      .eq('id', sessionId)
      .maybeSingle();
    if (!sess || !me || sess.studio_id !== me.studio_id) return json({ ok: false });

    // Primero de la lista de espera (el más antiguo).
    const { data: wl } = await admin
      .from('bookings')
      .select('user_id, created_at')
      .eq('session_id', sessionId)
      .eq('status', 'WAITLIST')
      .order('created_at', { ascending: true })
      .limit(1);
    const target = wl?.[0]?.user_id;
    if (!target) return json({ ok: true, notified: 0 });

    if (!VAPID_PUBLIC || !VAPID_PRIVATE) return json({ ok: true, notified: 0 });

    // Nombre de la clase (para el mensaje).
    const { data: tpl } = await admin.from('class_templates').select('name').eq('id', sess.template_id).maybeSingle();
    const when = new Date(sess.starts_at).toLocaleString('es-MX', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    const payload = JSON.stringify({
      title: '🎉 ¡Se liberó un lugar!',
      body: `Hay cupo en ${tpl?.name ?? 'tu clase'} (${when}). Resérvalo antes de que se ocupe.`,
      url: '/#/app/book',
    });

    const { data: subs } = await admin.from('push_subscriptions').select('*').eq('user_id', target);
    let notified = 0;
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        notified++;
      } catch (err) {
        const code = (err as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) {
          await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
        }
      }
    }
    return json({ ok: true, notified });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
