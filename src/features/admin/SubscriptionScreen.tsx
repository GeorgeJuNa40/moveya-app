import { useEffect, useState } from 'react';
import { useStore, isSubscriptionActive } from '../../lib/store';
import { supabase } from '../../lib/supabase';
import { PageHeader, Card, Button, Badge } from '../../components/ui';
import { daysUntil } from '../../lib/format';
import {
  PLANS, PROMO_PRICE, PROMO_PRICE_MXN, PROMO_TRIAL_DAYS, getPlan,
  FOUNDER_PRICE_USD, FOUNDER_PRICE_MXN,
  planPriceCur, annualPerMonthCur, annualSavingsCur, CURRENCY_SUFFIX,
  type BillingInterval, type Currency,
} from '../../lib/plans';
import { startCheckout, type PayProvider } from '../../lib/payments';
import type { PlanId } from '../../lib/types';

// Formato de precio: USD con 2 decimales; MXN en pesos enteros.
const money = (n: number, c: Currency = 'USD') =>
  c === 'MXN' ? `$${Math.round(n).toLocaleString('es-MX')}` : `$${n.toFixed(2)}`;

// Suscripción SaaS: 3 planes (Inicio $24.99, Pro $44.99, Premium $84.99) con
// promo de lanzamiento ($1 · 14 días con acceso Premium) y programa Fundador
// (primeros 10). El cobro del plan se hace en la página segura de Stripe.
export default function SubscriptionScreen() {
  const { currentStudio } = useStore();
  const [busy, setBusy] = useState(false);
  const [billing, setBilling] = useState<BillingInterval>('monthly');
  // Proveedor de cobro: Stripe (USD) o Mercado Pago (MXN). El estudio elige.
  const [provider, setProvider] = useState<PayProvider>('stripe');
  const currency: Currency = provider === 'mercadopago' ? 'MXN' : 'USD';
  const promo = provider === 'mercadopago' ? PROMO_PRICE_MXN : PROMO_PRICE;
  const sub = currentStudio!.subscription;
  // ¿Ya usó la promo de bienvenida? (el webhook guarda promoPaymentId/promoSessionId)
  const usedPromo = !!(sub.promoPaymentId || sub.promoSessionId);
  const founderPrice = provider === 'mercadopago' ? FOUNDER_PRICE_MXN : FOUNDER_PRICE_USD;

  // Programa Fundador: solo visible para estudios invitados por el link privado,
  // mientras no esté activo y queden lugares (tope de 10 en el servidor).
  const [founders, setFounders] = useState<{ taken: number; limit: number } | null>(null);
  useEffect(() => {
    supabase.rpc('founders_status').then(
      ({ data }) => { if (data) setFounders({ taken: Number(data.taken) || 0, limit: Number(data.limit) || 10 }); },
      () => { /* opcional */ },
    );
  }, []);
  const founderOpen = founders ? founders.taken < founders.limit : true;

  // Elegir/cambiar plan → pago recurrente con el proveedor elegido (mensual/anual).
  const choosePlan = async (plan: PlanId) => {
    setBusy(true);
    const ok = await startCheckout(provider, { kind: 'subscription', plan, billing });
    if (!ok) setBusy(false); // si funciona, redirige a la página de pago
  };

  // Programa Fundador: Premium + bot a precio especial de por vida (un cargo).
  const chooseFounder = async () => {
    setBusy(true);
    const ok = await startCheckout(provider, { kind: 'subscription', plan: 'founder' });
    if (!ok) setBusy(false);
  };

  // Promo de bienvenida: cobro ÚNICO ($1/$20) en la pasarela. Al confirmarse el
  // pago, el webhook abre 14 días de acceso Premium. No activa nada localmente.
  const startPromo = async () => {
    setBusy(true);
    const ok = await startCheckout(provider, { kind: 'promo' });
    if (!ok) setBusy(false); // si funciona, redirige a la página de pago
  };

  const trialEndsAt = sub.trialEndsAt ?? sub.currentPeriodEnd;
  const active = isSubscriptionActive(currentStudio);
  const inTrial = sub.status === 'TRIALING' && daysUntil(trialEndsAt) > 0;
  // Oferta Fundador: solo invitados, sin suscripción activa y con lugares libres.
  const showFounder = !!sub.founderInvited && !active && founderOpen;
  const trialDaysLeft = Math.max(0, daysUntil(trialEndsAt));
  const daysLeft = Math.max(0, daysUntil(sub.currentPeriodEnd));
  const currentPlanId: PlanId = sub.plan ?? 'pro';
  const currentPlan = getPlan(currentPlanId);
  const currentInterval: BillingInterval = sub.billingInterval ?? 'monthly';
  const currentCurrency: Currency = sub.provider === 'mercadopago' ? 'MXN' : 'USD';

  // Estado del encabezado según la situación de la suscripción.
  const statusBadge = inTrial ? 'En prueba' : active ? 'Activa' : 'Requiere pago';
  const statusTone = active ? 'success' : 'danger';

  return (
    <>
      <PageHeader title="Suscripción" subtitle="Elige el plan Move yA ideal para tu estudio" />

      {/* Estado actual de la suscripción */}
      <Card className="mb-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase text-ink-faint">Tu plan</p>
            <p className="text-2xl font-bold text-ink">
              Move yA · {currentPlan.name}
              {inTrial && <span className="text-ink-faint text-base font-normal"> (en prueba)</span>}
            </p>
          </div>
          <Badge tone={statusTone as 'success' | 'danger'}>{statusBadge}</Badge>
        </div>

        {inTrial ? (
          <p className="mt-3 text-sm text-ink-soft">
            Estás en tu prueba de lanzamiento con <strong>acceso Premium completo</strong> — conoce
            todas las funciones. Te quedan{' '}
            <strong>{trialDaysLeft} día{trialDaysLeft === 1 ? '' : 's'}</strong>. Cuando termine,
            elige abajo el plan que quieras conservar.
          </p>
        ) : active ? (
          <p className="mt-3 text-sm text-ink-soft">
            Plan <strong>{currentPlan.name}</strong> ·{' '}
            {money(planPriceCur(currentPlan, currentCurrency, currentInterval), currentCurrency)}/{currentInterval === 'annual' ? 'año' : 'mes'}. Próxima
            renovación en <strong>{daysLeft} día{daysLeft === 1 ? '' : 's'}</strong>.
          </p>
        ) : (
          <p className="mt-3 text-sm text-ink-soft">
            Tu acceso al panel está <strong>limitado al inicio</strong> hasta que registres tu pago.
            Aprovecha la oferta de bienvenida o elige un plan.
          </p>
        )}
      </Card>

      {/* Oferta de bienvenida: $1 por 14 días (solo si aún no está activa) */}
      {!active && !inTrial && (
        <div
          className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5 text-cream shadow-zen"
          style={{ background: 'linear-gradient(135deg, #4A5D55, #3A4A43)' }}
        >
          <div>
            <p className="text-xs uppercase tracking-wide opacity-80">Oferta de bienvenida</p>
            <p className="mt-1 text-xl font-bold">
              Prueba por {money(promo, currency)} · {PROMO_TRIAL_DAYS} días de Premium completo
            </p>
            <p className="text-sm opacity-90">
              Pagas una sola vez y usas <strong>TODO Premium</strong> durante {PROMO_TRIAL_DAYS} días.
              Al terminar, eliges tu plan.
            </p>
          </div>
          <Button variant="secondary" disabled={busy} onClick={startPromo}>
            {busy ? 'Redirigiendo…' : `Probar por ${money(promo, currency)}`}
          </Button>
        </div>
      )}

      {/* Programa Fundador (solo para invitados por el link privado) */}
      {showFounder && (
        <Card className="mb-6 overflow-hidden p-0">
          <div className="p-6" style={{ background: 'linear-gradient(135deg, #88B8B7, #5F9695)' }}>
            <p className="text-xs font-semibold uppercase tracking-wide text-white/90">✦ Programa Fundador · por invitación</p>
            <p className="mt-1 text-2xl font-black text-white">
              Premium completo + Bot de WhatsApp · {money(founderPrice, currency)}/mes
            </p>
            <p className="mt-1 text-sm text-white/90">
              Precio especial <strong>de por vida</strong> para nuestros primeros estudios.
              {founders && <> Quedan <strong>{Math.max(0, founders.limit - founders.taken)}</strong> lugares.</>}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 p-5">
            <p className="text-sm text-ink-soft">
              Puedes <strong>probar por {money(promo, currency)}</strong> primero (14 días) o unirte directo como Fundador.
            </p>
            <Button disabled={busy} onClick={chooseFounder}>
              {busy ? 'Redirigiendo…' : `Unirme como Fundador · ${money(founderPrice, currency)}/mes`}
            </Button>
          </div>
        </Card>
      )}

      {/* Proveedor de cobro: Stripe (USD) o Mercado Pago (MXN) */}
      <div className="mb-4 flex justify-center">
        <div className="inline-flex gap-1 rounded-full border border-cream-dark bg-cream-dark/30 p-1">
          <button
            type="button"
            onClick={() => setProvider('stripe')}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              provider === 'stripe' ? 'bg-white text-brand shadow-zen' : 'text-ink-faint'
            }`}
          >
            Tarjeta internacional · USD
          </button>
          <button
            type="button"
            onClick={() => setProvider('mercadopago')}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              provider === 'mercadopago' ? 'bg-white text-brand shadow-zen' : 'text-ink-faint'
            }`}
          >
            Mercado Pago · MXN
          </button>
        </div>
      </div>

      {/* Periodo de facturación: mensual o anual (2 meses gratis) */}
      <div className="mb-4 flex justify-center">
        <div className="inline-flex gap-1 rounded-full border border-cream-dark bg-cream-dark/30 p-1">
          <button
            type="button"
            onClick={() => setBilling('monthly')}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              billing === 'monthly' ? 'bg-white text-brand shadow-zen' : 'text-ink-faint'
            }`}
          >
            Mensual
          </button>
          <button
            type="button"
            onClick={() => setBilling('annual')}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
              billing === 'annual' ? 'bg-white text-brand shadow-zen' : 'text-ink-faint'
            }`}
          >
            Anual
            <span className="rounded-full bg-mint px-2 py-0.5 text-[10px] font-bold uppercase text-brand">
              2 meses gratis
            </span>
          </button>
        </div>
      </div>

      {/* Los 3 planes */}
      <div className="grid gap-6 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const isCurrent = active && plan.id === currentPlanId && billing === currentInterval;
          return (
            <Card
              key={plan.id}
              className={`relative flex flex-col p-6 ${
                plan.highlight ? 'ring-2 ring-brand' : ''
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-cream">
                  Más popular
                </span>
              )}

              <h3 className="text-lg font-bold text-ink">{plan.name}</h3>
              <p className="mt-1 text-sm text-ink-faint">{plan.tagline}</p>

              <div className="mt-4 flex items-end gap-1">
                <span className="text-4xl font-black text-brand">{money(planPriceCur(plan, currency, billing), currency)}</span>
                <span className="mb-1 text-ink-faint">{CURRENCY_SUFFIX[currency]} / {billing === 'annual' ? 'año' : 'mes'}</span>
              </div>
              {billing === 'annual' && (
                <p className="mt-1 text-xs text-ink-faint">
                  ≈ {money(annualPerMonthCur(plan, currency), currency)}/mes · ahorras {money(annualSavingsCur(plan, currency), currency)} al año
                </p>
              )}

              <ul className="mt-5 flex-1 space-y-2 text-sm text-ink-soft">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-brand">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                {isCurrent ? (
                  <Button className="w-full" variant="secondary" disabled>
                    Plan actual
                  </Button>
                ) : active ? (
                  <Button
                    className="w-full"
                    variant={plan.highlight ? 'primary' : 'secondary'}
                    disabled={busy}
                    onClick={() => choosePlan(plan.id)}
                  >
                    {busy ? 'Redirigiendo…' : 'Cambiar a este plan'}
                  </Button>
                ) : usedPromo ? (
                  // Ya probó la promo: ahora elige y paga su plan (cobro recurrente).
                  <Button
                    className="w-full"
                    variant={plan.highlight ? 'primary' : 'secondary'}
                    disabled={busy}
                    onClick={() => choosePlan(plan.id)}
                  >
                    {busy ? 'Redirigiendo…' : `Suscribirme a ${plan.name}`}
                  </Button>
                ) : (
                  // Estudio nuevo: la única acción es la prueba Premium por $20.
                  <Button
                    className="w-full"
                    variant={plan.highlight ? 'primary' : 'secondary'}
                    disabled={busy}
                    onClick={startPromo}
                  >
                    {busy ? 'Redirigiendo…' : `Probar Premium por ${money(promo, currency)} · ${PROMO_TRIAL_DAYS} días`}
                  </Button>
                )}
                {!active && !isCurrent && (
                  <p className="mt-2 text-center text-xs text-ink-faint">
                    {usedPromo
                      ? `${money(planPriceCur(plan, currency, billing), currency)}/${billing === 'annual' ? 'año' : 'mes'} · cancela cuando quieras`
                      : `${PROMO_TRIAL_DAYS} días de Premium completo. Al terminar eliges tu plan.`}
                  </p>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Cómo funciona */}
      <Card className="mt-6 p-6">
        <h2 className="mb-3 font-semibold text-ink">¿Cómo funciona?</h2>
        <ol className="space-y-3 text-sm text-ink-soft">
          <li>
            <strong className="text-ink">1. Prueba por {money(promo, currency)}.</strong> Pagas una sola
            vez y activas TODO el plan Premium durante {PROMO_TRIAL_DAYS} días.
          </li>
          <li>
            <strong className="text-ink">2. Explora sin límites.</strong> Usa todas las funciones del
            panel durante tu prueba, sin compromiso.
          </li>
          <li>
            <strong className="text-ink">3. Elige tu plan.</strong> Al terminar los {PROMO_TRIAL_DAYS} días
            eliges Inicio, Pro o Premium. Puedes cambiar de plan o cancelar cuando quieras.
          </li>
        </ol>
        <p className="mt-4 text-sm text-ink-faint">
          🔒 El cobro se procesa en la página segura de Stripe o Mercado Pago; tu acceso se activa
          automáticamente al confirmarse el pago.
        </p>
      </Card>
    </>
  );
}
