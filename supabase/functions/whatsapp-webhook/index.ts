// ============================================================================
// Move yA — Edge Function: whatsapp-webhook
// ----------------------------------------------------------------------------
// Recibe los mensajes que le escriben al WhatsApp del estudio y responde
// automáticamente (el "bot"). Meta (WhatsApp Cloud API) llama a esta función
// cada vez que llega un mensaje.
//
// DISEÑO (multi-estudio + IA + Bandeja/Handoff, con degradación elegante):
//   1) Identifica de qué estudio es el mensaje (por el número de WhatsApp).
//   2) Registra la conversación y el mensaje en la Bandeja (wa_conversations /
//      wa_messages), para que el estudio los vea en vivo en la app.
//   3) HANDOFF A HUMANO: si el alumno pide hablar con una persona, o si la
//      conversación ya está en "modo humano", el bot NO responde y se avisa al
//      estudio (notificación push). El estudio contesta desde la Bandeja.
//   4) Si la conversación está en "modo bot": responde con IA (si hay llave y no
//      se superó el tope) o con reglas (gratis), usando la base de conocimiento
//      de ESE estudio.
//
// Secrets en Supabase (Settings → Edge Functions → Secrets):
//   WHATSAPP_VERIFY_TOKEN  -> palabra secreta que TÚ inventas (la misma de Meta).
//   WHATSAPP_TOKEN         -> token de acceso de WhatsApp (para poder enviar).
//   ANTHROPIC_API_KEY      -> (OPCIONAL) llave de Claude. Sin ella, reglas gratis.
//   WHATSAPP_AI_MONTHLY_CAP-> (OPCIONAL) tope de mensajes con IA por estudio/mes.
//   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT -> (OPCIONAL) para las
//                             notificaciones push al estudio cuando piden humano.
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY -> los inyecta Supabase solo.
//
// IMPORTANTE: despliega con "Verify JWT" DESACTIVADO.
// ============================================================================
import webpush from 'npm:web-push@3.6.7';

const GRAPH = 'https://graph.facebook.com/v21.0';
const VERIFY_TOKEN = Deno.env.get('WHATSAPP_VERIFY_TOKEN') ?? '';
const WHATSAPP_TOKEN = Deno.env.get('WHATSAPP_TOKEN') ?? '';
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:soporte@moveya.app';

// Modelo económico y de sobra capaz para responder dudas de un estudio.
const MODEL = 'claude-haiku-4-5';
// Tope de uso justo: mensajes con IA por estudio al mes (protege tu gasto).
const MONTHLY_CAP = Number(Deno.env.get('WHATSAPP_AI_MONTHLY_CAP') ?? '2000') || 2000;
// No repetir la notificación push al estudio más seguido que esto (anti-spam).
const NOTIFY_THROTTLE_MS = 90_000;

// Frases con las que un alumno pide hablar con una persona (handoff a humano).
const HUMAN_INTENT =
  /(hablar con (una |alguien|un )?(persona|humano|humana|asesor|agente|representante|ejecutiv|operador)|quiero (una |un )?(persona|humano|asesor|agente)|con un humano|con una persona|atenci[oó]n a clientes|hablar con alguien|me pueden llamar|me pueda atender alguien)/i;

// deno-lint-ignore no-explicit-any
type Any = any;

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  } catch (_) {
    /* claves inválidas: simplemente no habrá push */
  }
}

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
      const contactName = value?.contacts?.[0]?.profile?.name ?? '';

      if (msg && msg.type === 'text' && phoneNumberId) {
        const from = msg.from as string;
        const waMsgId = (msg.id as string) ?? '';
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

        // Registra la conversación + el mensaje entrante en la Bandeja.
        let convo: Convo | null = null;
        if (studio) {
          convo = await recordInbound(studio.id, from, phoneNumberId, contactName, text, waMsgId);
        }

        // Si el estudio existe y APAGÓ el bot globalmente, no respondemos.
        if (studio && studio.botEnabled === false) {
          console.log('🤖 Bot desactivado por el estudio — no se responde.');
          await maybeNotifyStudio(studio, convo, from, text);
          return new Response('EVENT_RECEIVED', { status: 200 });
        }

        // HANDOFF: si la conversación ya está en modo humano, el bot se calla y
        // solo avisamos al estudio (lo atiende una persona desde la Bandeja).
        if (convo && convo.mode === 'human') {
          console.log('🙋 Conversación en modo humano — el bot no responde.');
          await maybeNotifyStudio(studio!, convo, from, text);
          return new Response('EVENT_RECEIVED', { status: 200 });
        }

        // HANDOFF: si el alumno pide hablar con una persona, pasamos a modo
        // humano, respondemos un mensaje puente y avisamos al estudio.
        if (studio && convo && HUMAN_INTENT.test(text)) {
          console.log('🙋 El alumno pidio un humano — activando modo humano.');
          await setConvoMode(convo.id, 'human');
          convo.mode = 'human';
          const bridge =
            `¡Claro! 🙌 Ya avisé al equipo de ${studio.name}. ` +
            `En un momento te atiende una persona por aquí mismo. Gracias por tu paciencia. 💚`;
          if (sendToken) {
            await sendText(phoneNumberId, from, bridge, sendToken);
            await logOutbound(convo.id, studio.id, bridge, 'bot');
          }
          await maybeNotifyStudio(studio, convo, from, text, true);
          return new Response('EVENT_RECEIVED', { status: 200 });
        }

        // Modo bot: responde IA o reglas, y registra la respuesta en la Bandeja.
        if (!sendToken) {
          console.error('⚠️ Sin token para responder (ni propio del estudio ni WHATSAPP_TOKEN).');
        } else {
          const reply = await buildReply(studio, text);
          await sendText(phoneNumberId, from, reply, sendToken);
          if (convo) await logOutbound(convo.id, studio!.id, reply, 'bot');
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

  // AUTO-NUTRICIÓN: el bot ya conoce paquetes, clases, dirección, horarios y
  // política del estudio a partir de la info ya cargada en la app. A eso se le
  // suma la base de conocimiento "extra" que el estudio agregó a mano.
  const autoFacts = studio ? await fetchAutoFacts(studio.id) : [];
  const knowledge = [...autoFacts, ...(studio?.knowledge ?? [])];

  // Modo básico (reglas, GRATIS) si: no hay llave de Claude, no se identificó el
  // estudio, o el estudio aún no tiene la IA activada (p. ej. durante su prueba).
  if (!ANTHROPIC_API_KEY || !studio || !studio.aiActive) {
    return rulesReply(text, name, knowledge);
  }

  // Tope de uso justo: contamos los mensajes con IA de este estudio este mes.
  const count = await bumpUsage(studio.id);
  if (count !== null && count > MONTHLY_CAP) {
    console.log(`🧯 Tope de uso justo alcanzado (${count}/${MONTHLY_CAP}) — uso reglas.`);
    return rulesReply(text, name, knowledge);
  }

  // IA con la base de conocimiento del estudio; si algo falla, cae a reglas.
  const ai = await aiReply(studio, text, knowledge);
  return ai ?? rulesReply(text, name, knowledge);
}

// Arma los datos que el bot ya conoce SOLO (paquetes, clases, dirección,
// horarios, política) desde la info ya cargada en la app.
async function fetchAutoFacts(studioId: string): Promise<string[]> {
  if (!SUPABASE_URL || !SERVICE_KEY) return [];
  const facts: string[] = [];
  try {
    const sres = await fetch(
      `${SUPABASE_URL}/rest/v1/studios?select=name,phone,address,branding&id=eq.${encodeURIComponent(studioId)}`,
      { headers: svc() },
    );
    const srow: Any = sres.ok ? (await sres.json())[0] : null;
    const cur = srow?.branding?.currencyCode || 'USD';

    const pres = await fetch(
      `${SUPABASE_URL}/rest/v1/packages?select=name,price_usd,class_credits,validity_days,description&studio_id=eq.${encodeURIComponent(studioId)}&active=eq.true`,
      { headers: svc() },
    );
    const pkgs: Any[] = pres.ok ? await pres.json() : [];
    for (const p of pkgs) {
      facts.push(
        `Paquete "${p.name}": ${p.class_credits} clases por $${p.price_usd} ${cur}, vigencia ${p.validity_days} dias.` +
          (p.description ? ' ' + p.description : ''),
      );
    }

    const tres = await fetch(
      `${SUPABASE_URL}/rest/v1/class_templates?select=name&studio_id=eq.${encodeURIComponent(studioId)}`,
      { headers: svc() },
    );
    const tpls: Any[] = tres.ok ? await tres.json() : [];
    if (tpls.length) facts.push(`Tipos de clase: ${tpls.map((t) => t.name).join(', ')}.`);

    if (srow?.address) facts.push(`Direccion: ${srow.address}.`);
    if (srow?.phone) facts.push(`Telefono: ${srow.phone}.`);
    const ip = srow?.branding?.infoPage;
    if (ip?.hours) facts.push(`Horario de atencion: ${ip.hours}.`);
    if (ip?.schedule) facts.push(`Horarios de clases: ${ip.schedule}.`);
    if (srow?.branding?.cancellationPolicy) facts.push(`Politica de cancelacion: ${srow.branding.cancellationPolicy}.`);
  } catch (e) {
    console.error('⚠️ autofacts:', (e as Error).message);
  }
  return facts;
}

// ---------------------------------------------------------------------------
// Respuesta con IA (Claude Haiku 4.5) usando SOLO la base de conocimiento
// del estudio. Breve, cálida y sin inventar precios/horarios.
// ---------------------------------------------------------------------------
async function aiReply(studio: Studio, userText: string, knowledge: string[]): Promise<string | null> {
  const kb = (knowledge ?? []).map((k) => `- ${k}`).join('\n');
  const system =
    `Eres el asistente virtual de "${studio.name}", un estudio de Pilates. ` +
    `Respondes a los alumnos por WhatsApp de forma breve, cálida y clara ` +
    `(máximo 2 o 3 frases, en español). Usa ÚNICAMENTE la información de la ` +
    `base de conocimiento del estudio. Si no tienes el dato, invita amablemente ` +
    `a que el equipo del estudio se lo confirme; no inventes precios, horarios ` +
    `ni promociones que no estén aquí. Si la persona quiere hablar con un humano, ` +
    `dile que con gusto avisas al equipo.\n\n` +
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
function rulesReply(question: string, studioName: string, knowledge: string[] = []): string {
  const q = question.toLowerCase();
  // 1) Intenta responder con la info REAL del estudio (paquetes, dirección, etc.).
  const hit = (knowledge ?? []).find((k) => {
    const words = k.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
    return words.some((w) => q.includes(w));
  });
  if (hit) return hit;
  // 2) Respuestas guía de arranque.
  if (/hola|buenas|buenos|hey|qué tal|que tal/.test(q))
    return `¡Hola! 👋 Soy el asistente de ${studioName}. Puedo ayudarte con horarios, paquetes o reservas. ¿Qué necesitas? (Si quieres, también puedo comunicarte con una persona.)`;
  if (/gracias/.test(q)) return '¡Con gusto! 🙌 Aquí estoy para lo que necesites.';
  if (/horario|clase|reserva|reservar|agenda/.test(q))
    return 'Con gusto 📅 Puedes ver los horarios y reservar tu clase desde la app. ¿Te paso el enlace?';
  if (/pago|paquete|precio|costo|cuánto|cuanto/.test(q))
    return 'Tenemos varios paquetes 💳 Puedes verlos y pagarlos desde la app. ¿Te ayudo a elegir uno?';
  if (/ubicación|ubicacion|dónde|donde|dirección|direccion/.test(q))
    return 'Con gusto te comparto la ubicación 📍. Un momento y te atendemos.';
  return `Gracias por tu mensaje 🙏 En breve te atendemos en ${studioName}. Mientras tanto, ¿te ayudo con horarios, pagos o reservas? Si prefieres, escribe "quiero hablar con una persona".`;
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

interface Convo {
  id: string;
  mode: string; // 'bot' | 'human'
  lastNotifiedAt: string | null;
}

const digits = (s: string) => (s || '').replace(/\D/g, '');

const svc = () => ({ apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` });

async function findStudioByPhone(displayPhone: string): Promise<Studio | null> {
  if (!SUPABASE_URL || !SERVICE_KEY) return null; // aún sin configurar -> reglas
  const target = digits(displayPhone).slice(-10);
  if (!target) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/studios?select=id,name,whatsapp`, { headers: svc() });
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
      { headers: svc() },
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
      headers: svc(),
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

// ---------------------------------------------------------------------------
// BANDEJA: registra la conversación y el mensaje entrante. Devuelve la
// conversación (con su modo actual) para decidir el handoff.
// ---------------------------------------------------------------------------
async function recordInbound(
  studioId: string,
  contactPhone: string,
  phoneNumberId: string,
  contactName: string,
  text: string,
  waMsgId: string,
): Promise<Convo | null> {
  if (!SUPABASE_URL || !SERVICE_KEY) return null;
  try {
    // ¿Ya existe la conversación?
    const q = await fetch(
      `${SUPABASE_URL}/rest/v1/wa_conversations?select=id,mode,unread,last_notified_at&studio_id=eq.${encodeURIComponent(
        studioId,
      )}&contact_phone=eq.${encodeURIComponent(contactPhone)}`,
      { headers: svc() },
    );
    const rows: Any[] = q.ok ? await q.json() : [];
    let convo: Convo;

    if (rows[0]) {
      const r = rows[0];
      convo = { id: r.id, mode: r.mode ?? 'bot', lastNotifiedAt: r.last_notified_at ?? null };
      await fetch(`${SUPABASE_URL}/rest/v1/wa_conversations?id=eq.${encodeURIComponent(convo.id)}`, {
        method: 'PATCH',
        headers: { ...svc(), 'content-type': 'application/json' },
        body: JSON.stringify({
          last_message_at: new Date().toISOString(),
          last_message_text: text.slice(0, 500),
          last_direction: 'in',
          unread: (Number(r.unread) || 0) + 1,
          contact_name: contactName || r.contact_name || null,
          phone_number_id: phoneNumberId,
        }),
      });
    } else {
      const id = crypto.randomUUID();
      convo = { id, mode: 'bot', lastNotifiedAt: null };
      await fetch(`${SUPABASE_URL}/rest/v1/wa_conversations`, {
        method: 'POST',
        headers: { ...svc(), 'content-type': 'application/json' },
        body: JSON.stringify({
          id,
          studio_id: studioId,
          contact_phone: contactPhone,
          contact_name: contactName || null,
          phone_number_id: phoneNumberId,
          mode: 'bot',
          last_message_at: new Date().toISOString(),
          last_message_text: text.slice(0, 500),
          last_direction: 'in',
          unread: 1,
        }),
      });
    }

    // Guarda el mensaje entrante.
    await insertMessage(convo.id, studioId, 'in', 'contact', text, waMsgId);
    return convo;
  } catch (e) {
    console.error('⚠️ No pude registrar la conversación:', (e as Error).message);
    return null;
  }
}

async function insertMessage(
  conversationId: string,
  studioId: string,
  direction: string,
  sender: string,
  body: string,
  waMsgId: string,
) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/wa_messages`, {
      method: 'POST',
      headers: { ...svc(), 'content-type': 'application/json' },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        conversation_id: conversationId,
        studio_id: studioId,
        direction,
        sender,
        body,
        wa_message_id: waMsgId || null,
      }),
    });
  } catch (e) {
    console.error('⚠️ No pude guardar el mensaje:', (e as Error).message);
  }
}

// Guarda una respuesta saliente (del bot) en la Bandeja.
async function logOutbound(conversationId: string, studioId: string, body: string, sender: string) {
  if (!SUPABASE_URL || !SERVICE_KEY) return;
  await insertMessage(conversationId, studioId, 'out', sender, body, '');
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/wa_conversations?id=eq.${encodeURIComponent(conversationId)}`, {
      method: 'PATCH',
      headers: { ...svc(), 'content-type': 'application/json' },
      body: JSON.stringify({
        last_message_at: new Date().toISOString(),
        last_message_text: body.slice(0, 500),
        last_direction: 'out',
      }),
    });
  } catch (_) {
    /* no crítico */
  }
}

async function setConvoMode(conversationId: string, mode: string) {
  if (!SUPABASE_URL || !SERVICE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/wa_conversations?id=eq.${encodeURIComponent(conversationId)}`, {
      method: 'PATCH',
      headers: { ...svc(), 'content-type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
  } catch (_) {
    /* no crítico */
  }
}

// ---------------------------------------------------------------------------
// Notifica al estudio (push) que un alumno necesita atención humana. Con tope
// anti-spam: no repite el aviso de la misma conversación muy seguido.
// ---------------------------------------------------------------------------
async function maybeNotifyStudio(studio: Studio, convo: Convo | null, phone: string, text: string, force = false) {
  if (!convo || !SUPABASE_URL || !SERVICE_KEY) return;
  try {
    const last = convo.lastNotifiedAt ? new Date(convo.lastNotifiedAt).getTime() : 0;
    if (!force && Date.now() - last < NOTIFY_THROTTLE_MS) return;

    // Marca el momento del aviso (para el anti-spam).
    await fetch(`${SUPABASE_URL}/rest/v1/wa_conversations?id=eq.${encodeURIComponent(convo.id)}`, {
      method: 'PATCH',
      headers: { ...svc(), 'content-type': 'application/json' },
      body: JSON.stringify({ last_notified_at: new Date().toISOString() }),
    });

    if (!VAPID_PUBLIC || !VAPID_PRIVATE) return; // sin claves push, solo Bandeja en vivo

    // Admins del estudio.
    const ures = await fetch(
      `${SUPABASE_URL}/rest/v1/users?select=id&studio_id=eq.${encodeURIComponent(studio.id)}&role=eq.STUDIO_ADMIN`,
      { headers: svc() },
    );
    const admins: Any[] = ures.ok ? await ures.json() : [];
    if (!admins.length) return;
    const ids = admins.map((a) => `"${a.id}"`).join(',');

    const sres = await fetch(
      `${SUPABASE_URL}/rest/v1/push_subscriptions?select=*&studio_id=eq.${encodeURIComponent(
        studio.id,
      )}&user_id=in.(${ids})`,
      { headers: svc() },
    );
    const subs: Any[] = sres.ok ? await sres.json() : [];
    if (!subs.length) return;

    const payload = JSON.stringify({
      title: '🙋 Un alumno quiere hablar contigo',
      body: `${phone}: ${text.slice(0, 80)}`,
      url: '/#/admin/inbox',
    });
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      } catch (err) {
        const code = (err as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) {
          await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, {
            method: 'DELETE',
            headers: svc(),
          });
        }
      }
    }
  } catch (e) {
    console.error('⚠️ No pude notificar al estudio:', (e as Error).message);
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
      headers: { ...svc(), 'content-type': 'application/json' },
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
