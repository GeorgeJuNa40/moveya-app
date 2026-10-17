// ============================================================================
// Move yA — Citas/consultas de servicios opcionales (con comisión del estudio)
// ============================================================================
import { supabase } from './supabase';
import { notifyError } from './notify';
import type { ServiceAppointment, AppointmentStatus, OptionalService } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const map = (r: any): ServiceAppointment => ({
  id: r.id,
  studioId: r.studio_id,
  serviceId: r.service_id,
  serviceName: r.service_name,
  userId: r.user_id,
  userName: r.user_name ?? undefined,
  preferredAt: r.preferred_at ?? undefined,
  scheduledFor: r.scheduled_for ?? undefined,
  status: (r.status ?? 'requested') as AppointmentStatus,
  commissionUsd: Number(r.commission_usd ?? 0),
  commissionPaid: !!r.commission_paid,
  note: r.note ?? undefined,
  createdAt: r.created_at,
});

// Comisión que cobra el estudio por un servicio, dado su precio.
export function serviceCommission(sv: Pick<OptionalService, 'commissionType' | 'commissionValue' | 'price'>): number {
  const val = Number(sv.commissionValue ?? 0);
  if (!val) return 0;
  if (sv.commissionType === 'percent') {
    const base = Number(sv.price ?? 0);
    return Math.round(base * (val / 100) * 100) / 100;
  }
  return val; // fija
}

// Admin: todas las citas del estudio.
export async function fetchAppointments(studioId: string): Promise<ServiceAppointment[]> {
  const { data, error } = await supabase
    .from('service_appointments').select('*').eq('studio_id', studioId)
    .order('created_at', { ascending: false }).limit(500);
  if (error) return [];
  return (data ?? []).map(map);
}

// Proveedor: las citas de SU servicio (la RLS ya limita a su servicio/estudio).
export async function fetchProviderAppointments(serviceId: string): Promise<ServiceAppointment[]> {
  const { data, error } = await supabase
    .from('service_appointments').select('*').eq('service_id', serviceId)
    .order('created_at', { ascending: false }).limit(500);
  if (error) return [];
  return (data ?? []).map(map);
}

// Alumno: mis citas.
export async function fetchMyAppointments(userId: string): Promise<ServiceAppointment[]> {
  const { data, error } = await supabase
    .from('service_appointments').select('*').eq('user_id', userId)
    .order('created_at', { ascending: false }).limit(100);
  if (error) return [];
  return (data ?? []).map(map);
}

// Alumno: solicita una cita. Si manda `scheduledFor` (hueco elegido) queda
// AGENDADA directo; si no, queda como SOLICITUD (sin fecha) para que la agenden.
export async function requestAppointment(input: {
  studioId: string; serviceId: string; serviceName: string;
  userId: string; userName?: string; preferredAt?: string; note?: string; scheduledFor?: string;
}): Promise<{ ok: boolean; appointment?: ServiceAppointment; error?: string }> {
  const scheduled = !!input.scheduledFor;
  const { data, error } = await supabase
    .from('service_appointments')
    .insert({
      studio_id: input.studioId,
      service_id: input.serviceId,
      service_name: input.serviceName,
      user_id: input.userId,
      user_name: input.userName ?? null,
      preferred_at: input.preferredAt ?? null,
      scheduled_for: input.scheduledFor ?? null,
      note: input.note ?? null,
      status: scheduled ? 'scheduled' : 'requested',
    })
    .select('*').single();
  if (error) { notifyError('cita', error.message); return { ok: false, error: error.message }; }
  return { ok: true, appointment: map(data) };
}

// Horarios ya ocupados de un servicio (timestamps ISO), para calcular huecos libres.
export async function fetchTakenSlots(serviceId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc('service_taken_slots', { p_service_id: serviceId });
  if (error || !data) return [];
  return (data as string[]).map((t) => new Date(t).toISOString());
}

// Admin: actualiza una cita (agendar, completar, cancelar, fijar/cobrar comisión).
export async function updateAppointment(
  id: string,
  patch: Partial<Pick<ServiceAppointment, 'status' | 'scheduledFor' | 'commissionUsd' | 'commissionPaid' | 'note'>>,
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row: any = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.scheduledFor !== undefined) row.scheduled_for = patch.scheduledFor;
  if (patch.commissionUsd !== undefined) row.commission_usd = patch.commissionUsd;
  if (patch.commissionPaid !== undefined) row.commission_paid = patch.commissionPaid;
  if (patch.note !== undefined) row.note = patch.note;
  const { error } = await supabase.from('service_appointments').update(row).eq('id', id);
  if (error) { notifyError('cita', error.message); return false; }
  return true;
}
