// ============================================================================
// Move yA — Avisos del estudio (notificación masiva push a los alumnos)
// ============================================================================
import { supabase } from './supabase';
import { notifyError } from './notify';

export interface Announcement {
  id: string;
  studioId: string;
  title: string;
  body: string;
  recipients: number;
  active: boolean;
  createdAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const map = (r: any): Announcement => ({
  id: r.id,
  studioId: r.studio_id,
  title: r.title,
  body: r.body,
  recipients: Number(r.recipients ?? 0),
  active: r.active ?? true,
  createdAt: r.created_at,
});

// Envía un aviso push a TODOS los alumnos del estudio (Edge Function). Devuelve
// cuántas notificaciones se enviaron (según quién tiene push activado).
export async function broadcastAnnouncement(
  title: string,
  body: string,
): Promise<{ ok: boolean; recipients?: number; students?: number; error?: string }> {
  const { data, error } = await supabase.functions.invoke('broadcast-push', { body: { title, body } });
  if (error) {
    let detail = error.message || 'No se pudo enviar';
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.clone === 'function') { const b = await ctx.clone().json(); if (b?.error) detail = String(b.error); }
    } catch { /* sin cuerpo JSON */ }
    notifyError('aviso', detail);
    return { ok: false, error: detail };
  }
  const d = (data ?? {}) as { recipients?: number; students?: number };
  return { ok: true, recipients: d.recipients, students: d.students };
}

export async function fetchAnnouncements(studioId: string, limit = 20): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from('announcements').select('*').eq('studio_id', studioId)
    .order('created_at', { ascending: false }).limit(limit);
  if (error) return [];
  return (data ?? []).map(map);
}

// El aviso más reciente y activo (para mostrarlo al alumno en su panel).
export async function fetchLatestAnnouncement(studioId: string): Promise<Announcement | null> {
  const { data, error } = await supabase
    .from('announcements').select('*').eq('studio_id', studioId).eq('active', true)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  return map(data);
}
