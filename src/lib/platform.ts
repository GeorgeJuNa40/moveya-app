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

// ---------------------------------------------------------------------------
// WhatsApp de ventas de Move yA (estudio-plataforma oculto) — config del dueño.
// ---------------------------------------------------------------------------
export interface MoveyaWaConfig {
  botEnabled: boolean;
  aiActive: boolean;
  number: string;
  knowledge: string[];
  connected: boolean;     // el número ya está conectado (whatsapp_accounts)
  phoneNumberId: string;
}

export async function fetchWaConfig(): Promise<MoveyaWaConfig | null> {
  const { data, error } = await supabase.rpc('moveya_wa_config');
  if (error || !data) return null;
  const d = data as Record<string, unknown>;
  return {
    botEnabled: d.botEnabled === true,
    aiActive: d.aiActive === true,
    number: String(d.number ?? ''),
    knowledge: Array.isArray(d.knowledge) ? (d.knowledge as string[]) : [],
    connected: d.connected === true,
    phoneNumberId: String(d.phoneNumberId ?? ''),
  };
}

export async function saveWaConfig(c: {
  botEnabled: boolean; aiActive: boolean; number: string; knowledge: string[];
}): Promise<boolean> {
  const { error } = await supabase.rpc('moveya_wa_config_set', {
    p_bot_enabled: c.botEnabled,
    p_ai_active: c.aiActive,
    p_number: c.number,
    p_knowledge: c.knowledge,
  });
  return !error;
}

// Base de conocimiento de VENTAS por defecto (para el bot de Move yA). El dueño
// puede cargarla con un botón y luego editarla a su gusto.
export const DEFAULT_SALES_KB: string[] = [
  'Move yA es una plataforma (software/app) para administrar estudios de Pilates, gimnasios y estudios fitness: reservas, pagos, membresías, coaches y comunicación con tus alumnos, todo en un solo lugar.',
  'Move yA funciona desde el celular y la computadora; tus alumnos reservan sus clases desde su teléfono y tú administras todo desde tu panel.',
  'Move yA sirve para estudios de Pilates, reformer, gimnasios, funcional, yoga y estudios mixtos (gimnasio + estudio).',
  'Con Move yA dejas de usar libretas, Excel y grupos de WhatsApp: todo queda ordenado y automático.',
  'Move yA es multi-rol: dueño o administrador del estudio, gerente de sucursal, recepción u operador, coach o entrenador, alumno y proveedor de servicios (nutrición, kinesiología, etc.).',
  'Cada rol ve solo lo que le toca: el alumno reserva y ve sus créditos, el coach ve sus clases y pasa lista, recepción cobra y agenda, y el administrador ve reportes y configura todo.',
  'Los planes mensuales de Move yA son: Inicio $499 MXN ($29.99 USD), Pro $999 MXN ($54.99 USD) y Premium $1,999 MXN ($114.99 USD) al mes.',
  'El plan Inicio cuesta $499 MXN ($29.99 USD) al mes e incluye lo esencial para operar: calendario, reservas, control de acceso, membresías y paquetes, CRM, avisos de vencimiento y cobros con Stripe y Mercado Pago.',
  'El plan Inicio permite hasta 50 alumnos activos y hasta 3 coaches.',
  'El plan Pro cuesta $999 MXN ($54.99 USD) al mes e incluye todo lo del plan Inicio más alumnos ilimitados, hasta 8 coaches, tu marca propia (white-label), coaches externos, recompensas, servicios, reportes y página pública con QR.',
  'El plan Premium cuesta $1,999 MXN ($114.99 USD) al mes e incluye todo lo del plan Pro más coaches ilimitados, tienda, bot de WhatsApp con inteligencia artificial, multi-sucursal con gerente por sede, reportes avanzados y soporte prioritario.',
  'También existe pago anual con 2 meses gratis: Inicio $4,990 MXN ($299 USD), Pro $9,990 MXN ($549 USD) y Premium $19,990 MXN ($1,149 USD) al año.',
  'La suscripción de Move yA es mensual (o anual) y la puedes cancelar cuando quieras, sin permanencia forzada.',
  'Move yA tiene una prueba de $20 MXN ($1 USD) por 14 días con acceso Premium completo, para que lo pruebes sin riesgo.',
  'Durante la prueba de 14 días tienes todas las funciones Premium; al terminar eliges tu plan y, si no activas uno, el panel se bloquea.',
  'Programa Fundador: los primeros 10 estudios obtienen el plan Premium a precio de Pro más el bot, por $1,199 MXN ($64.99 USD) al mes de por vida, con el precio congelado para siempre.',
  'El Programa Fundador es por invitación con el código FUNDADOR10 y está limitado a solo 10 estudios; cuando se llena, se cierra.',
  'En el plan Premium la primera sucursal va incluida y cada sucursal adicional suma $990 MXN ($49 USD) al mes.',
  'Pagos: Move yA se conecta con Stripe y Mercado Pago; el dinero de tus alumnos llega directo a TU cuenta, no pasa por nosotros.',
  'No te cobramos comisión por las ventas a tus alumnos; tú te quedas con tu dinero (aplican solo las comisiones normales de Stripe o Mercado Pago).',
  'El bot de WhatsApp en modo básico es gratis; el bot con inteligencia artificial, que entiende mejor y conversa más natural, se incluye en Premium y en Fundador.',
  'Para empezar con Move yA regístrate aquí: https://moveyaapp.app/#/entrar',
  '¿Eres de los primeros 10 estudios? Entra al Programa Fundador aquí: https://moveyaapp.app/#/fundador',
  'Más información y acceso a Move yA: https://moveyaapp.app',
  '¿Necesito conocimientos técnicos? No, Move yA es fácil de usar y te ayudamos a configurarlo.',
  '¿Puedo cancelar cuando quiera? Sí, la suscripción es mensual y sin permanencia.',
  '¿Funciona para gimnasios y no solo Pilates? Sí, sirve para gimnasios, estudios de Pilates, funcional, yoga y negocios mixtos.',
  '¿Mis alumnos tienen que descargar una app de una tienda? No, entran desde el navegador del celular y también pueden instalarla como acceso directo.',
  '¿Puedo usar mi propia marca? Sí, Move yA es white-label: tu nombre, tus colores y tu logo.',
];
