import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:soporte@moveya.app',
  Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
  Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
);

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

async function sendToUser(userId: string, title: string, body: string, url: string): Promise<number> {
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', userId);
  if (!subs || subs.length === 0) return 0;

  const payload = JSON.stringify({ title, body, url });
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      );
      sent++;
    } catch (err) {
      const code = (err as { statusCode?: number })?.statusCode;
      if (code === 404 || code === 410) {
        await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
      }
    }
  }
  return sent;
}

async function alreadySent(userId: string, kind: string): Promise<boolean> {
  const { error } = await admin.from('push_sent_log').insert({ user_id: userId, kind });
  return Boolean(error);
}

Deno.serve(async () => {
  try {
    const now = Date.now();
    const in24h = new Date(now + 24 * 3600 * 1000).toISOString();
    const nowIso = new Date(now).toISOString();
    const in3d = new Date(now + 3 * 24 * 3600 * 1000).toISOString();

    let classReminders = 0;
    let packageReminders = 0;

    const { data: sessions } = await admin
      .from('class_sessions')
      .select('id, template_id, starts_at')
      .gt('starts_at', nowIso)
      .lte('starts_at', in24h);

    for (const ses of sessions ?? []) {
      const { data: tpl } = await admin
        .from('class_templates')
        .select('name')
        .eq('id', ses.template_id)
        .single();
      const className = tpl?.name ?? 'tu clase';

      const { data: bookings } = await admin
        .from('bookings')
        .select('user_id')
        .eq('session_id', ses.id)
        .eq('status', 'RESERVED');

      for (const b of bookings ?? []) {
        const kind = `class-24h:${ses.id}`;
        if (await alreadySent(b.user_id, kind)) continue;
        const n = await sendToUser(
          b.user_id,
          'Recordatorio de clase 🧘',
          `Tienes ${className} el ${fmtWhen(ses.starts_at)}. ¡Te esperamos!`,
          '/#/app/book',
        );
        if (n > 0) classReminders++;
      }
    }

    // Paquetes / membresías por vencer (3 días antes). Avisa AUTOMÁTICAMENTE, sin
    // que el estudio tenga que mandar nada. Cubre tanto paquetes por clases
    // (créditos) como membresías de acceso (gimnasio).
    const { data: pkgs } = await admin
      .from('user_packages')
      .select('id, user_id, kind, credits_total, credits_used, starts_at, expires_at')
      .eq('active', true)
      .gt('expires_at', nowIso)
      .lte('expires_at', in3d);

    for (const up of pkgs ?? []) {
      // En cola (aún no empieza su vigencia): no avisamos su vencimiento todavía.
      if (up.starts_at && new Date(up.starts_at).getTime() > now) continue;
      const isAccess = up.kind === 'access';
      // Paquete por clases ya agotado: no tiene caso avisar.
      if (!isAccess && up.credits_used >= up.credits_total) continue;

      const logKind = `pkg-expiring:${up.id}`;
      if (await alreadySent(up.user_id, logKind)) continue;

      const title = isAccess ? 'Tu membresía está por vencer ⏳' : 'Tu paquete está por vencer ⏳';
      const body = isAccess
        ? `Tu membresía vence el ${fmtDate(up.expires_at)}. Renuévala para seguir entrando. 💪`
        : `Te quedan ${up.credits_total - up.credits_used} clase(s) y tu paquete vence el ${fmtWhen(up.expires_at)}. Aprovéchalo o renuévalo.`;

      const n = await sendToUser(up.user_id, title, body, '/#/app/packages');
      if (n > 0) packageReminders++;
    }

    return new Response(
      JSON.stringify({ ok: true, classReminders, packageReminders }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
