// Tipos del dominio Move yA (espejo del esquema Prisma, versión front del MVP).

// STUDIO_ADMIN = dueño/super-admin (ve todas las sucursales, factura, crea sedes).
// BRANCH_ADMIN = gerente de una sucursal (ve/administra solo su sede).
export type Role = 'STUDIO_ADMIN' | 'BRANCH_ADMIN' | 'COACH' | 'STUDENT';

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
  studioPolicies?: string; // reglas y políticas del negocio (las ve el alumno en su panel)
  storeForMembers?: boolean; // muestra la tienda a alumnos y coaches (def. true si hay productos)
  storeCheckout?: 'request' | 'online' | 'both'; // cómo compran: apartar / en línea / ambos (def. request)
  requirePlanAll?: boolean; // exige plan activo a TODOS los miembros (no solo a los nuevos)
  cancellationHours?: number; // horas mínimas de anticipación para cancelar (candado)
  noShowPenaltyUsd?: number; // cargo (adeudo) por no asistir sin cancelar (0/omitido = sin penalización)
  bookingCutoffMinutes?: number; // minutos antes de la clase en que se cierran las reservas
  infoPage?: StudioInfoPage; // página informativa pública (opcional, la llena el estudio)
  // Control de acceso (gimnasio/mixto): cómo se registra la entrada.
  //  - 'member_qr' (def.): QR fijo en recepción, el miembro lo escanea con su app.
  //  - 'staff_qr': el miembro muestra su QR y el staff lo escanea.
  //  - 'manual': el staff marca la entrada a mano desde una lista.
  checkinMode?: 'member_qr' | 'staff_qr' | 'manual';
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
  founderInvited?: boolean; // se registró por el link privado de fundador (ve la oferta Fundador)
  promoPaymentId?: string; // id del pago de la promo de bienvenida (MP) — idempotencia
  promoSessionId?: string; // id de la sesión de la promo (Stripe) — idempotencia
  billingInterval?: 'monthly' | 'annual'; // periodo de cobro del plan (mensual por defecto)
  provider?: 'stripe' | 'mercadopago'; // proveedor con el que paga la suscripción
  mpPreapprovalId?: string; // id de la suscripción en Mercado Pago (si aplica)
  trialEndsAt: string; // fin de la prueba
  currentPeriodEnd: string; // acceso hasta esta fecha
}

// Tipo de negocio: define cómo opera y qué ve en la app.
//  - 'studio': clases con cupo y créditos (lo original).
//  - 'gym':    membresía + acceso libre + check-in (sin clases obligatorias).
//  - 'mixed':  gimnasio boutique con clases Y acceso libre.
export type StudioType = 'studio' | 'gym' | 'mixed';

// Sucursal de un negocio multi-sucursal (plan Premium). La 1ª va incluida; cada
// sucursal adicional creada suma al cobro mensual (anti-fraude: se factura por
// las sucursales dadas de alta en el sistema).
export interface Branch {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  active: boolean;
  createdAt: string;
}

export interface Studio {
  id: string;
  name: string;
  ceuCode: string;
  studioType: StudioType; // tipo de negocio (default 'studio')
  branches?: Branch[]; // sucursales (multi-sucursal, plan Premium). Vacío/1 = negocio de una sede
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
  mpConnected?: boolean; // el estudio conectó su cuenta de Mercado Pago (marketplace)
}

export interface CoachProfile {
  bio: string;
  specialties: string[];
  yearsExp: number;
}

// Producto físico del punto de venta (POS/tienda). Fase 1: catálogo + stock.
export interface Product {
  id: string;
  studioId: string;
  name: string;
  description?: string;
  priceUsd: number;
  stock: number;
  lowStock: number; // umbral de alerta de stock bajo
  photoUrl?: string;
  active: boolean;
  createdAt: string;
}

// Venta de producto (descuenta inventario y suma a ingresos de tienda).
export interface ProductSale {
  id: string;
  studioId: string;
  productId?: string;
  productName: string;
  userId?: string; // alumno (opcional); vacío = venta de mostrador
  qty: number;
  unitPrice: number;
  total: number;
  method: string;
  soldBy?: string;
  soldAt: string;
}

// Pedido de tienda (Fase A: "apartar"). El miembro arma un carrito y lo aparta;
// el admin lo cobra en mostrador y lo marca entregado (descuenta stock).
export interface StoreOrderItem {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
}

export type StoreOrderStatus = 'pending' | 'fulfilled' | 'canceled';

export interface StoreOrder {
  id: string;
  studioId: string;
  userId: string;
  userName?: string;
  items: StoreOrderItem[];
  total: number;
  status: StoreOrderStatus;
  note?: string;
  createdAt: string;
  fulfilledAt?: string;
}

// Tipo de coach en gimnasios/mixtos:
//  - 'fijo':    instructor de planta del estudio (como siempre).
//  - 'externo': entrenador que renta el espacio y trae a sus propios alumnos.
//               El gym define libremente cómo le cobra (ver externalFeeNote).
export type CoachType = 'fijo' | 'externo';

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
  coachType?: CoachType; // solo coaches (gym/mixto): de planta o externo. Def. 'fijo'
  externalFeeNote?: string; // coach externo: cómo le cobra el gym (texto libre)
  externalCoachId?: string; // alumno: coach externo al que pertenece (sus clientes)
  branchId?: string; // sucursal a la que pertenece (multi-sucursal); vacío = sede principal
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

// Tipo de plan que vende el negocio:
//  - 'credits': paquete por clases (descuenta 1 crédito por reserva). Lo original.
//  - 'access':  membresía de acceso libre (entrar cuando quieras durante la
//               vigencia; NO descuenta créditos). Para gimnasios/mixtos.
export type PackageKind = 'credits' | 'access';

// Periodo de cobro de una membresía de acceso. Define su vigencia y cómo se
// muestra ("Mensual", "Trimestral", etc.). "Por clase" = paquete de créditos.
export type BillingPeriod = 'day' | 'week' | 'biweekly' | 'month' | 'quarter' | 'year';

export interface Package {
  id: string;
  studioId: string;
  name: string;
  description: string;
  kind: PackageKind; // 'credits' (def.) o 'access'
  recurring?: boolean; // membresía de cobro mensual automático (domiciliación)
  period?: BillingPeriod; // periodo de cobro (solo membresías de acceso)
  priceUsd: number;
  classCredits: number; // solo relevante en 'credits'
  validityDays: number;
  active: boolean;
  eligibleClassIds: string[];
}

export interface UserPackage {
  id: string;
  userId: string;
  packageId: string;
  kind: PackageKind; // heredado del paquete al comprarlo
  creditsTotal: number;
  creditsUsed: number;
  purchasedAt: string;
  startsAt?: string; // inicio de vigencia (cola). Vacío = empieza al comprarse.
  expiresAt: string;
  active: boolean;
  stripeSubscriptionId?: string; // si es membresía domiciliada (cobro recurrente)
  cancelAtPeriodEnd?: boolean; // la domiciliación se cancela al terminar el periodo
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
  rewardId?: string; // en un canje: qué recompensa se canjeó
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

// --- Bandeja de WhatsApp (chats + handoff a humano) ---
export type WaMode = 'bot' | 'human';

export interface WaConversation {
  id: string;
  studioId: string;
  contactPhone: string;
  contactName?: string;
  phoneNumberId?: string;
  mode: WaMode; // 'bot' = responde el asistente | 'human' = contesta una persona
  lastMessageAt?: string;
  lastMessageText?: string;
  lastDirection?: 'in' | 'out';
  unread: number;
  createdAt: string;
}

export interface WaMessage {
  id: string;
  conversationId: string;
  studioId: string;
  direction: 'in' | 'out';
  sender: 'contact' | 'bot' | 'human';
  body: string;
  createdAt: string;
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
