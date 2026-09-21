// Tipos del dominio Move yA (espejo del esquema Prisma, versión front del MVP).

export type Role = 'STUDIO_ADMIN' | 'COACH' | 'STUDENT';

export type SubscriptionStatus = 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'TRIALING';

export type PlanId = 'inicio' | 'pro' | 'premium';

export type BookingStatus = 'RESERVED' | 'ATTENDED' | 'CANCELED' | 'NO_SHOW';

export type CoachStatus = 'APPROVED' | 'PENDING' | 'DENIED';

export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'paypal';

export type MembershipState = 'active' | 'expiring' | 'expired' | 'none';

// Página informativa pública (opcional): la llena el estudio si quiere, con la
// info que decida compartir (clases, horarios, etc.). Todos los campos son
// opcionales; los vacíos no se muestran.
export interface StudioInfoPage {
  enabled?: boolean; // el estudio la publica (activa su link/QR)
  headline?: string; // título o frase principal
  about?: string; // descripción libre del estudio
  schedule?: string; // clases y horarios (texto libre)
  hours?: string; // horario de atención
  contact?: string; // teléfono, redes, ubicación (texto libre)
  flyerUrl?: string; // imagen/flyer opcional (subida como archivo)
}

export interface Branding {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  logoText: string;
  logoUrl?: string; // logo del estudio (imagen subida), visible para todos
  logoShape?: 'rounded' | 'circle'; // forma del logo: cuadrado redondeado (def.) o círculo
  goalStarReward?: number; // estrellas que gana el alumno al cumplir una meta (def. 5)
  heroPhotoUrl?: string;
  country?: string; // ISO del país del estudio (ej. MX), derivado del registro
  currencyCode?: string; // moneda local del estudio (ej. MXN); default USD
  cancellationPolicy?: string; // política de cancelación (la ve el alumno)
  cancellationHours?: number; // horas mínimas de anticipación para cancelar (candado)
  noShowPenaltyUsd?: number; // cargo (adeudo) por no asistir sin cancelar (0/omitido = sin penalización)
  bookingCutoffMinutes?: number; // minutos antes de la clase en que se cierran las reservas
  infoPage?: StudioInfoPage; // página informativa pública (opcional, la llena el estudio)
}

// Servicio opcional editable por el estudio (Nutrición, Kinesiología, etc.).
export interface OptionalService {
  id: string;
  name: string;
  description: string;
  whatsapp?: string; // WhatsApp del proveedor del servicio (a quién contactar)
  enabled: boolean;
  custom: boolean; // los custom se pueden eliminar
}

// Plantilla de mensaje del bot de WhatsApp, editable por el estudio.
export interface WhatsappTemplate {
  id: string;
  label: string;
  text: string;
}

export interface WhatsappConfig {
  number: string; // número del estudio (formato internacional, sin +)
  botEnabled: boolean; // interruptor del estudio: prende/apaga su bot
  // aiActive lo controla la PLATAFORMA (no el estudio). Si está apagado, el bot
  // responde en "modo básico" (reglas, gratis). Se enciende cuando el estudio
  // contrata el servicio del bot con IA — así las pruebas no generan costo.
  aiActive?: boolean;
  templates: WhatsappTemplate[];
  knowledge: string[]; // retro/base de conocimiento para que el bot responda
  // Conexión oficial vía Embedded Signup de Meta (el estudio conecta su propio
  // WhatsApp). Solo METADATOS no sensibles: el token de acceso NUNCA se guarda
  // aquí (vive en la tabla protegida whatsapp_accounts, solo service role).
  connected?: boolean; // true cuando se conectó por el flujo oficial de Meta
  wabaId?: string; // id de la cuenta de WhatsApp Business del estudio
  phoneNumberId?: string; // id del número (lo usa la Cloud API para enviar)
  verifiedName?: string; // nombre verificado que ve el alumno en WhatsApp
}

export interface Subscription {
  status: SubscriptionStatus;
  plan: PlanId; // plan contratado (inicio / pro / premium)
  priceUsd: number; // precio mensual del plan contratado
  promoPriceUsd: number; // precio de la promo de lanzamiento (1)
  trialDays: number; // días de prueba de la promo (14)
  isPromo: boolean; // registrado dentro de la ventana de lanzamiento (3 meses)
  founder?: boolean; // parte del programa Fundador (primeros 10): Premium + bot a precio especial de por vida
  trialEndsAt: string; // fin de la prueba
  currentPeriodEnd: string; // acceso hasta esta fecha
}

export interface Studio {
  id: string;
  name: string;
  ceuCode: string;
  phone: string;
  email: string;
  address: string;
  photos: string[]; // galería (URLs)
  branding: Branding;
  services: OptionalService[];
  whatsapp: WhatsappConfig;
  subscription: Subscription;
  stripeAccountId?: string; // cuenta Connect (Express) del estudio, para recibir pagos
  stripeChargesEnabled?: boolean; // el estudio ya puede recibir cobros en su cuenta
}

export interface CoachProfile {
  bio: string;
  specialties: string[];
  yearsExp: number;
}

export interface User {
  id: string;
  studioId: string;
  role: Role;
  fullName: string;
  email: string;
  phone: string;
  birthDate?: string; // fecha de nacimiento (ISO YYYY-MM-DD) — para el cumpleaños en el CRM
  avatarInitials: string;
  avatarUrl?: string; // foto de perfil (subida como archivo)
  createdAt: string;
  coachProfile?: CoachProfile;
  coachStatus?: CoachStatus; // solo coaches
  source?: 'trial' | 'companion'; // de dónde llegó: clase de prueba / invitado 2x1
}

// Invitado a una clase (sin cuenta): clase de prueba o acompañante (2x1). Ocupa
// un lugar en la clase. Si luego se registra con el mismo teléfono, se reconoce.
export interface ClassGuest {
  id: string;
  studioId: string;
  sessionId: string;
  name: string;
  phone?: string;
  kind: 'trial' | 'companion'; // clase de prueba | acompañante 2x1
  cost: number; // lo que pagó por la clase de prueba (0 = gratis)
  hostUserId?: string | null; // 2x1: alumno que lo invitó
  createdAt: string;
}

export interface Package {
  id: string;
  studioId: string;
  name: string;
  description: string;
  priceUsd: number;
  classCredits: number;
  validityDays: number;
  active: boolean;
  eligibleClassIds: string[];
}

export interface UserPackage {
  id: string;
  userId: string;
  packageId: string;
  creditsTotal: number;
  creditsUsed: number;
  purchasedAt: string;
  expiresAt: string;
  active: boolean;
}

export interface ClassTemplate {
  id: string;
  studioId: string;
  name: string;
  durationMin: number;
  colorHex: string;
  photoUrl?: string; // foto que define el tipo de clase
}

export interface ClassSession {
  id: string;
  studioId: string;
  templateId: string;
  coachId: string | null;
  startsAt: string; // ISO — próxima ocurrencia (si es fija, se recorre +7 días cada semana)
  endsAt: string;
  capacity: number;
  recurring: boolean; // clase fija semanal: no se borra, solo se limpian sus reservas cada semana
}

export interface Booking {
  id: string;
  userId: string;
  sessionId: string;
  userPackageId: string | null;
  status: BookingStatus;
  createdAt: string;
  penaltyUsd?: number; // adeudo por no asistir/cancelar tarde (0 = sin cargo)
  penaltyPaid?: boolean; // el estudio ya cobró/condonó ese adeudo
}

export interface Payment {
  id: string;
  userId: string;
  amountUsd: number;
  method: PaymentMethod;
  packageId?: string;
  concept: string;
  paidAt: string;
  registeredBy: 'studio' | 'online'; // manual (estudio) u online (pasarela)
}

export interface StarEntry {
  id: string;
  userId: string;
  delta: number;
  reason: 'attendance' | 'redemption' | 'bonus';
  createdAt: string;
}

export interface Reward {
  id: string;
  studioId: string;
  name: string;
  description: string;
  starCost: number;
  active: boolean;
}

export interface Goal {
  id: string;
  userId: string;
  title: string;
  targetValue: number; // meta: número de clases a asistir
  currentValue: number; // avance (clases asistidas en la ventana)
  periodEnd: string; // fecha límite
  achieved: boolean;
  createdAt?: string; // inicio de la ventana de conteo (cuándo se creó la meta)
}

export interface Database {
  studios: Studio[];
  users: User[];
  packages: Package[];
  userPackages: UserPackage[];
  classTemplates: ClassTemplate[];
  classSessions: ClassSession[];
  bookings: Booking[];
  payments: Payment[];
  stars: StarEntry[];
  rewards: Reward[];
  goals: Goal[];
  classGuests: ClassGuest[];
}
