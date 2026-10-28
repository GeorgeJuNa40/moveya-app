import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import {
  FOUNDER_PRICE_USD, FOUNDER_PRICE_MXN, getPlan, type Currency,
} from '../../lib/plans';

// Moneda automática: México → pesos (MXN); otros → USD.
function detectCurrency(): Currency {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const mx = ['Mexico_City', 'Monterrey', 'Tijuana', 'Merida', 'Cancun', 'Chihuahua',
      'Hermosillo', 'Mazatlan', 'Matamoros', 'Ojinaga', 'Bahia_Banderas', 'Ciudad_Juarez'];
    if (mx.some((z) => tz.includes(z))) return 'MXN';
    const langs = [navigator.language, ...(navigator.languages ?? [])].join(',').toLowerCase();
    if (langs.includes('-mx')) return 'MXN';
  } catch { /* sin acceso: usa USD */ }
  return 'USD';
}

const money = (n: number, c: Currency) =>
  c === 'MXN' ? `$${Math.round(n).toLocaleString('es-MX')}` : `$${n.toFixed(2)}`;

// El registro marcado como fundador (abre modo "crear estudio" + flag fundador).
const REGISTRO_FUNDADOR = '/entrar?nuevo=1&fundador=1';

const BENEFITS = [
  { ic: '♾️', t: 'Precio de por vida', d: 'Tu mensualidad de fundador nunca sube, aunque suban los precios al público.' },
  { ic: '✦', t: 'Todo Premium incluido', d: 'White-label completo (toda la app con tu marca), membresías con planes en cola y avisos automáticos, tienda con pago en línea, multi-sucursal con gerentes, reportes avanzados y más.' },
  { ic: '✆', t: 'Bot de WhatsApp con IA', d: 'Responde dudas y agenda por ti, incluido sin costo extra. Normalmente es un add-on.' },
  { ic: '★', t: 'Trato preferente', d: 'Soporte prioritario y voz directa en lo que construimos a continuación.' },
];

const STEPS = [
  { n: '1', t: 'Aparta tu lugar', d: 'Regístrate por este link exclusivo. Quedas marcado como fundador.' },
  { n: '2', t: 'Pruébalo 14 días', d: 'Puedes empezar con la prueba de bienvenida o entrar directo como fundador.' },
  { n: '3', t: 'Precio congelado', d: 'Te quedas con el precio de fundador para siempre. Cancela cuando quieras.' },
];

export default function FounderLanding() {
  const [currency] = useState<Currency>(detectCurrency);
  const founderPrice = currency === 'MXN' ? FOUNDER_PRICE_MXN : FOUNDER_PRICE_USD;
  const premium = getPlan('premium');
  const premiumPrice = currency === 'MXN' ? premium.priceMxn : premium.priceUsd;

  const [founders, setFounders] = useState<{ taken: number; limit: number } | null>(null);
  useEffect(() => {
    supabase.rpc('founders_status').then(
      ({ data }) => { if (data) setFounders({ taken: Number(data.taken) || 0, limit: Number(data.limit) || 10 }); },
      () => { /* opcional */ },
    );
  }, []);
  const remaining = founders ? Math.max(0, founders.limit - founders.taken) : null;
  const full = founders ? founders.taken >= founders.limit : false;

  return (
    <div className="min-h-screen bg-cream-light text-ink">
      {/* Barra superior */}
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <span className="text-lg font-black tracking-tight text-brand">Move yA</span>
        <span className="rounded-full bg-mint-soft/40 px-3 py-1 text-xs font-semibold text-brand">
          Programa Fundador
        </span>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-5 pt-6 text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-ink px-3 py-1 text-xs font-semibold text-cream">
          <span className="h-2 w-2 rounded-full bg-mint" /> Por invitación · Solo 10 lugares
        </span>
        <h1 className="mt-5 text-4xl font-black leading-tight tracking-tight sm:text-5xl">
          Sé uno de los <span className="text-brand">10 fundadores</span> de Move yA
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-ink-soft">
          El sistema todo-en-uno para tu estudio, gimnasio o mixto: reservas, control de acceso, membresías
          con vencimiento, cobros, tienda y WhatsApp con IA — con tu propia marca. Como fundador, lo tienes
          <strong> completo</strong> a un precio especial <strong>de por vida</strong>.
        </p>

        {/* Escasez */}
        {remaining !== null && !full && (
          <p className="mt-5 inline-block rounded-full bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-800">
            🔥 Quedan {remaining} de {founders!.limit} lugares
          </p>
        )}
        {full && (
          <p className="mt-5 inline-block rounded-full bg-cream-dark px-4 py-2 text-sm font-semibold text-ink-soft">
            El cupo de fundadores está completo
          </p>
        )}
      </section>

      {/* Imagen de impacto */}
      <section className="mx-auto mt-10 max-w-3xl px-5">
        <img
          src="/landing/box-1.jpg"
          alt="Entrenamiento en gimnasio"
          loading="lazy"
          className="h-64 w-full rounded-3xl object-cover shadow-zen sm:h-80"
        />
      </section>

      {/* Oferta */}
      <section className="mx-auto mt-10 max-w-md px-5">
        <div className="overflow-hidden rounded-3xl shadow-zen">
          <div className="p-7 text-center text-cream" style={{ background: 'linear-gradient(135deg, #4A5D55, #3A4A43)' }}>
            <p className="text-xs font-semibold uppercase tracking-wide opacity-80">Precio Fundador</p>
            <p className="mt-2 text-5xl font-black">{money(founderPrice, currency)}<span className="text-xl font-medium opacity-80">/mes</span></p>
            <p className="mt-1 text-sm opacity-90">de por vida · incluye el Bot de WhatsApp</p>
            <p className="mt-3 text-sm line-through opacity-60">Premium normal {money(premiumPrice, currency)}/mes</p>
          </div>
          <div className="space-y-3 bg-white p-6">
            {BENEFITS.map((b) => (
              <div key={b.t} className="flex gap-3">
                <span className="text-xl">{b.ic}</span>
                <div>
                  <p className="font-semibold text-ink">{b.t}</p>
                  <p className="text-sm text-ink-soft">{b.d}</p>
                </div>
              </div>
            ))}
            {!full ? (
              <Link
                to={REGISTRO_FUNDADOR}
                className="mt-2 block rounded-full bg-brand px-6 py-3.5 text-center font-semibold text-cream shadow-soft transition hover:opacity-90"
              >
                Apartar mi lugar de Fundador
              </Link>
            ) : (
              <Link
                to="/entrar?nuevo=1"
                className="mt-2 block rounded-full border border-cream-dark px-6 py-3.5 text-center font-semibold text-ink-soft"
              >
                Ver los planes normales
              </Link>
            )}
            <p className="text-center text-xs text-ink-faint">Sin permanencia · cancela cuando quieras</p>
          </div>
        </div>
      </section>

      {/* Cómo funciona */}
      <section className="mx-auto mt-14 max-w-3xl px-5">
        <h2 className="text-center text-2xl font-bold">Cómo funciona</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-2xl bg-white p-5 shadow-soft">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-brand text-cream font-bold">{s.n}</div>
              <p className="mt-3 font-semibold text-ink">{s.t}</p>
              <p className="mt-1 text-sm text-ink-soft">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Para todas las disciplinas */}
      <section className="mx-auto mt-14 max-w-4xl px-5">
        <div className="grid grid-cols-3 gap-3">
          <img src="/landing/disc-2.jpg" alt="Clase de Pilates" loading="lazy" className="aspect-[3/2] w-full rounded-2xl object-cover" />
          <img src="/landing/box-2.jpg" alt="Clase de boxeo" loading="lazy" className="aspect-[3/2] w-full rounded-2xl object-cover" />
          <img src="/landing/box-3.jpg" alt="Gimnasio boutique" loading="lazy" className="aspect-[3/2] w-full rounded-2xl object-cover" />
        </div>
      </section>

      {/* CTA final */}
      <section className="mx-auto mt-14 max-w-3xl px-5 pb-16 text-center">
        <h2 className="text-2xl font-bold">Tu lugar no está garantizado</h2>
        <p className="mx-auto mt-2 max-w-lg text-ink-soft">
          Son solo 10 fundadores con este precio de por vida. Cuando se llenen, la oferta se cierra.
        </p>
        {!full && (
          <Link
            to={REGISTRO_FUNDADOR}
            className="mt-6 inline-block rounded-full bg-brand px-8 py-4 font-semibold text-cream shadow-soft transition hover:opacity-90"
          >
            Quiero ser Fundador{remaining !== null ? ` · quedan ${remaining}` : ''}
          </Link>
        )}
        <p className="mt-8 text-xs text-ink-faint">Move yA · Programa Fundador por invitación</p>
      </section>
    </div>
  );
}
