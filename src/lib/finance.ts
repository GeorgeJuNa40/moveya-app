// ============================================================================
// Move yA — Egresos / gastos del negocio (salidas de dinero)
// ============================================================================
import { supabase } from './supabase';
import { notifyError } from './notify';
import type { Expense } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const map = (r: any): Expense => ({
  id: r.id,
  studioId: r.studio_id,
  concept: r.concept,
  category: r.category ?? undefined,
  amountUsd: Number(r.amount_usd ?? 0),
  spentAt: r.spent_at,
  note: r.note ?? undefined,
  createdAt: r.created_at,
});

export async function fetchExpenses(studioId: string): Promise<Expense[]> {
  const { data, error } = await supabase
    .from('expenses').select('*').eq('studio_id', studioId)
    .order('spent_at', { ascending: false }).limit(500);
  if (error) return [];
  return (data ?? []).map(map);
}

export async function saveExpense(input: {
  studioId: string; concept: string; category?: string; amountUsd: number; spentAt: string; note?: string;
}): Promise<{ ok: boolean; expense?: Expense; error?: string }> {
  const { data, error } = await supabase
    .from('expenses')
    .insert({
      studio_id: input.studioId,
      concept: input.concept,
      category: input.category ?? null,
      amount_usd: input.amountUsd,
      spent_at: input.spentAt,
      note: input.note ?? null,
    })
    .select('*').single();
  if (error) { notifyError('egreso', error.message); return { ok: false, error: error.message }; }
  return { ok: true, expense: map(data) };
}

export async function deleteExpense(id: string): Promise<boolean> {
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) { notifyError('egreso', error.message); return false; }
  return true;
}
