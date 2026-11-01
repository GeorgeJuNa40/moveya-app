// ============================================================================
// Move yA — Panel de CREADOR (dueño de plataforma) · capa de datos
// ----------------------------------------------------------------------------
// Resumen de TODO lo que vende Move yA: estudios suscritos, su plan y estado,
// MRR, programa Fundador. Los datos los sirve la RPC `moveya_overview`
// (SECURITY DEFINER) que valida que quien llama es dueño de plataforma; así no
// se abre la RLS (que limita a cada admin a ver solo su estudio).
// ============================================================================
import { supabase } from './supabase';
import { getPlan, LEGACY_PLAN_PRICES, FOUNDER_PRICE_USD, LEGACY_FOUNDER_USD } from './plans';
import type { PlanId } from './types';

export interface MoveyaStudioRow {
  id: string;
  name: string;
  createdAt: string;
  plan: PlanId | null;
  status: string | null; // ACTIVE | TRIALING | PAST_DUE | CANCELED
  isPromo: boolean;
  founder: boolean;
  legacy: boolean; // precios heredados (grandfather)
  priceUsd: number | null; // precio mensual acordado guardado en la suscripción
  provider: string | null; // stripe | mercadopago
  billing: string | null; // monthly | annual
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  students: number;
  stripeOk: boolean; // puede cobrar por Stripe (cuenta conectada lista)
  mpOk: boolean; // tiene Mercado Pago conectado
}

export async function fetchMoveyaOverview(): Promise<MoveyaStudioRow[]> {
  const { data, error } = await supabase.rpc('moveya_overview');
  if (error || !data) return [];
  // deno-lint-ignore no-explicit-any
  const rows = ((data as { studios?: unknown[] }).studios ?? []) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name ?? ''),
    createdAt: String(r.created_at ?? ''),
    plan: (r.plan ?? null) as PlanId | null,
    status: (r.status ?? null) as string | null,
    isPromo: r.is_promo === true,
    founder: r.founder === true,
    legacy: r.legacy === true,
    priceUsd: r.price_usd != null ? Number(r.price_usd) : null,
    provider: (r.provider ?? null) as string | null,
    billing: (r.billing ?? null) as string | null,
    currentPeriodEnd: (r.current_period_end ?? null) as string | null,
    trialEndsAt: (r.trial_ends_at ?? null) as string | null,
    students: Number(r.students ?? 0),
    stripeOk: r.stripe_ok === true,
    mpOk: r.mp_ok === true,
  }));
}

// Precio mensual en USD que paga un estudio (para el MRR). Solo cuenta a los que
// REALMENTE pagan (status ACTIVE); prueba/promo/vencido/cancelado = 0. Respeta
// precios heredados (legacy), programa Fundador y cobro anual (prorrateado).
export function monthlyUsd(row: MoveyaStudioRow): number {
  if (row.status !== 'ACTIVE') return 0;
  // El precio guardado en la suscripción es el acordado al contratar: es la
  // fuente más fiel (para anual guarda el total del año → se prorratea).
  if (row.priceUsd && row.priceUsd > 0) {
    return row.billing === 'annual' ? Math.round((row.priceUsd / 12) * 100) / 100 : row.priceUsd;
  }
  // Respaldo: lo calculamos del plan (respetando Fundador, legacy y anual).
  if (row.founder) return row.legacy ? LEGACY_FOUNDER_USD : FOUNDER_PRICE_USD;
  if (!row.plan) return 0;
  const monthly = row.legacy ? LEGACY_PLAN_PRICES[row.plan]?.priceUsd : getPlan(row.plan).priceUsd;
  const yearly = row.legacy ? LEGACY_PLAN_PRICES[row.plan]?.priceUsdYear : getPlan(row.plan).priceUsdYear;
  if (row.billing === 'annual' && yearly) return Math.round((yearly / 12) * 100) / 100;
  return monthly ?? 0;
}

// Una prueba/promo cuyo plazo ya venció (sigue marcada TRIALING pero el acceso
// ya está bloqueado por fecha).
export function trialExpired(row: MoveyaStudioRow): boolean {
  return row.status === 'TRIALING' && !!row.trialEndsAt && new Date(row.trialEndsAt).getTime() < Date.now();
}

// ---------------------------------------------------------------------------
// Catálogo "Recomendados Move yA" (platform_products) — gestión del dueño.
// ---------------------------------------------------------------------------
export interface PlatformProductRow {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  url: string;
  category: string;
  priceText: string;
  active: boolean;
  sortOrder: number;
}

// Lista TODO el catálogo (incluye inactivos). Solo responde al dueño.
export async function fetchAllPlatformProducts(): Promise<PlatformProductRow[]> {
  const { data, error } = await supabase.rpc('moveya_products_all');
  if (error || !data) return [];
  // deno-lint-ignore no-explicit-any
  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    title: String(r.title ?? ''),
    description: String(r.description ?? ''),
    imageUrl: String(r.image_url ?? ''),
    url: String(r.url ?? ''),
    category: String(r.category ?? ''),
    priceText: String(r.price_text ?? ''),
    active: r.active !== false,
    sortOrder: Number(r.sort_order ?? 0),
  }));
}

// Crea (id vacío) o edita un producto. Devuelve true si salió bien.
export async function savePlatformProduct(p: {
  id?: string;
  title: string;
  description?: string;
  imageUrl?: string;
  url: string;
  category?: string;
  priceText?: string;
  active?: boolean;
  sortOrder?: number;
}): Promise<boolean> {
  const { error } = await supabase.rpc('moveya_product_save', {
    p_id: p.id ?? '',
    p_title: p.title,
    p_description: p.description ?? '',
    p_image_url: p.imageUrl ?? '',
    p_url: p.url,
    p_category: p.category ?? '',
    p_price_text: p.priceText ?? '',
    p_active: p.active ?? true,
    p_sort: p.sortOrder ?? 0,
  });
  return !error;
}

export async function deletePlatformProduct(id: string): Promise<boolean> {
  const { error } = await supabase.rpc('moveya_product_delete', { p_id: id });
  return !error;
}

// ---------------------------------------------------------------------------
// CRM de leads (prospectos de estudios/gyms) — gestión del dueño.
// ---------------------------------------------------------------------------
export type LeadStatus = 'nuevo' | 'contactado' | 'demo' | 'prueba' | 'pagando' | 'perdido';
export const LEAD_STATUSES: LeadStatus[] = ['nuevo', 'contactado', 'demo', 'prueba', 'pagando', 'perdido'];
export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  nuevo: 'Nuevo', contactado: 'Contactado', demo: 'Demo', prueba: 'En prueba', pagando: 'Pagando', perdido: 'Perdido',
};

export interface MoveyaLead {
  id: string;
  name: string;
  ownerName: string;
  phone: string;
  email: string;
  city: string;
  status: LeadStatus;
  source: string;
  notes: string;
  nextFollowup: string | null; // YYYY-MM-DD
  createdAt: string;
}

export async function fetchLeads(): Promise<MoveyaLead[]> {
  const { data, error } = await supabase.rpc('moveya_leads_all');
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    name: String(r.name ?? ''),
    ownerName: String(r.owner_name ?? ''),
    phone: String(r.phone ?? ''),
    email: String(r.email ?? ''),
    city: String(r.city ?? ''),
    status: (r.status ?? 'nuevo') as LeadStatus,
    source: String(r.source ?? ''),
    notes: String(r.notes ?? ''),
    nextFollowup: (r.next_followup ?? null) as string | null,
    createdAt: String(r.created_at ?? ''),
  }));
}

export async function saveLead(l: {
  id?: string;
  name: string;
  ownerName?: string;
  phone?: string;
  email?: string;
  city?: string;
  status?: LeadStatus;
  source?: string;
  notes?: string;
  nextFollowup?: string | null;
}): Promise<boolean> {
  const { error } = await supabase.rpc('moveya_lead_save', {
    p_id: l.id ?? '',
    p_name: l.name,
    p_owner_name: l.ownerName ?? '',
    p_phone: l.phone ?? '',
    p_email: l.email ?? '',
    p_city: l.city ?? '',
    p_status: l.status ?? 'nuevo',
    p_source: l.source ?? '',
    p_notes: l.notes ?? '',
    p_next_followup: l.nextFollowup || null,
  });
  return !error;
}

export async function deleteLead(id: string): Promise<boolean> {
  const { error } = await supabase.rpc('moveya_lead_delete', { p_id: id });
  return !error;
}
