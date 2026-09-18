// ============================================================================
// Move yA — Edge Function: whatsapp-webhook
// ----------------------------------------------------------------------------
// Recibe los mensajes que le escriben al WhatsApp del estudio y responde
// automáticamente (el "bot"). Meta (WhatsApp Cloud API) llama a esta función
// cada vez que llega un mensaje.
//
// DISEÑO (multi-estudio + IA, con degradación elegante — NO gasta hasta que
// pongas tu llave de Claude):
//   1) Identifica de qué estudio es el mensaje (por el número de WhatsApp).
//   2) Si hay llave de Claude (ANTHROPIC_API_KEY) y el estudio no superó su
//      tope de uso justo -> responde con IA usando la base de conocimiento
//      de ESE estudio.
//   3) Si NO hay llave, o se alcanzó el tope, o algo falla -> responde con el
//      bot de reglas (gratis), personalizado con el nombre del estudio.
//
// Secrets en Supabase (Settings -> Edge Functions -> Secrets):
//   WHATSAPP_VERIFY_TOKEN  -> palabra secreta que TÚ inventas (la misma de Meta).
//   WHATSAPP_TOKEN         -> token de acceso de WhatsApp (para poder enviar).
//   ANTHROPIC_API_KEY      -> (OPCIONAL) llave de Claude. Sin ella, el bot usa
//                             reglas gratis. Ponla cuando quieras activar la IA.
//   WHATSAPP_AI_MONTHLY_CAP-> (OPCIONAL) tope de mensajes con IA por estudio al
//                             mes (uso justo). Por defecto 2000.
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY -> los inyecta Supabase solo.
//
// IMPORTANTE: despliega con "Verify JWT" DESACTIVADO.
// ============================================================================

const GRAPH = 'https://graph.facebook.com/v21.0';
const VERIFY_TOKEN = Deno.env.get('WHATSAPP_VERIFY_TOKEN') ?? '';
const WHATSAPP_TOKEN = Deno.env.get('WHATSAPP_TOKEN') ?? '';
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Modelo económico y de sobra capaz para responder dudas de un estudio.
const MODEL = 'claude-haiku-4-5';
// Tope de uso justo: mensajes con IA por estudio al mes (protege tu gasto).
const MONTHLY_CAP = Number(Deno.env.get('WHATSAPP_AI_MONTHLY_CAP') ?? '2000') || 2000;

// deno-lint-ignore no-explicit-any
type Any = any;

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // -------- 1) Verificación del webhook (Meta hace un GET al configurarlo).
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    console.log('🔎 GET verificación:', { mode, tokenOk: token === VERIFY_TOKEN });
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return new Response(challenge ?? '', { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }

  // -------- 2) Mensajes entrantes (POST).
  if (req.method === 'POST') {
    const raw = await req.text();
    console.log('📩 POST recibido:', raw.slice(0, 800));

    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(raw);
    } catch {
      console.log('⚠️ POST sin JSON válido');
    }

    try {
      const value = (body as Any)?.entry?.[0]?.changes?.[0]?.value;
      const msg = value?.messages?.[0];
      const phoneNumberId = value?.metadata?.phone_number_id;
      const displayPhone = value?.metadata?.display_phone_number ?? '';

      if (msg && msg.type === 'text' && phoneNumberId) {
        const from = msg.from as string;
        const text = (msg.text?.body as string) ?? '';
        console.log(`💬 Mensaje de ${from}: "${text}" (display=${displayPhone})`);

        // Identifica el estudio y con qué token responder. Se prefiere la
        // conexión oficial (Embedded Signup): cada estudio tiene SU propio token
        // guardado en whatsapp_accounts, buscado por el id del número. Si no hay,
        // se cae al alta manual (por número) usando el token global (Fase A).
        let studio: Studio | null = null;
        let sendToken = WHATSAPP_TOKEN;
        const acct = await getAccountByPhoneId(phoneNumberId);
        if (acct) {
          sendToken = acct.token;
          studio = await getStudioById(acct.studioId);
        } else {
          studio = await findStudioByPhone(displayPhone);
        }
        if (studio) console.log(`🏷️ Estudio: ${studio.name} (bot=${studio.botEnabled}, propio=${Boolean(acct)})`);

        // Si el estudio existe y APAGÓ el bot, no respondemos (lo atiende una persona).
        if (studio && studio.botEnabled === false) {
          console.log('🤖 Bot desactivado por el estudio — no se responde.');
          return new Response('EVENT_RECEIVED', { status: 200 });
        }

        if (!sendToken) {
          console.error('⚠️ Sin token para responder (ni propio del estudio ni WHATSAPP_TOKEN).');
        } else {
          const reply = await buildReply(studio, text);
          await sendText(phoneNumberId, from, reply, sendToken);
        }
      } else {
        console.log('ℹ️ POST sin mensaje de texto (probablemente un status/recibo).');
      }
    } catch (e) {
      console.error('❌ Error procesando el mensaje:', (e as Error).message);
    }

    return new Response('EVENT_RECEIVED', { status: 200 });
  }

  return new Response('Method not allowed', { status: 405 });
});

// ---------------------------------------------------------------------------
// Decide la respuesta: IA (si hay llave y no se superó el tope) o reglas.
// ---------------------------------------------------------------------------
async function buildReply(studio: Studio | null, text: string): Promise<string> {
  const name = studio?.name ?? 'el estudio';

  // Modo básico (reglas, GRATIS) si: no hay llave de Claude, no se identificó el
  // estudio, o el estudio aún no tiene la IA activada (p. ej. durante su prueba).
  // Así las pruebas nunca generan costo — la IA solo corre cuando aiActive = true.
  if (!ANTHROPIC_API_KEY || !studio || !studio.aiActive) {
    return rulesReply(text, name);
  }

  // Tope de uso justo: contamos los mensajes con IA de este estudio este mes.
  const count = await bumpUsage(studio.id);
  if (count !== null && count > MONTHLY_CAP) {
    console.log(`🧯 Tope de uso justo alcanzado (${count}/${MONTHLY_CAP}) — uso reglas.`);
    return rulesReply(text, name);
  }

  // IA con la base de conocimiento del estudio; si algo falla, cae a reglas.
  const ai = await aiReply(studio, text);
  return ai ?? rulesReply(text, name);
}

// ---------------------------------------------------------------------------
// Respuesta con IA (Claude Haiku 4.5) usando SOLO la base de conocimiento
// del estudio. Breve, cálida y sin inventar precios/horarios.
// ---------------------------------------------------------------------------
async function aiReply(studio: Studio, userText: string): Promise<string | null> {
  const kb = (studio.knowledge ?? []).map((k) => `- ${k}`).join('\n');
  const system =
    `Eres el asistente virtual de "${studio.name}", un estudio de Pilates. ` +
    `Respondes a los alumnos por WhatsApp de forma breve, cálida y clara ` +
    `(máximo 2 o 3 frases, en español). Usa ÚNICAMENTE la información de la ` +
    `base de conocimiento del estudio. Si no tienes el dato, invita amablemente ` +
    `a que el equipo del estudio se lo confirme; no inventes precios, horarios ` +
    `ni promociones que no estén aquí.\n\n` +
    `Base de conocimiento del estudio:\n${kb || '(sin información adicional cargada)'}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        // cache_control ahorra costo re-usando la base de conocimiento.
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userText }],
      }),
    });
    if (!res.ok) {
      console.error('❌ Claude rechazó:', res.status, (await res.text()).slice(0, 300));
      return null;
    }
    const data = await res.json();
    const block = (data.content ?? []).find((b: Any) => b.type === 'text');
    const out = (block?.text ?? '').trim();
    return out || null;
  } catch (e) {
    console.error('❌ Error llamando a Claude:', (e as Error).message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Bot de reglas (GRATIS) — respuesta de arranque, personalizada con el estudio.
// ---------------------------------------------------------------------------
function rulesReply(question: string, studioName: string): string {
  const q = question.toLowerCase();
  if (/hola|buenas|buenos|hey|qué tal|que tal/.test(q))
    return `¡Hola! 👋 Soy el asistente de ${studioName}. Puedo ayudarte con horarios, paquetes o reservas. ¿Qué necesitas?`;
  if (/gracias/.test(q)) return '¡Con gusto! 🙌 Aquí estoy para lo que necesites.';
  if (/horario|clase|reserva|reservar|agenda/.test(q))
    return 'Con gusto 📅 Puedes ver los horarios y reservar tu clase desde la app. ¿Te paso el enlace?';
  if (/pago|paquete|precio|costo|cuánto|cuanto/.test(q))
    return 'Tenemos varios paquetes 💳 Puedes verlos y pagarlos desde la app. ¿Te ayudo a elegir uno?';
  if (/ubicación|ubicacion|dónde|donde|dirección|direccion/.test(q))
    return 'Con gusto te comparto la ubicación 📍. Un momento y te atendemos.';
  return `Gracias por tu mensaje 🙏 En breve te atendemos en ${studioName}. Mientras tanto, ¿te ayudo con horarios, pagos o reservas?`;
}

// ---------------------------------------------------------------------------
// Datos: busca el estudio por su número de WhatsApp (últimos 10 dígitos).
// Usa la service role de Supabase (la inyecta la plataforma sola).
// ---------------------------------------------------------------------------
interface Studio {
  id: string;
  name: string;
  botEnabled: boolean;
  aiActive: boolean; // lo controla la plataforma: IA (con costo) vs reglas (gratis)
  knowledge: string[];
}

const digits = (s: string) => (s || '').replace(/\D/g, '');

async function findStudioByPhone(displayPhone: string): Promise<Studio | null> {
  if (!SUPABASE_URL || !SERVICE_KEY) return null; // aún sin configurar -> reglas
  const target = digits(displayPhone).slice(-10);
  if (!target) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/studios?select=id,name,whatsapp`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    if (!res.ok) {
      console.error('❌ No pude leer studios:', res.status);
      return null;
    }
    const rows: Any[] = await res.json();
    const row = rows.find((r) => digits(r.whatsapp?.number ?? '').slice(-10) === target);
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      botEnabled: row.whatsapp?.botEnabled ?? true,
      aiActive: row.whatsapp?.aiActive ?? false,
      knowledge: row.whatsapp?.knowledge ?? [],
    };
  } catch (e) {
    console.error('❌ Error buscando estudio:', (e as Error).message);
    return null;
  }
}

// Busca la conexión oficial (Embedded Signup) por el id del número: devuelve el
// estudio dueño y SU token de acceso propio (guardado en whatsapp_accounts).
async function getAccountByPhoneId(phoneNumberId: string): Promise<{ studioId: string; token: string } | null> {
  if (!SUPABASE_URL || !SERVICE_KEY || !phoneNumberId) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/whatsapp_accounts?select=studio_id,access_token&phone_number_id=eq.${encodeURIComponent(phoneNumberId)}`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
    );
    if (!res.ok) return null;
    const rows: Any[] = await res.json();
    const r = rows?.[0];
    if (!r?.access_token) return null;
    return { studioId: r.studio_id, token: r.access_token };
  } catch (e) {
    console.error('❌ Error buscando cuenta:', (e as Error).message);
    return null;
  }
}

// Lee un estudio por id (para la ruta de conexión oficial).
async function getStudioById(id: string): Promise<Studio | null> {
  if (!SUPABASE_URL || !SERVICE_KEY || !id) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/studios?select=id,name,whatsapp&id=eq.${encodeURIComponent(id)}`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    if (!res.ok) return null;
    const rows: Any[] = await res.json();
    const row = rows?.[0];
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      botEnabled: row.whatsapp?.botEnabled ?? true,
      aiActive: row.whatsapp?.aiActive ?? false,
      knowledge: row.whatsapp?.knowledge ?? [],
    };
  } catch (e) {
    console.error('❌ Error leyendo estudio:', (e as Error).message);
    return null;
  }
}

// Suma 1 al contador de uso con IA del estudio en el mes actual y devuelve el
// nuevo total. Requiere la función SQL bump_whatsapp_usage (ver migración).
async function bumpUsage(studioId: string): Promise<number | null> {
  if (!SUPABASE_URL || !SERVICE_KEY) return 0;
  const ym = new Date().toISOString().slice(0, 7); // "2026-08"
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/bump_whatsapp_usage`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ p_studio: studioId, p_ym: ym }),
    });
    if (!res.ok) {
      console.error('⚠️ No pude actualizar el uso:', res.status);
      return null; // ante la duda, no bloqueamos la respuesta
    }
    return await res.json();
  } catch (e) {
    console.error('⚠️ Error contando uso:', (e as Error).message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Envía un mensaje de texto por la Cloud API de WhatsApp.
// ---------------------------------------------------------------------------
async function sendText(phoneNumberId: string, to: string, bodyText: string, token: string) {
  const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: bodyText },
    }),
  });
  const txt = await res.text();
  if (res.ok) {
    console.log('✅ WhatsApp aceptó el envío:', txt.slice(0, 300));
  } else {
    console.error('❌ WhatsApp rechazó el envío:', res.status, txt.slice(0, 400));
  }
}
