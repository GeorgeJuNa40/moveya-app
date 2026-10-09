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
  createdAt: string; // entrada
  exitedAt: string | null; // salida (null = sigue dentro)
}

export interface CheckinResult {
  action: 'in' | 'out'; // 'in' = entrada registrada · 'out' = salida registrada
  duplicate: boolean; // doble escaneo muy seguido (no cambió nada)
  active: boolean; // el miembro tiene membresía/paquete vigente
  name: string;
  durationMin?: number; // en una salida: minutos que permaneció
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapCheckin = (r: any): Checkin => ({
  id: r.id,
  studioId: r.studio_id,
  userId: r.user_id,
  method: r.method ?? 'member_qr',
  createdAt: r.created_at,
  exitedAt: r.exited_at ?? null,
});

// Registra acceso con TOGGLE: 1er escaneo del día = entrada, el siguiente =
// salida. userId vacío = el propio usuario en sesión.
export async function accessCheckIn(userId?: string, method = 'member_qr'): Promise<CheckinResult> {
  const { data, error } = await supabase.rpc('access_check_in', {
    p_user_id: userId ?? null,
    p_method: method,
  });
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = (data ?? {}) as any;
  return {
    action: d.action === 'out' ? 'out' : 'in',
    duplicate: !!d.duplicate,
    active: !!d.active,
    name: d.name ?? '',
    durationMin: typeof d.duration_min === 'number' ? d.duration_min : undefined,
  };
}

// Formatea minutos de permanencia como "Xh Ym" o "Xm".
export function fmtDur(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
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
