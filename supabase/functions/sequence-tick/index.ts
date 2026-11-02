// ============================================================================
// Move yA — Edge Function: sequence-tick   (Verify JWT: DESACTIVADO)
// ----------------------------------------------------------------------------
// La llama el cron (pg_cron). Envía los correos de la secuencia de seguimiento
// que ya vencieron (moveya_sequence_queue.send_at <= ahora y status=pending),
// usando Resend. Respeta el interruptor global (moveya_sequence_config.active),
// personaliza {{nombre}} y registra cada envío en moveya_emails.
//
// Secrets: RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// ============================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM = 'Move yA <ventas@moveyaapp.app>';
const BATCH = 60; // máximo de correos por corrida

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

// Mismo diseño de marca que el panel (brandedEmailHtml), replicado aquí.
function brandedHtml(bodyText: string): string {
  const safe = bodyText
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
  return `<!doctype html><html><body style="margin:0;background:#F4F1EA;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px;">
    <div style="background:#4A5D55;border-radius:16px 16px 0 0;padding:20px 24px;color:#FAF8F3;">
      <div style="font-size:18px;font-weight:bold;letter-spacing:.5px;">Move yA</div>
    </div>
    <div style="background:#ffffff;border-radius:0 0 16px 16px;padding:24px;color:#212121;font-size:15px;line-height:1.6;">
      ${safe}
    </div>
    <p style="color:#8a8a8a;font-size:12px;text-align:center;margin:16px 8px;">
      Recibes este correo porque mostraste interés en Move yA. Si no quieres recibir más, responde con "baja".
    </p>
  </div></body></html>`;
}

const fill = (t: string, who: string) => String(t ?? '').replace(/\{\{\s*nombre\s*\}\}/gi, who);

Deno.serve(async () => {
  try {
    if (!RESEND_API_KEY) return json({ ok: false, error: 'Falta RESEND_API_KEY' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Config global de la secuencia.
    const { data: cfg } = await admin.from('moveya_sequence_config').select('active, steps').eq('id', 1).maybeSingle();
    if (!cfg?.active) return json({ ok: true, skipped: 'secuencia inactiva', sent: 0 });
    const steps: { subject?: string; body?: string }[] = Array.isArray(cfg.steps) ? cfg.steps : [];

    // Envíos vencidos y pendientes.
    const nowIso = new Date().toISOString();
    const { data: due, error } = await admin
      .from('moveya_sequence_queue')
      .select('id, to_email, to_name, step_index')
      .eq('status', 'pending')
      .lte('send_at', nowIso)
      .order('send_at', { ascending: true })
      .limit(BATCH);
    if (error) return json({ ok: false, error: error.message }, 500);
    if (!due || due.length === 0) return json({ ok: true, sent: 0 });

    let sent = 0;
    let failed = 0;
    let canceled = 0;

    for (const row of due) {
      const step = steps[row.step_index];
      // Si el paso ya no existe (editaron la secuencia), se cancela esa fila.
      if (!step || (!step.subject && !step.body)) {
        await admin.from('moveya_sequence_queue').update({ status: 'canceled' }).eq('id', row.id);
        canceled++;
        continue;
      }

      const who = (row.to_name && String(row.to_name).trim()) || 'hola';
      const subject = fill(step.subject ?? '', who);
      const html = brandedHtml(fill(step.body ?? '', who));

      let providerId = '';
      let errMsg = '';
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: FROM, to: [row.to_email], subject, html }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.id) { providerId = data.id; sent++; }
        else { errMsg = String(data?.message ?? data?.error ?? `HTTP ${res.status}`); failed++; }
      } catch (e) {
        errMsg = String((e as Error)?.message ?? e); failed++;
      }

      // Marca la fila (enviada aunque Resend devuelva error, para no reintentar en bucle).
      await admin.from('moveya_sequence_queue').update({ status: 'sent' }).eq('id', row.id);

      // Registra en el historial de correos.
      try {
        await admin.from('moveya_emails').insert({
          id: crypto.randomUUID(),
          to_email: row.to_email,
          to_name: row.to_name ?? null,
          subject,
          status: errMsg ? 'error' : 'sent',
          provider_id: providerId || null,
          error: errMsg || null,
        });
      } catch { /* ignore */ }

      // Respeta el límite de ritmo de Resend.
      await new Promise((rz) => setTimeout(rz, 550));
    }

    return json({ ok: true, sent, failed, canceled });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
