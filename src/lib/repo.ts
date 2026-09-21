// Capa de acceso a datos: lee las tablas de Supabase y las traduce al
// formato que usa la app (de snake_case en la base -> camelCase en el front).
// Gracias a RLS, cada consulta solo devuelve los datos del estudio del usuario.
import { supabase } from './supabase';
import { notifyError } from './notify';
import type {
  Booking,
  ClassGuest,
  ClassSession,
  ClassTemplate,
  Database,
  Goal,
  Package,
  Payment,
  Reward,
  StarEntry,
  Studio,
  User,
  UserPackage,
} from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const DEFAULT_BRANDING = {
  primaryColor: '#4A5D55',
  secondaryColor: '#FAF8F3',
  accentColor: '#212121',
  fontFamily: 'Inter',
  logoText: 'Move yA',
  logoShape: 'rounded' as const,
  goalStarReward: 5,
};
const DEFAULT_WHATSAPP = { number: '', botEnabled: false, aiActive: false, templates: [], knowledge: [] };
const DEFAULT_SUBSCRIPTION = {
  status: 'TRIALING',
  plan: 'premium',
  priceUsd: 84.99,
  promoPriceUsd: 1,
  trialDays: 14,
  isPromo: true,
  trialEndsAt: new Date().toISOString(),
  currentPeriodEnd: new Date().toISOString(),
};

function mapStudio(r: Row): Studio {
  return {
    id: r.id,
    name: r.name,
    ceuCode: r.ceu_code,
    phone: r.phone ?? '',
    email: r.email ?? '',
    address: r.address ?? '',
    photos: r.photos ?? [],
    branding: { ...DEFAULT_BRANDING, ...(r.branding ?? {}) },
    services: r.services ?? [],
    whatsapp: { ...DEFAULT_WHATSAPP, ...(r.whatsapp ?? {}) },
    subscription: { ...DEFAULT_SUBSCRIPTION, ...(r.subscription ?? {}) },
    stripeAccountId: r.stripe_account_id ?? undefined,
    stripeChargesEnabled: r.stripe_charges_enabled ?? false,
  };
}

function mapUser(r: Row): User {
  const hasCoach = r.coach_bio || r.coach_years_exp || (r.coach_specialties && r.coach_specialties.length);
  return {
    id: r.id,
    studioId: r.studio_id,
    role: r.role,
    fullName: r.full_name,
    email: r.email,
    phone: r.phone ?? '',
    birthDate: r.birth_date ?? undefined,
    avatarInitials: r.avatar_initials ?? '',
    avatarUrl: r.avatar_url ?? undefined,
    createdAt: r.created_at,
    coachStatus: r.coach_status ?? undefined,
    coachProfile: hasCoach
      ? { bio: r.coach_bio ?? '', specialties: r.coach_specialties ?? [], yearsExp: r.coach_years_exp ?? 0 }
      : undefined,
    source: r.source ?? undefined,
  };
}

const mapClassGuest = (r: Row): ClassGuest => ({
  id: r.id,
  studioId: r.studio_id,
  sessionId: r.session_id,
  name: r.name,
  phone: r.phone ?? undefined,
  kind: r.kind ?? 'trial',
  cost: Number(r.cost ?? 0),
  hostUserId: r.host_user_id ?? null,
  createdAt: r.created_at,
});

export const rowClassGuest = (g: ClassGuest): Row => ({
  id: g.id,
  studio_id: g.studioId,
  session_id: g.sessionId,
  name: g.name,
  phone: g.phone ?? null,
  kind: g.kind,
  cost: g.cost,
  host_user_id: g.hostUserId ?? null,
  created_at: g.createdAt,
});

const mapPackage = (r: Row): Package => ({
  id: r.id,
  studioId: r.studio_id,
  name: r.name,
  description: r.description ?? '',
  priceUsd: Number(r.price_usd),
  classCredits: r.class_credits,
  validityDays: r.validity_days,
  active: r.active,
  eligibleClassIds: r.eligible_class_ids ?? [],
});

const mapUserPackage = (r: Row): UserPackage => ({
  id: r.id,
  userId: r.user_id,
  packageId: r.package_id,
  creditsTotal: r.credits_total,
  creditsUsed: r.credits_used,
  purchasedAt: r.purchased_at,
  expiresAt: r.expires_at,
  active: r.active,
});

const mapClassTemplate = (r: Row): ClassTemplate => ({
  id: r.id,
  studioId: r.studio_id,
  name: r.name,
  durationMin: r.duration_min,
  colorHex: r.color_hex,
  photoUrl: r.photo_url ?? undefined,
});

const mapClassSession = (r: Row): ClassSession => ({
  id: r.id,
  studioId: r.studio_id,
  templateId: r.template_id,
  coachId: r.coach_id ?? null,
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  capacity: r.capacity,
  recurring: r.recurring ?? true,
});

const mapBooking = (r: Row): Booking => ({
  id: r.id,
  userId: r.user_id,
  sessionId: r.session_id,
  userPackageId: r.user_package_id ?? null,
  status: r.status,
  createdAt: r.created_at,
  penaltyUsd: Number(r.penalty_usd ?? 0),
  penaltyPaid: r.penalty_paid ?? false,
});

const mapPayment = (r: Row): Payment => ({
  id: r.id,
  userId: r.user_id,
  amountUsd: Number(r.amount_usd),
  method: r.method,
  packageId: r.package_id ?? undefined,
  concept: r.concept ?? '',
  paidAt: r.paid_at,
  registeredBy: r.registered_by,
});

const mapStar = (r: Row): StarEntry => ({
  id: r.id,
  userId: r.user_id,
  delta: r.delta,
  reason: r.reason,
  createdAt: r.created_at,
});

const mapReward = (r: Row): Reward => ({
  id: r.id,
  studioId: r.studio_id,
  name: r.name,
  description: r.description ?? '',
  starCost: r.star_cost,
  active: r.active,
});

const mapGoal = (r: Row): Goal => ({
  id: r.id,
  userId: r.user_id,
  title: r.title,
  targetValue: r.target_value,
  currentValue: r.current_value,
  periodEnd: r.period_end,
  achieved: r.achieved,
  createdAt: r.created_at ?? undefined,
});

function emptyDatabase(): Database {
  return {
    studios: [],
    users: [],
    packages: [],
    userPackages: [],
    classTemplates: [],
    classSessions: [],
    bookings: [],
    payments: [],
    stars: [],
    rewards: [],
    goals: [],
    classGuests: [],
  };
}

export { emptyDatabase };

// Carga todo lo que el usuario tiene permitido ver (una consulta por tabla).
export async function loadDatabase(): Promise<Database> {
  const [
    studios,
    users,
    packages,
    userPackages,
    classTemplates,
    classSessions,
    bookings,
    payments,
    stars,
    rewards,
    goals,
    classGuests,
  ] = await Promise.all([
    supabase.from('studios').select('*'),
    supabase.from('users').select('*'),
    supabase.from('packages').select('*'),
    supabase.from('user_packages').select('*'),
    supabase.from('class_templates').select('*'),
    supabase.from('class_sessions').select('*'),
    supabase.from('bookings').select('*'),
    supabase.from('payments').select('*'),
    supabase.from('star_entries').select('*'),
    supabase.from('rewards').select('*'),
    supabase.from('goals').select('*'),
    supabase.from('class_guests').select('*'),
  ]);

  return {
    studios: (studios.data ?? []).map(mapStudio),
    users: (users.data ?? []).map(mapUser),
    packages: (packages.data ?? []).map(mapPackage),
    userPackages: (userPackages.data ?? []).map(mapUserPackage),
    classTemplates: (classTemplates.data ?? []).map(mapClassTemplate),
    classSessions: (classSessions.data ?? []).map(mapClassSession),
    bookings: (bookings.data ?? []).map(mapBooking),
    payments: (payments.data ?? []).map(mapPayment),
    stars: (stars.data ?? []).map(mapStar),
    rewards: (rewards.data ?? []).map(mapReward),
    goals: (goals.data ?? []).map(mapGoal),
    classGuests: (classGuests.data ?? []).map(mapClassGuest),
  };
}

// ---------------------------------------------------------------------------
// ESCRITURA: guarda cambios en Supabase (camelCase del front -> snake_case).
// Si algo falla, se muestra un aviso en pantalla (notifyError).
// ---------------------------------------------------------------------------

export async function dbInsert(table: string, row: Row) {
  const { error } = await supabase.from(table).insert(row);
  if (error) notifyError(`insert ${table}`, error.message);
}
export async function dbUpsert(table: string, row: Row) {
  const { error } = await supabase.from(table).upsert(row);
  if (error) notifyError(`upsert ${table}`, error.message);
}
export async function dbUpdate(table: string, id: string, patch: Row) {
  const { error } = await supabase.from(table).update(patch).eq('id', id);
  if (error) notifyError(`update ${table}`, error.message);
}
export async function dbDelete(table: string, id: string) {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) notifyError(`delete ${table}`, error.message);
}
export async function dbDeleteWhere(table: string, col: string, val: string) {
  const { error } = await supabase.from(table).delete().eq(col, val);
  if (error) notifyError(`delete ${table}`, error.message);
}

// Guarda el estudio completo (branding, servicios, whatsapp, suscripción, datos).
export async function persistStudio(s: Studio) {
  const { error } = await supabase
    .from('studios')
    .update({
      name: s.name,
      phone: s.phone,
      email: s.email,
      address: s.address,
      photos: s.photos,
      branding: s.branding,
      services: s.services,
      whatsapp: s.whatsapp,
      subscription: s.subscription,
    })
    .eq('id', s.id);
  if (error) notifyError('guardar estudio', error.message);
}

// Traductores camelCase -> fila de la base (snake_case).
export const rowPackage = (p: Package): Row => ({
  id: p.id,
  studio_id: p.studioId,
  name: p.name,
  description: p.description,
  price_usd: p.priceUsd,
  class_credits: p.classCredits,
  validity_days: p.validityDays,
  active: p.active,
  eligible_class_ids: p.eligibleClassIds,
});
export const rowUserPackage = (up: UserPackage): Row => ({
  id: up.id,
  user_id: up.userId,
  package_id: up.packageId,
  credits_total: up.creditsTotal,
  credits_used: up.creditsUsed,
  purchased_at: up.purchasedAt,
  expires_at: up.expiresAt,
  active: up.active,
});
export const rowClassTemplate = (t: ClassTemplate): Row => ({
  id: t.id,
  studio_id: t.studioId,
  name: t.name,
  duration_min: t.durationMin,
  color_hex: t.colorHex,
  photo_url: t.photoUrl ?? null,
});
export const rowClassSession = (s: ClassSession): Row => ({
  id: s.id,
  studio_id: s.studioId,
  template_id: s.templateId,
  coach_id: s.coachId,
  starts_at: s.startsAt,
  ends_at: s.endsAt,
  capacity: s.capacity,
  recurring: s.recurring,
});
export const rowBooking = (b: Booking): Row => ({
  id: b.id,
  user_id: b.userId,
  session_id: b.sessionId,
  user_package_id: b.userPackageId,
  status: b.status,
  created_at: b.createdAt,
  penalty_usd: b.penaltyUsd ?? 0,
  penalty_paid: b.penaltyPaid ?? false,
});
export const rowPayment = (p: Payment): Row => ({
  id: p.id,
  user_id: p.userId,
  amount_usd: p.amountUsd,
  method: p.method,
  package_id: p.packageId ?? null,
  concept: p.concept,
  paid_at: p.paidAt,
  registered_by: p.registeredBy,
});
export const rowStar = (s: StarEntry): Row => ({
  id: s.id,
  user_id: s.userId,
  delta: s.delta,
  reason: s.reason,
  created_at: s.createdAt,
});
export const rowReward = (r: Reward): Row => ({
  id: r.id,
  studio_id: r.studioId,
  name: r.name,
  description: r.description,
  star_cost: r.starCost,
  active: r.active,
});
export const rowGoal = (g: Goal): Row => ({
  id: g.id,
  user_id: g.userId,
  title: g.title,
  target_value: g.targetValue,
  current_value: g.currentValue,
  period_end: g.periodEnd,
  achieved: g.achieved,
  created_at: g.createdAt ?? new Date().toISOString(),
});
export const rowUser = (u: User): Row => ({
  id: u.id,
  studio_id: u.studioId,
  role: u.role,
  full_name: u.fullName,
  email: u.email,
  phone: u.phone,
  birth_date: u.birthDate ?? null,
  avatar_initials: u.avatarInitials,
  avatar_url: u.avatarUrl ?? null,
  coach_bio: u.coachProfile?.bio ?? null,
  coach_specialties: u.coachProfile?.specialties ?? [],
  coach_years_exp: u.coachProfile?.yearsExp ?? null,
  coach_status: u.coachStatus ?? null,
});
