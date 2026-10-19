// ============================================================================
// Move yA — Lugares (cama/bici) ocupados de una sesión de clase
// ============================================================================
import { supabase } from './supabase';

// Devuelve las etiquetas de lugar YA ocupadas en una sesión (para que el alumno
// vea cuáles quedan libres). RLS/RPC solo exponen las etiquetas, no a quién.
export async function fetchTakenSpots(sessionId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc('session_taken_spots', { p_session_id: sessionId });
  if (error || !data) return [];
  return (data as string[]).filter(Boolean);
}
