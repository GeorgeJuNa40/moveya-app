// ============================================================================
// Move yA — Bandeja de WhatsApp (datos + tiempo real)
// ----------------------------------------------------------------------------
// Lee las conversaciones y mensajes de WhatsApp del estudio, permite responder
// (vía la Edge Function whatsapp-send), cambiar el modo (bot/humano) y marcar
// como leído. Se suscribe a Realtime para actualizarse en vivo.
//
// Nota: los mensajes NO viven en el estado global (useStore) porque pueden ser
// muchos; esta pantalla los consulta directo y escucha sus propios cambios.
// ============================================================================
import { supabase } from './supabase';
import { notifyError } from './notify';
import type { WaConversation, WaMessage, WaMode } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const mapConversation = (r: Row): WaConversation => ({
  id: r.id,
  studioId: r.studio_id,
  contactPhone: r.contact_phone,
  contactName: r.contact_name ?? undefined,
  phoneNumberId: r.phone_number_id ?? undefined,
  mode: (r.mode ?? 'bot') as WaMode,
  lastMessageAt: r.last_message_at ?? undefined,
  lastMessageText: r.last_message_text ?? undefined,
  lastDirection: r.last_direction ?? undefined,
  unread: Number(r.unread ?? 0),
  createdAt: r.created_at,
});

const mapMessage = (r: Row): WaMessage => ({
  id: r.id,
  conversationId: r.conversation_id,
  studioId: r.studio_id,
  direction: r.direction,
  sender: r.sender,
  body: r.body ?? '',
  createdAt: r.created_at,
});

// Lista de conversaciones del estudio (la más reciente primero).
export async function fetchConversations(): Promise<WaConversation[]> {
  const { data, error } = await supabase
    .from('wa_conversations')
    .select('*')
    .order('last_message_at', { ascending: false, nullsFirst: false });
  if (error) {
    notifyError('bandeja', error.message);
    return [];
  }
  return (data ?? []).map(mapConversation);
}

// Mensajes de una conversación (en orden cronológico).
export async function fetchMessages(conversationId: string): Promise<WaMessage[]> {
  const { data, error } = await supabase
    .from('wa_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) {
    notifyError('bandeja', error.message);
    return [];
  }
  return (data ?? []).map(mapMessage);
}

// Responde como persona (envía por WhatsApp y registra el mensaje). Al enviar,
// la conversación pasa a modo humano. Devuelve true si se envió.
export async function sendReply(conversationId: string, text: string): Promise<boolean> {
  try {
    const { error } = await supabase.functions.invoke('whatsapp-send', { body: { conversationId, text } });
    if (error) {
      let detail = error.message || 'Error al enviar';
      try {
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.clone === 'function') {
          const b = await ctx.clone().json();
          if (b?.error) detail = String(b.error);
        }
      } catch {
        /* sin cuerpo JSON */
      }
      notifyError('enviar WhatsApp', detail);
      return false;
    }
    return true;
  } catch (e) {
    notifyError('enviar WhatsApp', String((e as Error)?.message ?? e));
    return false;
  }
}

// Cambia el modo: 'bot' (responde el asistente) o 'human' (contesta una persona).
export async function setConversationMode(conversationId: string, mode: WaMode): Promise<void> {
  const { error } = await supabase.from('wa_conversations').update({ mode }).eq('id', conversationId);
  if (error) notifyError('cambiar modo', error.message);
}

// Marca la conversación como leída (quita el contador de no leídos).
export async function markConversationRead(conversationId: string): Promise<void> {
  const { error } = await supabase.from('wa_conversations').update({ unread: 0 }).eq('id', conversationId);
  if (error) notifyError('bandeja', error.message);
}

// Se suscribe en vivo a cambios de conversaciones y mensajes del estudio.
// Llama onChange cuando algo cambia (la pantalla vuelve a consultar lo que ve).
export function subscribeInbox(onConversation: () => void, onMessage: (m: WaMessage) => void) {
  const channel = supabase
    .channel('moveya-inbox')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_conversations' }, onConversation)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wa_messages' }, (payload) => {
      onMessage(mapMessage(payload.new as Row));
    })
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
