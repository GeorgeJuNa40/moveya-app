// ============================================================================
// Move yA — Periodos de cobro de membresías (cobros flexibles)
// ----------------------------------------------------------------------------
// El gym elige cómo cobra cada membresía de acceso. Aquí viven las etiquetas,
// la vigencia en días de cada periodo y los helpers para mostrarlo bonito.
// ============================================================================
import type { BillingPeriod, Package } from './types';

// Vigencia (días) que da cada periodo.
export const PERIOD_DAYS: Record<BillingPeriod, number> = {
  day: 1,
  week: 7,
  biweekly: 15,
  month: 30,
  quarter: 90,
};

// Nombre visible del periodo.
export const PERIOD_LABEL: Record<BillingPeriod, string> = {
  day: 'Día suelto',
  week: 'Semanal',
  biweekly: 'Quincenal',
  month: 'Mensual',
  quarter: 'Trimestral',
};

// Sufijo corto para el precio (ej. "$500 / mes").
export const PERIOD_SUFFIX: Record<BillingPeriod, string> = {
  day: '/ día',
  week: '/ semana',
  biweekly: '/ quincena',
  month: '/ mes',
  quarter: '/ trimestre',
};

// Orden en que se muestran los botones del selector.
export const PERIOD_ORDER: BillingPeriod[] = ['day', 'week', 'biweekly', 'month', 'quarter'];

// Periodo de un paquete de acceso: usa el guardado, o lo infiere de la vigencia
// (para membresías creadas antes de tener el campo `period`).
export function periodOf(p: Package): BillingPeriod {
  if (p.period) return p.period;
  const d = p.validityDays;
  if (d <= 1) return 'day';
  if (d <= 8) return 'week';
  if (d <= 20) return 'biweekly';
  if (d <= 45) return 'month';
  return 'quarter';
}
