// ============================================================================
// Move yA — Clases dadas por coach (nómina) · capa de datos
// ----------------------------------------------------------------------------
// Cada clase-día se registra en class_logs con DOBLE confirmación (coach ✓ +
// admin ✓). Las mutaciones pasan por RPC seguras (SECURITY DEFINER) que validan
// en el servidor. El monto se sugiere desde users.coach_pay y es editable.
// ============================================================================
import { supabase } from './supabase';
import { notifyError } from './notify';

export interface ClassLog {
  id: string;
  studioId: string;
  coachId: string;
  sessionId: string | null;
  templateId: string | null;
  occurredOn: string; // YYYY-MM-DD (día en que se dio la clase)
  title: string;
  capacity: number;
  attendees: number;
  isFull: boolean;
  coachConfirmedAt: string | null;
  staffConfirmedAt: string | null;
  staffConfirmedBy: string | null;
  amount: number;
  note: string | null;
  createdAt: string;
}

export type ClassLogStatus = 'pendiente' | 'confirmada';
export const logStatus = (l: ClassLog): ClassLogStatus =>
  l.coachConfirmedAt && l.staffConfirmedAt ? 'confirmada' : 'pendiente';

// Fecha LOCAL (YYYY-MM-DD) de un ISO — para usar como occurred_on (día de la clase).
export const localDate = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapClassLog = (r: any): ClassLog => ({
  id: r.id,
  studioId: r.studio_id,
  coachId: r.coach_id,
  sessionId: r.session_id ?? null,
  templateId: r.template_id ?? null,
  occurredOn: r.occurred_on,
  title: r.title ?? '',
  capacity: r.capacity ?? 0,
  attendees: r.attendees ?? 0,
  isFull: !!r.is_full,
  coachConfirmedAt: r.coach_confirmed_at ?? null,
  staffConfirmedAt: r.staff_confirmed_at ?? null,
  staffConfirmedBy: r.staff_confirmed_by ?? null,
  amount: Number(r.amount ?? 0),
  note: r.note ?? null,
  createdAt: r.created_at,
});

// Lee las ocurrencias del estudio en un rango de fechas (YYYY-MM-DD). La RLS
// limita: el admin ve todo su estudio; el coach ve solo las suyas.
export async function fetchClassLogs(studioId: string, fromDate: string, toDate: string): Promise<ClassLog[]> {
  const { data, error } = await supabase
    .from('class_logs')
    .select('*')
    .eq('studio_id', studioId)
    .gte('occurred_on', fromDate)
    .lte('occurred_on', toDate)
    .order('occurred_on', { ascending: false });
  if (error) {
    console.error('fetchClassLogs', error);
    return [];
  }
  return (data ?? []).map(mapClassLog);
}

// El COACH confirma que dio una clase (y deja los asistentes).
export async function coachConfirmClass(sessionId: string, occurredOn: string, attendees: number): Promise<boolean> {
  const { error } = await supabase.rpc('coach_confirm_class', {
    p_session_id: sessionId,
    p_occurred_on: occurredOn,
    p_attendees: Math.max(0, attendees | 0),
  });
  if (error) {
    notifyError('confirmar clase', error.message || 'No se pudo confirmar');
    return false;
  }
  return true;
}

// El ADMIN/recepción confirma (opcional: ajusta asistentes y/o monto).
export async function staffConfirmClass(logId: string, attendees?: number, amount?: number): Promise<boolean> {
  const { error } = await supabase.rpc('staff_confirm_class', {
    p_log_id: logId,
    p_attendees: attendees ?? null,
    p_amount: amount ?? null,
  });
  if (error) {
    notifyError('confirmar clase', error.message || 'No se pudo confirmar');
    return false;
  }
  return true;
}

// El ADMIN edita el monto final de una ocurrencia (campo confiable).
export async function setClassAmount(logId: string, amount: number): Promise<boolean> {
  const { error } = await supabase.rpc('set_class_amount', { p_log_id: logId, p_amount: Math.max(0, amount) });
  if (error) {
    notifyError('editar monto', error.message || 'No se pudo guardar');
    return false;
  }
  return true;
}
