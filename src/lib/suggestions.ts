// ============================================================================
// Move yA — Buzón de sugerencias (alumno → estudio, con respuesta)
// ----------------------------------------------------------------------------
// El alumno envía una sugerencia (categoría + mensaje) y elige si va ANÓNIMA o
// con su nombre. El estudio la lee por RPC (que oculta la identidad si es
// anónima) y puede responder. El alumno ve la respuesta en su app.
// ============================================================================
import { supabase } from './supabase';
import { notifyError } from './notify';

export type SuggestionStatus = 'nueva' | 'leida' | 'resuelta';

// Categorías del buzón (las ve el alumno al enviar).
export const SUGGESTION_CATEGORIES = [
  { id: 'clases', label: 'Clases' },
  { id: 'horarios', label: 'Horarios' },
  { id: 'instalaciones', label: 'Instalaciones' },
  { id: 'app', label: 'App' },
  { id: 'otro', label: 'Otro' },
] as const;

export const categoryLabel = (id: string): string =>
  SUGGESTION_CATEGORIES.find((c) => c.id === id)?.label ?? 'Otro';

// Vista del alumno: su propia sugerencia + la respuesta del estudio.
export interface MySuggestion {
  id: string;
  category: string;
  message: string;
  status: SuggestionStatus;
  anonymous: boolean;
  reply: string | null;
  repliedAt: string | null;
  createdAt: string;
}

// Vista del estudio: sin identidad si fue anónima (sender_name = null).
export interface StudioSuggestion {
  id: string;
  category: string;
  message: string;
  status: SuggestionStatus;
  anonymous: boolean;
  reply: string | null;
  repliedAt: string | null;
  createdAt: string;
  senderName: string | null; // null = anónima (o alumno sin nombre)
}

// ---- Alumno: enviar una sugerencia ----
export async function submitSuggestion(args: {
  studioId: string;
  userId: string;
  category: string;
  message: string;
  anonymous: boolean;
}): Promise<boolean> {
  const { error } = await supabase.from('suggestions').insert({
    id: crypto.randomUUID(),
    studio_id: args.studioId,
    user_id: args.userId,
    category: args.category,
    message: args.message,
    anonymous: args.anonymous,
  });
  if (error) {
    notifyError('sugerencia', error.message);
    return false;
  }
  return true;
}

// ---- Alumno: ver sus propias sugerencias (y las respuestas) ----
export async function fetchMySuggestions(userId: string): Promise<MySuggestion[]> {
  const { data, error } = await supabase
    .from('suggestions')
    .select('id, category, message, status, anonymous, reply, replied_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id,
    category: r.category,
    message: r.message,
    status: r.status,
    anonymous: !!r.anonymous,
    reply: r.reply ?? null,
    repliedAt: r.replied_at ?? null,
    createdAt: r.created_at,
  }));
}

// ---- Estudio: listar (identidad oculta si es anónima, vía RPC) ----
export async function fetchStudioSuggestions(): Promise<StudioSuggestion[]> {
  const { data, error } = await supabase.rpc('admin_list_suggestions');
  if (error) {
    notifyError('sugerencias', error.message);
    return [];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id,
    category: r.category,
    message: r.message,
    status: r.status,
    anonymous: !!r.anonymous,
    reply: r.reply ?? null,
    repliedAt: r.replied_at ?? null,
    createdAt: r.created_at,
    senderName: r.sender_name ?? null,
  }));
}

// ---- Estudio: responder (marca como resuelta) ----
export async function replySuggestion(id: string, reply: string): Promise<boolean> {
  const { error } = await supabase.rpc('admin_reply_suggestion', { p_id: id, p_reply: reply });
  if (error) {
    notifyError('responder', error.message);
    return false;
  }
  return true;
}

// ---- Estudio: cambiar estado (nueva / leida / resuelta) ----
export async function setSuggestionStatus(id: string, status: SuggestionStatus): Promise<boolean> {
  const { error } = await supabase.rpc('admin_set_suggestion_status', { p_id: id, p_status: status });
  if (error) {
    notifyError('estado', error.message);
    return false;
  }
  return true;
}
