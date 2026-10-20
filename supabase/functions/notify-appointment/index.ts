// ============================================================================
// Move yA — Edge Function: notify-appointment   (Verify JWT: ACTIVADO)
// ----------------------------------------------------------------------------
// Avisa por push los movimientos de una cita de servicio:
//   • kind='created'   → al PERSONAL del estudio (admin/gerente/recepción):
//                        "un alumno agendó/solicitó una cita".
//   • kind='scheduled' → al ALUMNO: su cita quedó agendada para tal fecha.
//   • kind='done'      → al ALUMNO: su consulta se marcó como realizada.
// El destinatario y el texto los decide el SERVIDOR según la cita, por eso un
// alumno puede disparar el aviso al estudio sin poder mandar mensajes a su gusto.
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
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  try { webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE); } catch { /* claves inválidas */ }
}

function fmtWhen(iso?: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('es-MX', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
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
    const appointmentId = String(body.appointmentId ?? '');
    const kind = String(body.kind ?? '');
    if (!appointmentId || !['created', 'scheduled', 'done'].includes(kind)) return json({ ok: false });

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Estudio del que llama (debe coincidir con el de la cita).
    const { data: me } = await admin.from('users').select('studio_id').eq('id', ud.user.id).maybeSingle();
    const { data: appt } = await admin
      .from('service_appointments')
      .select('id, studio_id, user_id, service_name, scheduled_for, user_name')
      .eq('id', appointmentId)
      .maybeSingle();
    if (!appt || !me || appt.studio_id !== me.studio_id) return json({ ok: false });

    // Resuelve destinatarios + mensaje (del lado del servidor).
    let targets: string[] = [];
    let title = 'Move yA';
    let msg = '';
    let url = '/';
    if (kind === 'created') {
      const { data: staff } = await admin
        .from('users')
        .select('id')
        .eq('studio_id', appt.studio_id)
        .in('role', ['STUDIO_ADMIN', 'BRANCH_ADMIN', 'OPERATOR']);
      targets = (staff ?? []).map((u) => u.id as string);
      title = '📅 Nueva cita de servicio';
      msg = `${appt.user_name ?? 'Un alumno'} ${appt.scheduled_for ? 'agendó' : 'solicitó'} ${appt.service_name}` +
        (appt.scheduled_for ? ` para ${fmtWhen(appt.scheduled_for)}` : '');
      url = '/#/admin/services';
    } else if (kind === 'scheduled') {
      targets = [appt.user_id as string];
      title = '✅ Tu cita quedó agendada';
      msg = `Tu cita de ${appt.service_name} quedó para ${fmtWhen(appt.scheduled_for)}.`;
      url = '/#/app/services';
    } else {
      targets = [appt.user_id as string];
      title = '✔️ Consulta realizada';
      msg = `Tu consulta de ${appt.service_name} se marcó como realizada. ¡Gracias!`;
      url = '/#/app/services';
    }

    targets = [...new Set(targets.filter(Boolean))];
    if (targets.length === 0 || !VAPID_PUBLIC || !VAPID_PRIVATE) return json({ ok: true, notified: 0 });

    const payload = JSON.stringify({ title, body: msg, url });
    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('*')
      .in('user_id', targets)
      .eq('studio_id', appt.studio_id);

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
