// ============================================================================
// Move yA — Edge Function: sequence-tick   (Verify JWT: DESACTIVADO)
// ----------------------------------------------------------------------------
// La llama el cron (pg_cron). Procesa los pasos del workflow que ya vencieron
// (moveya_sequence_queue.send_at <= ahora y status=pending). Cada paso puede ser:
//   • 'email'  → envía un correo vía Resend (personaliza {{nombre}}).
//   • 'stage'  → cambia la etapa del lead en el CRM (moveya_leads.status).
// Respeta el interruptor global (moveya_sequence_config.active) y registra los
// correos en moveya_emails.
//
// Secrets: RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// ============================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const WHATSAPP_TOKEN = Deno.env.get('WHATSAPP_TOKEN') ?? '';
const GRAPH = 'https://graph.facebook.com/v21.0';
const FROM = 'Move yA <ventas@moveyaapp.app>';
const BATCH = 60;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

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
const VALID_STAGES = ['nuevo', 'contactado', 'demo', 'prueba', 'pagando', 'perdido'];

Deno.serve(async () => {
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: cfg } = await admin.from('moveya_sequence_config').select('active, steps').eq('id', 1).maybeSingle();
    if (!cfg?.active) return json({ ok: true, skipped: 'workflow inactivo', sent: 0 });
    const steps: { kind?: string; subject?: string; body?: string; stage?: string; template?: string; lang?: string }[] = Array.isArray(cfg.steps) ? cfg.steps : [];

    const nowIso = new Date().toISOString();
    const { data: due, error } = await admin
      .from('moveya_sequence_queue')
      .select('id, lead_id, to_email, to_name, to_phone, step_index')
      .eq('status', 'pending')
      .lte('send_at', nowIso)
      .order('send_at', { ascending: true })
      .limit(BATCH);
    if (error) return json({ ok: false, error: error.message }, 500);
    if (!due || due.length === 0) return json({ ok: true, sent: 0 });

    let sent = 0;
    let wa = 0;
    let failed = 0;
    let staged = 0;
    let canceled = 0;

    for (const row of due) {
      const step = steps[row.step_index];
      if (!step) {
        await admin.from('moveya_sequence_queue').update({ status: 'canceled' }).eq('id', row.id);
        canceled++;
        continue;
      }
      const kind = step.kind || 'email';

      // --- Paso: cambiar etapa del lead ---
      if (kind === 'stage') {
        const target = String(step.stage ?? '').trim();
        if (row.lead_id && VALID_STAGES.includes(target)) {
          try { await admin.from('moveya_leads').update({ status: target, updated_at: new Date().toISOString() }).eq('id', row.lead_id); staged++; } catch { /* ignore */ }
        }
        await admin.from('moveya_sequence_queue').update({ status: 'sent' }).eq('id', row.id);
        continue;
      }

      // --- Paso: WhatsApp (plantilla aprobada) ---
      if (kind === 'whatsapp') {
        const phone = String(row.to_phone ?? '').replace(/[^0-9]/g, '');
        const tmpl = String(step.template ?? '').trim();
        if (!phone || !tmpl) { // sin teléfono o sin plantilla, no se puede
          await admin.from('moveya_sequence_queue').update({ status: 'canceled' }).eq('id', row.id);
          canceled++;
          continue;
        }
        // Número + token de la plataforma (se configuran al poner el número de producción).
        const { data: acct } = await admin.from('whatsapp_accounts')
          .select('phone_number_id, access_token').eq('studio_id', 'moveya-platform').maybeSingle();
        const pnid = acct?.phone_number_id;
        const token = acct?.access_token || WHATSAPP_TOKEN;
        if (!pnid || !token) { // WhatsApp aún no configurado → se cancela este paso
          await admin.from('moveya_sequence_queue').update({ status: 'canceled' }).eq('id', row.id);
          canceled++;
          continue;
        }
        const who = (row.to_name && String(row.to_name).trim()) || 'hola';
        const lang = String(step.lang ?? 'es_MX').trim() || 'es_MX';
        try {
          const res = await fetch(`${GRAPH}/${pnid}/messages`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messaging_product: 'whatsapp', to: phone, type: 'template',
              template: { name: tmpl, language: { code: lang },
                components: [{ type: 'body', parameters: [{ type: 'text', text: who }] }] },
            }),
          });
          if (res.ok) wa++; else { failed++; }
        } catch { failed++; }
        await admin.from('moveya_sequence_queue').update({ status: 'sent' }).eq('id', row.id);
        await new Promise((rz) => setTimeout(rz, 300));
        continue;
      }

      // --- Paso: email ---
      if (kind === 'email') {
        if (!row.to_email) { // sin correo no se puede enviar
          await admin.from('moveya_sequence_queue').update({ status: 'canceled' }).eq('id', row.id);
          canceled++;
          continue;
        }
        const who = (row.to_name && String(row.to_name).trim()) || 'hola';
        const subject = fill(step.subject ?? '', who);
        const html = brandedHtml(fill(step.body ?? '', who));
        let providerId = '';
        let errMsg = '';
        if (!RESEND_API_KEY) { errMsg = 'Falta RESEND_API_KEY'; failed++; }
        else {
          try {
            const res = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ from: FROM, to: [row.to_email], subject, html }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.id) { providerId = data.id; sent++; }
            else { errMsg = String(data?.message ?? data?.error ?? `HTTP ${res.status}`); failed++; }
          } catch (e) { errMsg = String((e as Error)?.message ?? e); failed++; }
        }
        await admin.from('moveya_sequence_queue').update({ status: 'sent' }).eq('id', row.id);
        try {
          await admin.from('moveya_emails').insert({
            id: crypto.randomUUID(), to_email: row.to_email, to_name: row.to_name ?? null,
            subject, status: errMsg ? 'error' : 'sent', provider_id: providerId || null, error: errMsg || null,
          });
        } catch { /* ignore */ }
        await new Promise((rz) => setTimeout(rz, 550));
        continue;
      }

      // Tipo desconocido → cancela.
      await admin.from('moveya_sequence_queue').update({ status: 'canceled' }).eq('id', row.id);
      canceled++;
    }

    return json({ ok: true, sent, wa, failed, staged, canceled });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
