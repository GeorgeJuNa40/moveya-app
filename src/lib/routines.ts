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
