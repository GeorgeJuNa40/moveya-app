// ============================================================================
// Move yA — Edge Function: send-email   (Verify JWT: ACTIVADO)
// ----------------------------------------------------------------------------
// Envía correos a los leads de Move yA vía Resend. SOLO el dueño de plataforma
// (platform_owner) puede llamarla. Valida que el remitente sea @moveyaapp.app
// (dominio verificado en Resend) para no permitir suplantación. Registra cada
// envío en moveya_emails.
//
// Body JSON:
//   { from: "Move yA <hola@moveyaapp.app>", subject, html,
//     recipients: [{ email, name? }] }   // hasta 100 por llamada
//
// Secrets: RESEND_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
// ============================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const ALLOWED_DOMAIN = 'moveyaapp.app';
const MAX_RECIPIENTS = 100;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
// Extrae el dominio del remitente ("Nombre <correo@dominio>" o "correo@dominio").
function fromDomain(from: string): string {
  const m = from.match(/<([^>]+)>/);
  const addr = (m ? m[1] : from).trim();
  return addr.split('@')[1]?.toLowerCase() ?? '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  try {
    if (!RESEND_API_KEY) return json({ error: 'Falta configurar RESEND_API_KEY en Supabase.' }, 400);

    const authHeader = req.headers.get('Authorization') ?? '';
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: ud } = await asUser.auth.getUser();
    if (!ud.user) return json({ error: 'No autorizado' }, 401);
    const { data: me } = await asUser.from('users').select('platform_owner').eq('id', ud.user.id).maybeSingle();
    if (!me?.platform_owner) return json({ error: 'Solo el dueño de plataforma puede enviar.' }, 403);

    const body = await req.json().catch(() => ({}));
    const from = String(body.from ?? '').trim();
    const subject = String(body.subject ?? '').trim();
    const html = String(body.html ?? '');
    const recipients = Array.isArray(body.recipients) ? body.recipients : [];

    if (!from || fromDomain(from) !== ALLOWED_DOMAIN) {
      return json({ error: `El remitente debe ser una dirección @${ALLOWED_DOMAIN}.` }, 400);
    }
    if (!subject || !html) return json({ error: 'Falta asunto o contenido.' }, 400);
    const list = recipients
      .map((r: { email?: string; name?: string }) => ({ email: String(r.email ?? '').trim(), name: String(r.name ?? '').trim() }))
      .filter((r: { email: string }) => emailOk(r.email))
      .slice(0, MAX_RECIPIENTS);
    if (list.length === 0) return json({ error: 'No hay destinatarios válidos.' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    let sent = 0;
    let failed = 0;
    for (const r of list) {
      // Personaliza {{nombre}} por destinatario (en asunto y cuerpo).
      const who = r.name || 'hola';
      const subj = subject.replace(/\{\{\s*nombre\s*\}\}/gi, who);
      const bodyHtml = html.replace(/\{\{\s*nombre\s*\}\}/gi, who);
      let providerId = '';
      let errMsg = '';
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to: [r.email], subject: subj, html: bodyHtml }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.id) { providerId = data.id; sent++; }
        else { errMsg = String(data?.message ?? data?.error ?? `HTTP ${res.status}`); failed++; }
      } catch (e) {
        errMsg = String((e as Error)?.message ?? e); failed++;
      }
      // Registra el envío (best-effort).
      try {
        await admin.from('moveya_emails').insert({
          id: crypto.randomUUID(),
          to_email: r.email,
          to_name: r.name || null,
          subject: subj,
          status: errMsg ? 'error' : 'sent',
          provider_id: providerId || null,
          error: errMsg || null,
        });
      } catch { /* ignore */ }
      // Respeta el límite de ritmo de Resend.
      await new Promise((rz) => setTimeout(rz, 550));
    }

    return json({ ok: true, sent, failed });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
