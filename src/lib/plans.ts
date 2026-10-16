import type { PlanId } from './types';

// Catálogo de planes de suscripción del panel del Estudio.
// Precios mensuales en USD (terminados en .99). Durante la prueba de
// lanzamiento ($1 · 14 días) se habilita el plan Premium completo para que
// el estudio conozca todas las funciones antes de elegir.
export interface Plan {
  id: PlanId;
  name: string;
  priceUsd: number; // precio mensual (USD)
  priceUsdYear: number; // precio anual (USD) — 2 meses gratis
  priceMxn: number; // precio mensual (MXN) — para Mercado Pago
  priceMxnYear: number; // precio anual (MXN) — 2 meses gratis
  tagline: string;
  highlight?: boolean; // plan destacado ("Más popular")
  features: string[];
}

export const PROMO_PRICE = 1;
export const PROMO_TRIAL_DAYS = 14;

// Facturación anual: pagar al año = 2 meses gratis (~17% de ahorro).
export type BillingInterval = 'monthly' | 'annual';
// Precio del plan según el periodo elegido.
export const planPrice = (p: Plan, interval: BillingInterval): number =>
  interval === 'annual' ? p.priceUsdYear : p.priceUsd;
// Equivalente mensual de un plan anual (para el "equivale a $X/mes").
export const annualPerMonth = (p: Plan): number => Math.round((p.priceUsdYear / 12) * 100) / 100;
// Ahorro anual vs pagar 12 meses sueltos.
export const annualSavings = (p: Plan): number => Math.round((p.priceUsd * 12 - p.priceUsdYear) * 100) / 100;

// Moneda de cobro: Stripe cobra en USD; Mercado Pago (México) en MXN. El precio
// NO se convierte por tipo de cambio: son precios FIJOS que fijaste para cada
// moneda, y la pantalla muestra el de la moneda/proveedor elegido.
export type Currency = 'USD' | 'MXN';
export const PROMO_PRICE_MXN = 20; // la promo de bienvenida en pesos (tu gancho)
export const CURRENCY_SUFFIX: Record<Currency, string> = { USD: 'USD', MXN: 'MXN' };
// Precio del plan según moneda + periodo (mensual/anual).
export const planPriceCur = (p: Plan, currency: Currency, interval: BillingInterval): number =>
  currency === 'MXN'
    ? (interval === 'annual' ? p.priceMxnYear : p.priceMxn)
    : (interval === 'annual' ? p.priceUsdYear : p.priceUsd);
// Equivalente mensual y ahorro anual, según la moneda.
export const annualPerMonthCur = (p: Plan, c: Currency): number =>
  c === 'MXN' ? Math.round(p.priceMxnYear / 12) : annualPerMonth(p);
export const annualSavingsCur = (p: Plan, c: Currency): number =>
  c === 'MXN' ? p.priceMxn * 12 - p.priceMxnYear : annualSavings(p);
export const PROMO_PLAN: PlanId = 'premium'; // plan que se habilita durante la prueba (todo Premium)

// Programa Fundador (primeros 10 estudios): acceso Premium al precio de Pro +
// el bot de WhatsApp ($10), en un solo cargo mensual, de por vida. El código lo
// entregas solo a tus invitados; el servidor además limita a 10 en total.
export const FOUNDER_CODE = 'FUNDADOR10';
export const FOUNDER_BOT_USD = 10;
export const FOUNDER_PRICE_USD = 44.99 + FOUNDER_BOT_USD; // Pro + bot = 54.99
// Equivalente en pesos (Mercado Pago): Pro MXN + bot. Ajustable.
export const FOUNDER_BOT_MXN = 200;
export const FOUNDER_PRICE_MXN = 899 + FOUNDER_BOT_MXN; // Pro MXN + bot = 1099

// ---------------------------------------------------------------------------
// Capacidades por plan. Cada función "premium/pro" está protegida con una de
// estas capacidades; el menú y las rutas revisan `planHas()` para mostrarla o
// no. Así el plan Inicio NO ve las funciones de Pro/Premium.
// ---------------------------------------------------------------------------
export type PlanCapability =
  | 'whitelabel' // marca y colores propios
  | 'rewards' // gamificación y recompensas
  | 'services' // servicios opcionales
  | 'reports' // reportes de ingresos y asistencia
  | 'reportsAdvanced' // reportes avanzados
  | 'whatsapp' // agente de WhatsApp con IA
  | 'multiBranch' // multi-sucursal (varias sedes bajo una cuenta)
  | 'store' // punto de venta e inventario de productos
  | 'publicInfo'; // página informativa pública (QR/link)

export const PLAN_CAPABILITIES: Record<PlanId, PlanCapability[]> = {
  // Inicio: lo esencial para operar (calendario, CRM, recordatorios, cobros).
  inicio: [],
  // Pro: marca propia, recompensas, servicios, reportes, tienda y página pública.
  pro: ['whitelabel', 'rewards', 'services', 'reports', 'store', 'publicInfo'],
  // Premium: todo lo de Pro + WhatsApp IA, reportes avanzados, multi-sucursal.
  premium: ['whitelabel', 'rewards', 'services', 'reports', 'reportsAdvanced', 'whatsapp', 'multiBranch', 'store', 'publicInfo'],
};

// Multi-sucursal (plan Premium): la 1ª sucursal va incluida en el precio del
// plan; cada sucursal ADICIONAL creada suma un monto fijo al cobro mensual.
// Precio "piso" fijo (sin descuento por volumen) porque el costo del bot de
// WhatsApp escala por sede. En Fundador: base Fundador + mismo costo por extra.
export const BRANCH_EXTRA_MXN = 990; // por sucursal adicional (MXN / mes)
export const BRANCH_EXTRA_USD = 49; // equivalente aproximado en USD (Stripe)
// Cobro mensual total según número de sucursales dadas de alta (n >= 1).
export const branchExtraCount = (branches: number): number => Math.max(0, (branches || 1) - 1);
export const branchAddonMxn = (branches: number): number => branchExtraCount(branches) * BRANCH_EXTRA_MXN;
export const branchAddonUsd = (branches: number): number => branchExtraCount(branches) * BRANCH_EXTRA_USD;

// ¿El plan incluye la capacidad? (por defecto asume el plan más limitado)
export function planHas(plan: PlanId | undefined | null, cap: PlanCapability): boolean {
  return PLAN_CAPABILITIES[plan ?? 'inicio']?.includes(cap) ?? false;
}

export const PLANS: Plan[] = [
  {
    id: 'inicio',
    name: 'Inicio',
    priceUsd: 24.99,
    priceUsdYear: 249,
    priceMxn: 499,
    priceMxnYear: 4990,
    tagline: 'Para estudios, gimnasios y mixtos que empiezan',
    features: [
      'Estudio, gimnasio o mixto',
      'Hasta 50 alumnos activos · hasta 3 coaches',
      'Calendario, reservas y control de acceso (check-in)',
      'Membresías y paquetes con vencimiento y planes en cola',
      'CRM: alta manual de miembros, pagos y asistencia',
      'Avisos automáticos de vencimiento (push)',
      'Cobros en línea con Stripe y Mercado Pago',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    priceUsd: 44.99,
    priceUsdYear: 449,
    priceMxn: 899,
    priceMxnYear: 8990,
    tagline: 'El favorito de los negocios en marcha',
    features: [
      'Todo lo del plan Inicio',
      'Alumnos ilimitados · hasta 8 coaches',
      'White-label: tu marca en TODA la app (colores, tipografía y logo)',
      'Tienda para alumnos y coaches: apartar o pagar en línea',
      'Coaches externos (traen a sus propios alumnos)',
      'Gamificación y recompensas · servicios opcionales',
      'Reportes de ingresos y asistencia',
      'Página pública informativa (QR)',
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    priceUsd: 84.99,
    priceUsdYear: 799,
    priceMxn: 1699,
    priceMxnYear: 16990,
    tagline: 'Para negocios en pleno crecimiento',
    highlight: true,
    features: [
      'Todo lo del plan Pro',
      'Coaches ilimitados',
      'Agente de WhatsApp con IA',
      'Multi-sucursal con gerente por sede (login propio)',
      '1ª sede incluida · +$990 MXN por sede adicional',
      'Reportes avanzados',
      'Soporte prioritario',
    ],
  },
];

export const getPlan = (id: PlanId): Plan =>
  PLANS.find((p) => p.id === id) ?? PLANS[1];
