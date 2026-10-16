// Helpers de formato de fecha/hora en español.

const DAY_FMT = new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
const TIME_FMT = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' });
const FULL_DAY_FMT = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
// Fecha corta con año (p. ej. "14 nov 2026") — para mostrar vencimientos exactos.
const DATE_FMT = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });

export const fmtDay = (iso: string) => DAY_FMT.format(new Date(iso));
export const fmtTime = (iso: string) => TIME_FMT.format(new Date(iso));
export const fmtFullDay = (iso: string) => FULL_DAY_FMT.format(new Date(iso));
// Fecha exacta de vencimiento (con año), para "vence el 14 nov 2026".
export const fmtDate = (iso: string) => DATE_FMT.format(new Date(iso));

export const dayKey = (iso: string) => new Date(iso).toISOString().slice(0, 10);

// Moneda activa del estudio (MXN, USD, EUR, …). La fija StoreProvider según el
// estudio en sesión; por defecto USD. Así los precios se muestran en la moneda
// local sin tener que tocar cada pantalla.
let activeCurrency = 'USD';
export function setActiveCurrency(code: string | undefined) {
  activeCurrency = code || 'USD';
}
// Símbolo por moneda (la mayoría de LATAM usa $; el euro y la libra difieren).
const CURRENCY_SYMBOLS: Record<string, string> = { EUR: '€', GBP: '£' };
const symbolFor = (code: string) => CURRENCY_SYMBOLS[code] ?? '$';
export const money = (n: number, code: string = activeCurrency) =>
  `${symbolFor(code)}${n.toLocaleString('es-MX')} ${code}`;
// Precio en la moneda local del estudio (antes siempre USD).
export const usd = (n: number) => money(n);

export function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}
