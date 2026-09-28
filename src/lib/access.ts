// ============================================================================
// Move yA — Control de acceso (check-in) para gimnasios/mixtos
// ----------------------------------------------------------------------------
// Registra entradas de los miembros y lee las del día. El registro va por un RPC
// seguro (access_check_in): sin argumento = el propio alumno (escaneó el QR fijo
// de recepción); con userId = el staff registra a un miembro.
// ============================================================================
import { supabase } from './supabase';

export interface Checkin {
  id: string;
  studioId: string;
  userId: string;
  method: string;
  createdAt: string;
}

export interface CheckinResult {
  checkedIn: boolean;
  duplicate: boolean;
  active: boolean; // el miembro tiene membresía/paquete vigente
  name: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapCheckin = (r: any): Checkin => ({
  id: r.id,
  studioId: r.studio_id,
  userId: r.user_id,
  method: r.method ?? 'member_qr',
  createdAt: r.created_at,
});

// Registra una entrada. userId vacío = el propio usuario en sesión.
export async function accessCheckIn(userId?: string, method = 'member_qr'): Promise<CheckinResult> {
  const { data, error } = await supabase.rpc('access_check_in', {
    p_user_id: userId ?? null,
    p_method: method,
  });
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = (data ?? {}) as any;
  return {
    checkedIn: !!d.checked_in,
    duplicate: !!d.duplicate,
    active: !!d.active,
    name: d.name ?? '',
  };
}

// Entradas de HOY del estudio (más reciente primero).
export async function fetchTodayCheckins(): Promise<Checkin[]> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from('access_checkins')
    .select('*')
    .gte('created_at', start.toISOString())
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []).map(mapCheckin);
}

// Se suscribe en vivo a nuevas entradas del estudio.
export function subscribeCheckins(onChange: () => void): () => void {
  const channel = supabase
    .channel('moveya-access')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'access_checkins' }, onChange)
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
