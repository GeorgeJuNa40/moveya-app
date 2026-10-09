// ============================================================================
// Move yA — Rutinas de entrenamiento + seguimiento (Fase 3, gym/mixto)
// ----------------------------------------------------------------------------
// El staff (admin/coach) crea rutinas y las asigna a un miembro; el miembro las
// ve. Además, el miembro registra su peso/medidas en el tiempo (seguimiento).
// Consultas directas a Supabase (no viven en el estado global para no pesarlo).
// ============================================================================
import { supabase } from './supabase';
import { notifyError } from './notify';

export interface Exercise {
  name: string;
  sets?: string; // series (texto libre: "4")
  reps?: string; // repeticiones ("12" o "10-12")
  load?: string; // carga ("20 kg", "barra", etc.)
  notes?: string;
}

export interface Routine {
  id: string;
  studioId: string;
  userId: string;
  title: string;
  items: Exercise[];
  updatedBy?: string; // quién la asignó/editó (coach o admin) — para mostrar el coach
  updatedAt?: string;
}

export interface Measurement {
  id: string;
  userId: string;
  weightKg?: number | null;
  note?: string | null;
  createdAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapRoutine = (r: any): Routine => ({
  id: r.id,
  studioId: r.studio_id,
  userId: r.user_id,
  title: r.title ?? 'Rutina',
  items: Array.isArray(r.items) ? r.items : [],
  updatedBy: r.updated_by ?? undefined,
  updatedAt: r.updated_at ?? undefined,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapMeasurement = (r: any): Measurement => ({
  id: r.id,
  userId: r.user_id,
  weightKg: r.weight_kg ?? null,
  note: r.note ?? null,
  createdAt: r.created_at,
});

// Rutinas de un miembro (las usa el staff para ver/editar las de un alumno).
export async function fetchRoutines(userId: string): Promise<Routine[]> {
  const { data, error } = await supabase
    .from('routines')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) {
    notifyError('rutinas', error.message);
    return [];
  }
  return (data ?? []).map(mapRoutine);
}

// Crea o actualiza una rutina. Devuelve true si se guardó.
export async function saveRoutine(r: {
  id?: string;
  studioId: string;
  userId: string;
  title: string;
  items: Exercise[];
  updatedBy?: string;
}): Promise<boolean> {
  const row = {
    id: r.id ?? crypto.randomUUID(),
    studio_id: r.studioId,
    user_id: r.userId,
    title: r.title,
    items: r.items,
    updated_by: r.updatedBy ?? null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('routines').upsert(row);
  if (error) {
    notifyError('rutinas', error.message);
    return false;
  }
  return true;
}

export async function deleteRoutine(id: string): Promise<boolean> {
  const { error } = await supabase.from('routines').delete().eq('id', id);
  if (error) {
    notifyError('rutinas', error.message);
    return false;
  }
  return true;
}

// Seguimiento: medidas (peso) de un miembro, más recientes primero.
export async function fetchMeasurements(userId: string): Promise<Measurement[]> {
  const { data, error } = await supabase
    .from('member_measurements')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) {
    notifyError('seguimiento', error.message);
    return [];
  }
  return (data ?? []).map(mapMeasurement);
}

export async function addMeasurement(m: {
  studioId: string;
  userId: string;
  weightKg?: number | null;
  note?: string | null;
}): Promise<boolean> {
  const { error } = await supabase.from('member_measurements').insert({
    id: crypto.randomUUID(),
    studio_id: m.studioId,
    user_id: m.userId,
    weight_kg: m.weightKg ?? null,
    note: m.note ?? null,
  });
  if (error) {
    notifyError('seguimiento', error.message);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Cumplimiento de rutina: el alumno marca, el coach confirma (dos pasos).
// ---------------------------------------------------------------------------
export interface Completion {
  id: string;
  routineId: string;
  userId: string;
  day: string;
  memberDone: boolean;
  coachConfirmed: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapCompletion = (r: any): Completion => ({
  id: r.id,
  routineId: r.routine_id,
  userId: r.user_id,
  day: r.day,
  memberDone: !!r.member_done,
  coachConfirmed: !!r.coach_confirmed,
});

// Alumno: marca que cumplió su rutina hoy (queda pendiente de confirmación).
export async function markRoutineDone(routineId: string): Promise<boolean> {
  const { error } = await supabase.rpc('mark_routine_done', { p_routine_id: routineId });
  if (error) {
    notifyError('rutina', error.message);
    return false;
  }
  return true;
}

// Coach/admin: confirma que efectivamente se cumplió.
export async function confirmCompletion(id: string): Promise<boolean> {
  const { error } = await supabase.rpc('confirm_routine_completion', { p_id: id });
  if (error) {
    notifyError('confirmar', error.message);
    return false;
  }
  return true;
}

// Cumplimientos de un miembro (para mostrarle su estado por rutina).
export async function fetchMyCompletions(userId: string): Promise<Completion[]> {
  const { data, error } = await supabase
    .from('routine_completions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(90);
  if (error) return [];
  return (data ?? []).map(mapCompletion);
}

// Pendientes por confirmar del estudio (lo que el staff debe revisar).
export async function fetchPendingCompletions(): Promise<Completion[]> {
  const { data, error } = await supabase
    .from('routine_completions')
    .select('*')
    .eq('member_done', true)
    .eq('coach_confirmed', false)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return [];
  return (data ?? []).map(mapCompletion);
}

// ---------------------------------------------------------------------------
// Biblioteca de videos (rutinas genéricas por enlace, estilo Smart Fit).
// ---------------------------------------------------------------------------
export interface RoutineVideo {
  id: string;
  title: string;
  url: string;
  level?: string | null;
  area?: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapVideo = (r: any): RoutineVideo => ({
  id: r.id,
  title: r.title,
  url: r.url,
  level: r.level ?? null,
  area: r.area ?? null,
});

export async function fetchVideos(): Promise<RoutineVideo[]> {
  const { data, error } = await supabase
    .from('routine_videos')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []).map(mapVideo);
}

export async function addVideo(v: {
  studioId: string;
  title: string;
  url: string;
  level?: string | null;
  area?: string | null;
}): Promise<boolean> {
  const { error } = await supabase.from('routine_videos').insert({
    id: crypto.randomUUID(),
    studio_id: v.studioId,
    title: v.title,
    url: v.url,
    level: v.level ?? null,
    area: v.area ?? null,
  });
  if (error) {
    notifyError('videos', error.message);
    return false;
  }
  return true;
}

export async function deleteVideo(id: string): Promise<boolean> {
  const { error } = await supabase.from('routine_videos').delete().eq('id', id);
  if (error) {
    notifyError('videos', error.message);
    return false;
  }
  return true;
}
