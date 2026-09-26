// ============================================================================
// Move yA — Edge Function: whatsapp-send
// ----------------------------------------------------------------------------
// Envía un mensaje de WhatsApp desde la Bandeja de la app (respuesta de una
// PERSONA del estudio a un alumno). La usa la pantalla "Bandeja" cuando la
// conversación está en modo humano.
//
// Seguridad: valida que quien llama sea admin/coach del MISMO estudio dueño de
// la conversación (con su token de sesión). El token de WhatsApp NUNCA sale al
// navegador: se usa aquí, del lado del servidor.
//
// Body JSON: { conversationId: string, text: string }
//
// Secrets: WHATSAPP_TOKEN (fallback para números de alta manual). Los propios
// de cada estudio (Embedded Signup) se leen de whatsapp_accounts.
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY -> los da la plataforma.
//
// Deja "Verify JWT" ACTIVADO.
// ============================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const GRAPH = 'https://graph.facebook.com/v21.0';
const WHATSAPP_TOKEN = Deno.env.get('WHATSAPP_TOKEN') ?? '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

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
    if (me.role !== 'STUDIO_ADMIN' && me.role !== 'COACH') {
      return json({ error: 'Solo el estudio puede responder' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const conversationId = String(body.conversationId ?? '');
    const text = String(body.text ?? '').trim();
    if (!conversationId || !text) return json({ error: 'Falta conversación o texto' }, 400);

    // Cliente admin (service role) para leer la conversación y su token de envío.
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: convo } = await admin
      .from('wa_conversations')
      .select('id, studio_id, contact_phone, phone_number_id, mode')
      .eq('id', conversationId)
      .single();
    if (!convo) return json({ error: 'Conversación no encontrada' }, 404);
    if (convo.studio_id !== me.studio_id) return json({ error: 'No autorizado' }, 403);

    // Resuelve con qué token y número enviar: primero el propio del estudio
    // (Embedded Signup), si no, el token global (alta manual / Fase A).
    let sendToken = WHATSAPP_TOKEN;
    const phoneNumberId = convo.phone_number_id;
    if (phoneNumberId) {
      const { data: acct } = await admin
        .from('whatsapp_accounts')
        .select('access_token')
        .eq('phone_number_id', phoneNumberId)
        .maybeSingle();
      if (acct?.access_token) sendToken = acct.access_token;
    }
    if (!phoneNumberId || !sendToken) {
      return json({ error: 'Este estudio aún no tiene WhatsApp conectado para responder.' }, 400);
    }

    // Envía por la Cloud API.
    const waRes = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sendToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: convo.contact_phone,
        type: 'text',
        text: { body: text },
      }),
    });
    const waText = await waRes.text();
    if (!waRes.ok) {
      console.error('❌ WhatsApp rechazó:', waRes.status, waText.slice(0, 400));
      return json({ error: 'WhatsApp rechazó el envío', detail: waText.slice(0, 300) }, 502);
    }
    let waMsgId = '';
    try {
      waMsgId = JSON.parse(waText)?.messages?.[0]?.id ?? '';
    } catch (_) {
      /* ignore */
    }

    // Registra el mensaje saliente (de la persona) y actualiza la conversación:
    // queda en modo humano, sin pendientes por leer.
    await admin.from('wa_messages').insert({
      id: crypto.randomUUID(),
      conversation_id: convo.id,
      studio_id: convo.studio_id,
      direction: 'out',
      sender: 'human',
      body: text,
      wa_message_id: waMsgId || null,
    });
    await admin
      .from('wa_conversations')
      .update({
        mode: 'human',
        last_message_at: new Date().toISOString(),
        last_message_text: text.slice(0, 500),
        last_direction: 'out',
        unread: 0,
      })
      .eq('id', convo.id);

    return json({ ok: true });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
