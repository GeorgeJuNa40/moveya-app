import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../lib/store';
import { Card, StatCard, Badge } from '../../components/ui';
import { notifySuccess, notifyError } from '../../lib/notify';
import {
  fetchMoveyaOverview, monthlyUsd, trialExpired, type MoveyaStudioRow,
  fetchMoveyaPayments, type MoveyaPayment,
  fetchAllPlatformProducts, savePlatformProduct, deletePlatformProduct, type PlatformProductRow,
  fetchLeads, saveLead, deleteLead, type MoveyaLead, type LeadStatus, LEAD_STATUSES, LEAD_STATUS_LABEL,
  fetchWaConfig, saveWaConfig, DEFAULT_SALES_KB, type MoveyaWaConfig,
  fetchWaConvos, fetchWaThread, markWaRead, setWaMode, sendWaReply,
  type WaConversation, type WaMessage,
  fetchEmailsRecent, sendEmailCampaign, brandedEmailHtml, DEFAULT_EMAIL_FROM, DEFAULT_EMAIL_TEMPLATES, type MoveyaEmail,
  fetchSequenceConfig, saveSequenceConfig, fetchSequenceStats, type SequenceStep, type StepKind,
  type TriggerSource, TRIGGER_SOURCES, TRIGGER_SOURCE_LABEL,
  fetchContent, saveContent, deleteContent, uploadContentImage, removeContentImage,
  CONTENT_MAX_IMG_MB, type ContentPost, type ContentStatus, type ContentChannel, type ContentMedia,
  CONTENT_STATUSES, CONTENT_STATUS_LABEL, CONTENT_CHANNELS, CONTENT_CHANNEL_LABEL,
} from '../../lib/platform';
import { FOUNDER_CODE } from '../../lib/plans';

// Panel de CREADOR (dueño de Move yA). Página independiente, oculta y protegida
// (solo platform_owner). Dos pestañas: Resumen del negocio y gestión del
// catálogo "Recomendados Move yA".
const usd = (n: number) => `$${n.toFixed(2)}`;
const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
// Fecha + hora (para demos agendadas): "mié 5 nov · 18:00".
const fmtDateTime = (s: string | null) =>
  s ? new Date(s).toLocaleString('es-MX', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const PLAN_LABEL: Record<string, string> = { inicio: 'Inicio', pro: 'Pro', premium: 'Premium' };
const inp = 'w-full rounded-xl border border-cream-dark bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 ring-brand';
const FOUNDER_CAP = 10;

type Tab = 'resumen' | 'pagos' | 'crm' | 'whatsapp' | 'email' | 'contenido' | 'productos';

const NAV: [Tab, string, string][] = [
  ['resumen', 'Resumen', '📊'],
  ['pagos', 'Pagos', '💳'],
  ['crm', 'CRM', '🗂️'],
  ['whatsapp', 'WhatsApp', '💬'],
  ['email', 'Email', '✉️'],
  ['contenido', 'Contenido', '📅'],
  ['productos', 'Productos', '🛍️'],
];

function NavList({ tab, onSelect }: { tab: Tab; onSelect: (t: Tab) => void }) {
  return (
    <div className="space-y-1">
      {NAV.map(([k, label, icon]) => (
        <button
          key={k}
          onClick={() => onSelect(k)}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
            tab === k ? 'bg-brand text-cream' : 'text-ink-soft hover:bg-cream-dark/40'
          }`}
        >
          <span className="text-base">{icon}</span>
          {label}
        </button>
      ))}
    </div>
  );
}

export default function MoveyaPanel() {
  const [tab, setTab] = useState<Tab>('resumen');
  const [menuOpen, setMenuOpen] = useState(false);
  const { logout } = useStore();
  const select = (t: Tab) => { setTab(t); setMenuOpen(false); };

  return (
    <div className="min-h-screen bg-cream">
      {/* Barra superior (siempre visible) */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-cream-dark bg-cream/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <button onClick={() => setMenuOpen(true)} aria-label="Abrir menú" className="grid h-9 w-9 place-items-center rounded-lg text-lg text-ink hover:bg-cream-dark/40 lg:hidden">☰</button>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-ink-faint">Panel de creador</p>
            <h1 className="text-base font-bold leading-tight text-ink">Move yA · Negocio</h1>
          </div>
        </div>
        <button onClick={() => logout()} className="rounded-full border border-cream-dark px-4 py-2 text-sm font-semibold text-ink-soft hover:bg-cream-dark/40">
          Salir
        </button>
      </header>

      <div className="lg:flex">
        {/* Barra lateral (escritorio) */}
        <nav className="hidden w-56 shrink-0 border-r border-cream-dark px-3 py-4 lg:block">
          <div className="sticky top-20">
            <NavList tab={tab} onSelect={select} />
          </div>
        </nav>

        {/* Cajón lateral (móvil) */}
        {menuOpen && (
          <div className="fixed inset-0 z-30 lg:hidden">
            <div className="absolute inset-0 bg-black/30" onClick={() => setMenuOpen(false)} />
            <nav className="absolute left-0 top-0 h-full w-64 bg-cream p-4 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-bold text-ink">Menú</span>
                <button onClick={() => setMenuOpen(false)} aria-label="Cerrar menú" className="grid h-8 w-8 place-items-center rounded-lg text-ink hover:bg-cream-dark/40">✕</button>
              </div>
              <NavList tab={tab} onSelect={select} />
            </nav>
          </div>
        )}

        <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6">
          {tab === 'resumen' ? <ResumenTab /> : tab === 'pagos' ? <PagosTab /> : tab === 'crm' ? <CrmTab /> : tab === 'whatsapp' ? <WhatsAppTab /> : tab === 'email' ? <EmailTab /> : tab === 'contenido' ? <ContenidoTab /> : <ProductosTab />}
        </main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pestaña RESUMEN (negocio)
// ---------------------------------------------------------------------------
function estadoBadge(r: MoveyaStudioRow) {
  if (r.status === 'ACTIVE') return <Badge tone="success">Pagando</Badge>;
  if (r.status === 'TRIALING') return trialExpired(r)
    ? <Badge tone="danger">Prueba vencida</Badge>
    : <Badge tone="warning">En prueba</Badge>;
  if (r.status === 'PAST_DUE') return <Badge tone="danger">Vencido</Badge>;
  if (r.status === 'CANCELED') return <Badge tone="neutral">Cancelado</Badge>;
  return <Badge tone="neutral">—</Badge>;
}

// --- Mini-gráficos (paleta de marca Move yA, sin librerías) ---
function BarRow({ label, value, pct, tone = 'brand' }: { label: string; value: string; pct: number; tone?: 'brand' | 'mint' }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className="truncate text-ink-soft">{label}</span>
        <span className="shrink-0 font-semibold text-ink">{value}</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-cream-dark/40">
        <div className={`h-full rounded-full ${tone === 'mint' ? 'bg-mint' : 'bg-brand'}`} style={{ width: `${Math.max(3, Math.min(100, pct))}%` }} />
      </div>
    </div>
  );
}

function Donut({ segments, centerTop, centerBottom }: { segments: { value: number; color: string }[]; centerTop: string; centerBottom: string }) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  const R = 42, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg viewBox="0 0 100 100" className="h-32 w-32 -rotate-90">
        <circle cx="50" cy="50" r={R} fill="none" stroke="#e7e2d8" strokeWidth="11" />
        {segments.filter((s) => s.value > 0).map((s, i) => {
          const len = (s.value / total) * C;
          const el = <circle key={i} cx="50" cy="50" r={R} fill="none" stroke={s.color} strokeWidth="11" strokeDasharray={`${Math.max(0, len - 1.5)} ${C - Math.max(0, len - 1.5)}`} strokeDashoffset={-offset} />;
          offset += len;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-ink">{centerTop}</span>
        <span className="text-[10px] uppercase tracking-wide text-ink-faint">{centerBottom}</span>
      </div>
    </div>
  );
}

function ResumenTab() {
  const [rows, setRows] = useState<MoveyaStudioRow[]>([]);
  const [pays, setPays] = useState<MoveyaPayment[]>([]);
  const [leads, setLeads] = useState<MoveyaLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  useEffect(() => {
    fetchMoveyaOverview()
      .then((r) => { setRows(r); if (!r.length) setErr(true); })
      .catch(() => setErr(true))
      .finally(() => setLoading(false));
    fetchMoveyaPayments(5).then(setPays).catch(() => {});
    fetchLeads().then(setLeads).catch(() => {});
  }, []);

  const m = useMemo(() => {
    const paying = rows.filter((r) => r.status === 'ACTIVE');
    const trialing = rows.filter((r) => r.status === 'TRIALING' && !trialExpired(r));
    const expired = rows.filter((r) => (r.status === 'TRIALING' && trialExpired(r)) || r.status === 'PAST_DUE' || r.status === 'CANCELED');
    const foundersUsed = paying.filter((r) => r.founder).length;
    const mrr = rows.reduce((a, r) => a + monthlyUsd(r), 0);

    const byPlan: Record<string, number> = {};
    for (const r of paying) {
      const label = r.founder ? 'Fundador' : r.plan ? PLAN_LABEL[r.plan] ?? r.plan : 'Sin plan';
      byPlan[label] = (byPlan[label] ?? 0) + monthlyUsd(r);
    }
    const planRows = Object.entries(byPlan).sort((a, b) => b[1] - a[1]);
    const planMax = Math.max(1, ...planRows.map(([, v]) => v));

    const leadsActive = leads.filter((l) => l.status !== 'perdido' && l.status !== 'pagando').length;
    const funnel = LEAD_STATUSES.map((s) => ({ s, n: leads.filter((l) => l.status === s).length }));
    const funnelMax = Math.max(1, ...funnel.map((x) => x.n));

    return {
      paying: paying.length, trialing: trialing.length, expired: expired.length,
      foundersUsed, mrr, arr: mrr * 12, planRows, planMax, leadsActive, funnel, funnelMax,
    };
  }, [rows, leads]);

  const ordered = useMemo(() => {
    const rank: Record<string, number> = { ACTIVE: 0, TRIALING: 1, PAST_DUE: 2, CANCELED: 3 };
    return [...rows].sort((a, b) => (rank[a.status ?? ''] ?? 9) - (rank[b.status ?? ''] ?? 9));
  }, [rows]);

  if (loading) return <p className="text-ink-faint">Cargando…</p>;
  if (err) return <Card className="p-6 text-center text-ink-soft">No se pudo cargar. Verifica que tu cuenta tenga acceso de creador.</Card>;

  const legend = [
    { label: 'Pagando', n: m.paying, color: '#2E7D53' },
    { label: 'En prueba', n: m.trialing, color: '#C98A2B' },
    { label: 'Vencidas', n: m.expired, color: '#B23B3B' },
  ];

  return (
    <>
      {/* Hero: ingreso recurrente */}
      <Card className="overflow-hidden p-0">
        <div className="p-5 text-cream" style={{ background: 'linear-gradient(135deg, #4A5D55 0%, #2f3b36 100%)' }}>
          <p className="text-xs uppercase tracking-wide text-cream/70">Ingreso mensual recurrente</p>
          <p className="mt-1 text-4xl font-bold">{usd(m.mrr)}</p>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span><span className="text-cream/70">ARR </span><b>{usd(m.arr)}</b></span>
            <span><span className="text-cream/70">Pagando </span><b>{m.paying}</b></span>
            <span><span className="text-cream/70">En prueba </span><b>{m.trialing}</b></span>
          </div>
        </div>
      </Card>

      {/* Chips */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Fundadores" value={`${m.foundersUsed}/${FOUNDER_CAP}`} hint={`Código ${FOUNDER_CODE}`} icon="⭐" />
        <StatCard label="Leads activos" value={m.leadsActive} hint="En el embudo" icon="🎯" />
        <StatCard label="Estudios" value={rows.length} hint={`${m.paying} pagando`} icon="🏠" />
        <StatCard label="En riesgo" value={m.expired} hint="Vencidos / impagos" icon="⚠️" />
      </div>

      {/* Estudios por estado (dona) + Ingresos por plan (barras) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">Estudios por estado</h2>
          <div className="flex items-center gap-4">
            <Donut
              segments={[{ value: m.paying, color: '#2E7D53' }, { value: m.trialing, color: '#C98A2B' }, { value: m.expired, color: '#B23B3B' }]}
              centerTop={String(rows.length)}
              centerBottom="estudios"
            />
            <ul className="space-y-2 text-sm">
              {legend.map((l) => (
                <li key={l.label} className="flex items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: l.color }} />
                  <span className="text-ink-soft">{l.label}</span>
                  <span className="font-semibold text-ink">{l.n}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">Ingresos por plan (mensual)</h2>
          {m.planRows.length === 0 ? (
            <p className="text-xs text-ink-faint">Aún no hay suscripciones pagando.</p>
          ) : (
            <div className="space-y-3">
              {m.planRows.map(([plan, total]) => (
                <BarRow key={plan} label={plan} value={`${usd(total)}/mes`} pct={(total / m.planMax) * 100} />
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Embudo de leads + Transacciones recientes */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">Embudo de leads</h2>
          {leads.length === 0 ? (
            <p className="text-xs text-ink-faint">Aún no hay leads. Agrégalos en la pestaña CRM.</p>
          ) : (
            <div className="space-y-3">
              {m.funnel.map(({ s, n }) => (
                <BarRow key={s} label={LEAD_STATUS_LABEL[s]} value={String(n)} pct={(n / m.funnelMax) * 100} tone="mint" />
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">Transacciones recientes</h2>
          {pays.length === 0 ? (
            <p className="text-xs text-ink-faint">Aún no hay cobros registrados.</p>
          ) : (
            <ul className="divide-y divide-cream-dark">
              {pays.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{p.studioName || '—'}</p>
                    <p className="text-xs text-ink-faint">{p.concept} · {fmtDate(p.paidAt)}</p>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-ink">{p.currency === 'MXN' ? `$${p.amount.toFixed(0)} MXN` : usd(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Lista de estudios (detalle) */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">Estudios ({rows.length})</h2>
        {ordered.map((r) => {
          const price = monthlyUsd(r);
          return (
            <Card key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold text-ink">{r.name}</span>
                    {estadoBadge(r)}
                    {r.founder && <Badge tone="brand">Fundador</Badge>}
                    {r.legacy && <Badge tone="neutral">Precio heredado</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-ink-faint">
                    {r.plan ? PLAN_LABEL[r.plan] ?? r.plan : 'Sin plan'}
                    {r.billing === 'annual' ? ' · anual' : ''}
                    {' · '}{r.students} alumno{r.students === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-bold text-ink">{price > 0 ? `${usd(price)}/mes` : '—'}</p>
                  <p className="text-xs text-ink-faint">
                    {r.status === 'ACTIVE' ? `renueva ${fmtDate(r.currentPeriodEnd)}` : `vence ${fmtDate(r.trialEndsAt)}`}
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Pestaña PAGOS (vista financiera de la suscripción SaaS — derivada del resumen)
// ---------------------------------------------------------------------------
function riskReason(r: MoveyaStudioRow): string {
  if (r.status === 'PAST_DUE') return 'Impago';
  if (r.status === 'TRIALING' && trialExpired(r)) return 'Prueba vencida';
  return 'Prueba por vencer';
}

function PagosTab() {
  const [rows, setRows] = useState<MoveyaStudioRow[]>([]);
  const [pays, setPays] = useState<MoveyaPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  useEffect(() => {
    fetchMoveyaOverview()
      .then((r) => { setRows(r); if (!r.length) setErr(true); })
      .catch(() => setErr(true))
      .finally(() => setLoading(false));
    fetchMoveyaPayments().then(setPays).catch(() => {});
  }, []);

  const f = useMemo(() => {
    const paying = rows.filter((r) => r.status === 'ACTIVE');
    const mrr = rows.reduce((a, r) => a + monthlyUsd(r), 0);
    const now = Date.now();
    const in30 = now + 30 * 86400000;
    const in7 = now + 7 * 86400000;

    const byPlan: Record<string, { count: number; total: number }> = {};
    for (const r of paying) {
      const label = r.founder ? 'Fundador' : r.plan ? PLAN_LABEL[r.plan] ?? r.plan : 'Sin plan';
      byPlan[label] = byPlan[label] || { count: 0, total: 0 };
      byPlan[label].count++; byPlan[label].total += monthlyUsd(r);
    }
    const renewals = paying
      .filter((r) => r.currentPeriodEnd && new Date(r.currentPeriodEnd).getTime() <= in30)
      .sort((a, b) => new Date(a.currentPeriodEnd as string).getTime() - new Date(b.currentPeriodEnd as string).getTime());
    const risk = rows.filter((r) =>
      r.status === 'PAST_DUE' ||
      (r.status === 'TRIALING' && trialExpired(r)) ||
      (r.status === 'TRIALING' && !trialExpired(r) && !!r.trialEndsAt && new Date(r.trialEndsAt).getTime() <= in7),
    );
    const annualCount = paying.filter((r) => r.billing === 'annual').length;
    return { payingCount: paying.length, mrr, arr: mrr * 12, byPlan, renewals, risk, annualCount };
  }, [rows]);

  if (loading) return <p className="text-ink-faint">Cargando…</p>;
  if (err) return <Card className="p-6 text-center text-ink-soft">No se pudo cargar. Verifica tu acceso de creador.</Card>;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="MRR (USD)" value={usd(f.mrr)} hint="Ingreso mensual recurrente" icon="💵" />
        <StatCard label="ARR (USD)" value={usd(f.arr)} hint="Proyección anual (MRR×12)" icon="📈" />
        <StatCard label="Pagando" value={f.payingCount} hint={`${f.annualCount} anual${f.annualCount === 1 ? '' : 'es'}`} icon="✅" />
        <StatCard label="En riesgo" value={f.risk.length} hint="Impagos y pruebas por vencer" icon="⚠️" />
      </div>

      {/* Ingresos por plan */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Ingresos por plan (mensual)</h2>
        {Object.keys(f.byPlan).length === 0 ? (
          <Card className="p-6 text-center text-ink-faint">Aún no hay suscripciones pagando.</Card>
        ) : (
          <Card className="divide-y divide-cream-dark p-0">
            {Object.entries(f.byPlan).sort((a, b) => b[1].total - a[1].total).map(([plan, v]) => (
              <div key={plan} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  {plan === 'Fundador' ? <Badge tone="brand">Fundador</Badge> : <span className="font-semibold text-ink">{plan}</span>}
                  <span className="text-xs text-ink-faint">· {v.count} estudio{v.count === 1 ? '' : 's'}</span>
                </div>
                <span className="font-bold text-ink">{usd(v.total)}/mes</span>
              </div>
            ))}
          </Card>
        )}
      </section>

      {/* Próximas renovaciones */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Próximas renovaciones (30 días)</h2>
        {f.renewals.length === 0 ? (
          <Card className="p-6 text-center text-ink-faint">Sin renovaciones en los próximos 30 días.</Card>
        ) : (
          <Card className="divide-y divide-cream-dark p-0">
            {f.renewals.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{r.name}</p>
                  <p className="text-xs text-ink-faint">{r.founder ? 'Fundador' : r.plan ? PLAN_LABEL[r.plan] ?? r.plan : '—'} · {usd(monthlyUsd(r))}/mes</p>
                </div>
                <span className="shrink-0 text-sm text-ink-soft">{fmtDate(r.currentPeriodEnd)}</span>
              </div>
            ))}
          </Card>
        )}
      </section>

      {/* En riesgo / seguimiento */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">En riesgo / seguimiento</h2>
        {f.risk.length === 0 ? (
          <Card className="p-6 text-center text-ink-faint">Nada en riesgo. 🎉</Card>
        ) : (
          <Card className="divide-y divide-cream-dark p-0">
            {f.risk.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{r.name}</p>
                  <p className="text-xs text-ink-faint">vence {fmtDate(r.trialEndsAt ?? r.currentPeriodEnd)}</p>
                </div>
                <Badge tone="danger">{riskReason(r)}</Badge>
              </div>
            ))}
          </Card>
        )}
      </section>

      {/* Transacciones recientes (cobros SaaS registrados) */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Transacciones recientes</h2>
        {pays.length === 0 ? (
          <Card className="p-6 text-center text-ink-faint">
            Aún no hay cobros registrados. Las nuevas suscripciones, renovaciones y pruebas de aquí en adelante aparecerán aquí.
          </Card>
        ) : (
          <Card className="divide-y divide-cream-dark p-0">
            {pays.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{p.studioName || '—'}</p>
                  <p className="text-xs text-ink-faint">{p.concept} · {p.provider === 'mercadopago' ? 'MP' : 'Stripe'} · {fmtDate(p.paidAt)}</p>
                </div>
                <span className="shrink-0 font-bold text-ink">{p.currency === 'MXN' ? `$${p.amount.toFixed(2)} MXN` : usd(p.amount)}</span>
              </div>
            ))}
          </Card>
        )}
      </section>

      <p className="pt-2 text-center text-xs text-ink-faint">
        Las transacciones se registran a partir de ahora. El detalle completo y los retiros (payouts) viven en tu panel de Stripe / Mercado Pago.
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Pestaña CRM (leads / prospectos de estudios)
// ---------------------------------------------------------------------------
const LEAD_TONE: Record<LeadStatus, 'neutral' | 'brand' | 'warning' | 'success' | 'danger'> = {
  nuevo: 'neutral', contactado: 'brand', demo: 'warning', prueba: 'warning', pagando: 'success', perdido: 'danger',
};
const waLink = (phone: string) => `https://wa.me/${phone.replace(/[^\d]/g, '')}`;
// Color de acento por etapa (para el tablero kanban).
const STAGE_ACCENT: Record<LeadStatus, string> = {
  nuevo: '#9aa39d', contactado: '#4A5D55', demo: '#C98A2B', prueba: '#88B8B7', pagando: '#2E7D53', perdido: '#B23B3B',
};
const emptyLead = (): MoveyaLead => ({
  id: '', name: '', ownerName: '', phone: '', email: '', city: '', status: 'nuevo', source: '', notes: '', nextFollowup: null, demoAt: null, createdAt: '',
});

// Enlaces públicos del embudo (se comparten para captar prospectos). El dominio
// canónico de cara al prospecto es moveyaapp.app; todos muestran el calendario.
const PUBLIC_BASE = 'https://moveyaapp.app';
const FUNNEL_LINKS: { label: string; src: string }[] = [
  { label: 'General', src: '' },
  { label: 'Instagram', src: 'instagram' },
  { label: 'WhatsApp', src: 'whatsapp' },
  { label: 'Facebook', src: 'facebook' },
  { label: 'TikTok', src: 'tiktok' },
];
const funnelUrl = (src: string) => `${PUBLIC_BASE}/#/demo${src ? `?src=${src}` : ''}`;

function CrmTab() {
  const [leads, setLeads] = useState<MoveyaLead[]>([]);
  const [showLinks, setShowLinks] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<LeadStatus | 'todos'>('todos');
  const [draft, setDraft] = useState<MoveyaLead | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [view, setView] = useState<'lista' | 'tablero'>('tablero');
  const [dragId, setDragId] = useState<string | null>(null);

  const load = () => { setLoading(true); fetchLeads().then(setLeads).finally(() => setLoading(false)); };
  useEffect(load, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { todos: leads.length };
    for (const s of LEAD_STATUSES) c[s] = leads.filter((l) => l.status === s).length;
    return c;
  }, [leads]);

  const shown = filter === 'todos' ? leads : leads.filter((l) => l.status === filter);

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim()) { notifyError('lead', 'El nombre es obligatorio.'); return; }
    setSaving(true);
    const ok = await saveLead({
      id: draft.id || undefined,
      name: draft.name.trim(), ownerName: draft.ownerName.trim(), phone: draft.phone.trim(),
      email: draft.email.trim(), city: draft.city.trim(), status: draft.status,
      source: draft.source.trim(), notes: draft.notes.trim(), nextFollowup: draft.nextFollowup || null,
    });
    setSaving(false);
    if (ok) { notifySuccess(draft.id ? 'Lead actualizado.' : 'Lead agregado.'); setDraft(null); load(); }
    else notifyError('lead', 'No se pudo guardar.');
  };

  const changeStatus = async (l: MoveyaLead, status: LeadStatus) => {
    const ok = await saveLead({ ...l, id: l.id, status });
    if (ok) load(); else notifyError('lead', 'No se pudo actualizar.');
  };

  const remove = async (id: string) => {
    const ok = await deleteLead(id);
    setConfirmDel(null);
    if (ok) { notifySuccess('Lead eliminado.'); load(); } else notifyError('lead', 'No se pudo eliminar.');
  };

  const copyLink = async (url: string) => {
    try { await navigator.clipboard.writeText(url); notifySuccess('Enlace copiado.'); }
    catch { notifyError('lead', 'No se pudo copiar. Selecciónalo y cópialo a mano.'); }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">Leads / prospectos</h2>
          <p className="text-xs text-ink-faint">Estudios y gyms por contactar y dar seguimiento.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex rounded-full bg-cream-dark/50 p-0.5">
            {(['tablero', 'lista'] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={`rounded-full px-3 py-1 text-xs font-semibold transition ${view === v ? 'bg-brand text-cream' : 'text-ink-soft'}`}>
                {v === 'tablero' ? 'Tablero' : 'Lista'}
              </button>
            ))}
          </div>
          {!draft && (
            <button onClick={() => setDraft(emptyLead())} className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-cream hover:opacity-90">+ Agregar</button>
          )}
        </div>
      </div>

      {/* Enlaces del embudo (para compartir y captar prospectos) */}
      <Card className="p-4">
        <button onClick={() => setShowLinks((v) => !v)} className="flex w-full items-center justify-between gap-2 text-left">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-ink">🔗 Enlaces de tu embudo</h3>
            <p className="text-xs text-ink-faint">Compártelos en tus redes o mensajes. Quien agende cae aquí en tu CRM.</p>
          </div>
          <span className="shrink-0 text-xs font-semibold text-brand">{showLinks ? 'Ocultar' : 'Ver'}</span>
        </button>
        {showLinks && (
          <div className="mt-3 space-y-2">
            {FUNNEL_LINKS.map((c) => (
              <div key={c.label} className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-xs font-semibold text-ink-soft">{c.label}</span>
                <code className="min-w-0 flex-1 truncate rounded-lg bg-cream-dark/40 px-2 py-1.5 text-[11px] text-ink">{funnelUrl(c.src)}</code>
                <button onClick={() => copyLink(funnelUrl(c.src))} className="shrink-0 rounded-lg border border-cream-dark px-2.5 py-1.5 text-[11px] font-semibold text-ink-soft hover:bg-cream-dark/40">Copiar</button>
                <a href={funnelUrl(c.src)} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg border border-cream-dark px-2.5 py-1.5 text-[11px] font-semibold text-brand hover:bg-cream-dark/40">Abrir</a>
              </div>
            ))}
            <p className="pt-1 text-[11px] text-ink-faint">El <code className="rounded bg-cream-dark/40 px-1">?src=</code> te dice de dónde llegó cada prospecto (lo ves en el campo “origen” del lead).</p>
          </div>
        )}
      </Card>

      {/* Filtro por etapa (solo en vista lista) */}
      {view === 'lista' && (
        <div className="flex flex-wrap gap-2">
          {(['todos', ...LEAD_STATUSES] as (LeadStatus | 'todos')[]).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                filter === s ? 'bg-brand text-cream' : 'bg-cream-dark/50 text-ink-soft hover:bg-cream-dark'
              }`}
            >
              {s === 'todos' ? 'Todos' : LEAD_STATUS_LABEL[s]} ({counts[s] ?? 0})
            </button>
          ))}
        </div>
      )}

      {/* Formulario crear/editar */}
      {draft && (
        <Card className="p-4 space-y-3">
          <h3 className="text-sm font-semibold text-ink">{draft.id ? 'Editar lead' : 'Nuevo lead'}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-ink-soft">Nombre del estudio/gym *</span>
              <input className={inp} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Estudio Pilates Sur" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-soft">Contacto (persona)</span>
              <input className={inp} value={draft.ownerName} onChange={(e) => setDraft({ ...draft, ownerName: e.target.value })} placeholder="Ana López" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-soft">Teléfono / WhatsApp</span>
              <input className={inp} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} placeholder="+52..." />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-soft">Correo</span>
              <input className={inp} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="correo@..." />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-soft">Ciudad</span>
              <input className={inp} value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-soft">Etapa</span>
              <select className={inp} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as LeadStatus })}>
                {LEAD_STATUSES.map((s) => <option key={s} value={s}>{LEAD_STATUS_LABEL[s]}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-soft">Origen</span>
              <input className={inp} value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })} placeholder="WhatsApp, Instagram, referido…" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-soft">Próximo seguimiento</span>
              <input type="date" className={inp} value={draft.nextFollowup ?? ''} onChange={(e) => setDraft({ ...draft, nextFollowup: e.target.value || null })} />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-ink-soft">Notas</span>
              <textarea className={`${inp} min-h-20`} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Qué habló, objeciones, siguiente paso…" />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setDraft(null)} disabled={saving} className="rounded-2xl px-4 py-2 text-sm font-semibold text-ink-soft hover:bg-cream-dark/40 disabled:opacity-60">Cancelar</button>
            <button onClick={save} disabled={saving} className="rounded-2xl bg-brand px-4 py-2 text-sm font-semibold text-cream hover:opacity-90 disabled:opacity-60">{saving ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </Card>
      )}

      {/* Vista LISTA */}
      {view === 'lista' && (loading ? (
        <p className="text-ink-faint">Cargando…</p>
      ) : shown.length === 0 && !draft ? (
        <Card className="p-8 text-center text-ink-faint">
          {leads.length === 0 ? <>Aún no tienes leads. Toca <span className="font-semibold text-ink">+ Agregar</span> para registrar el primero.</> : 'No hay leads en esta etapa.'}
        </Card>
      ) : (
        <section className="space-y-3">
          {shown.map((l) => (
            <Card key={l.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold text-ink">{l.name}</span>
                    <Badge tone={LEAD_TONE[l.status]}>{LEAD_STATUS_LABEL[l.status]}</Badge>
                    {l.city && <Badge tone="neutral">{l.city}</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-ink-faint">
                    {l.ownerName && <>{l.ownerName} · </>}
                    {l.phone && <a href={waLink(l.phone)} target="_blank" rel="noreferrer" className="text-brand underline">{l.phone}</a>}
                    {l.source && <> · {l.source}</>}
                  </p>
                  {l.demoAt && (
                    <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-mint/20 px-2 py-0.5 text-[11px] font-semibold text-brand">
                      📅 Demo: {fmtDateTime(l.demoAt)}
                    </p>
                  )}
                  {l.notes && <p className="mt-1 line-clamp-2 text-xs text-ink-soft">{l.notes}</p>}
                </div>
                {l.nextFollowup && (
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-ink-faint">seguimiento</p>
                    <p className="text-sm font-semibold text-ink">{fmtDate(l.nextFollowup)}</p>
                  </div>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                <select
                  value={l.status}
                  onChange={(e) => changeStatus(l, e.target.value as LeadStatus)}
                  className="rounded-2xl border border-cream-dark bg-white px-2 py-1.5 text-xs font-semibold text-ink-soft"
                >
                  {LEAD_STATUSES.map((s) => <option key={s} value={s}>{LEAD_STATUS_LABEL[s]}</option>)}
                </select>
                <button onClick={() => setDraft({ ...l })} className="rounded-2xl border border-cream-dark px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-cream-dark/40">Editar</button>
                {confirmDel === l.id ? (
                  <>
                    <span className="self-center text-xs text-red-700">¿Seguro?</span>
                    <button onClick={() => remove(l.id)} className="rounded-2xl bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">Sí</button>
                    <button onClick={() => setConfirmDel(null)} className="rounded-2xl px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-cream-dark/40">No</button>
                  </>
                ) : (
                  <button onClick={() => setConfirmDel(l.id)} className="rounded-2xl border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50">Borrar</button>
                )}
              </div>
            </Card>
          ))}
        </section>
      ))}

      {/* Vista TABLERO (kanban: arrastra una tarjeta entre etapas) */}
      {view === 'tablero' && (loading ? (
        <p className="text-ink-faint">Cargando…</p>
      ) : leads.length === 0 && !draft ? (
        <Card className="p-8 text-center text-ink-faint">Aún no tienes leads. Toca <span className="font-semibold text-ink">+ Agregar</span> para registrar el primero.</Card>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-2">
          <div className="flex gap-3" style={{ minWidth: 'min-content' }}>
            {LEAD_STATUSES.map((stage) => {
              const col = leads.filter((l) => l.status === stage);
              return (
                <div
                  key={stage}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    const l = leads.find((x) => x.id === dragId);
                    if (l && l.status !== stage) changeStatus(l, stage);
                    setDragId(null);
                  }}
                  className="flex w-60 shrink-0 flex-col rounded-2xl bg-cream-dark/25"
                >
                  <div className="flex items-center justify-between rounded-t-2xl border-t-4 px-3 py-2" style={{ borderColor: STAGE_ACCENT[stage] }}>
                    <span className="text-xs font-semibold text-ink">{LEAD_STATUS_LABEL[stage]}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-ink-soft">{col.length}</span>
                  </div>
                  <div className="flex-1 space-y-2 p-2">
                    {col.map((l) => (
                      <div
                        key={l.id}
                        draggable
                        onDragStart={() => setDragId(l.id)}
                        onDragEnd={() => setDragId(null)}
                        onClick={() => setDraft({ ...l })}
                        className="cursor-grab rounded-xl border border-cream-dark/60 bg-white p-3 shadow-sm active:cursor-grabbing"
                      >
                        <p className="truncate text-sm font-semibold text-ink">{l.name}</p>
                        {l.ownerName && <p className="truncate text-xs text-ink-faint">{l.ownerName}</p>}
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          {l.phone && <a href={waLink(l.phone)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs text-brand underline">WhatsApp</a>}
                          {l.nextFollowup && <span className="text-[10px] text-ink-faint">📅 {fmtDate(l.nextFollowup)}</span>}
                        </div>
                        {l.demoAt && <p className="mt-1 truncate text-[10px] font-semibold text-brand">📅 Demo: {fmtDateTime(l.demoAt)}</p>}
                      </div>
                    ))}
                    {col.length === 0 && <p className="px-1 py-2 text-center text-[11px] text-ink-faint">—</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Automatización: secuencia de bienvenida (se dispara sola al entrar un lead).
// ---------------------------------------------------------------------------
function SequenceAutomation() {
  const [active, setActive] = useState(true);
  const [trigger, setTrigger] = useState<TriggerSource>('any');
  const [steps, setSteps] = useState<SequenceStep[]>([]);
  const [stats, setStats] = useState({ pending: 0, sent: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    Promise.all([fetchSequenceConfig(), fetchSequenceStats()])
      .then(([cfg, st]) => { if (cfg) { setActive(cfg.active); setTrigger(cfg.triggerSource); setSteps(cfg.steps); } setStats(st); })
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    const ok = await saveSequenceConfig(active, steps, trigger);
    setSaving(false);
    if (ok) notifySuccess('Automatización guardada.'); else notifyError('seq', 'No se pudo guardar.');
  };

  const setStep = (i: number, patch: Partial<SequenceStep>) =>
    setSteps((ss) => ss.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const addStep = (kind: StepKind) => setSteps((ss) => [...ss, {
    delayHours: (ss.length ? 72 : 0), kind, subject: '', body: '', stage: 'contactado', template: '', lang: 'es_MX',
  }]);
  const removeStep = (i: number) => setSteps((ss) => ss.filter((_, k) => k !== i));

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">🤖 Automatización · Workflow</h2>
          <p className="text-xs text-ink-faint">Cuando entra un lead, se ejecutan estos pasos solos (enviar correo o mover de etapa) en los días que configures.</p>
        </div>
        <button onClick={() => setOpen((v) => !v)} className="shrink-0 text-xs font-semibold text-brand">{open ? 'Ocultar' : 'Configurar'}</button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
        <button
          onClick={() => setActive((v) => !v)}
          className={`rounded-full px-3 py-1 font-semibold ${active ? 'bg-brand text-cream' : 'bg-cream-dark/60 text-ink-soft'}`}
        >
          {active ? '● Activa' : '○ Pausada'}
        </button>
        {!loading && <span className="text-ink-faint">Programados: <b className="text-ink">{stats.pending}</b> · Enviados: <b className="text-ink">{stats.sent}</b></span>}
      </div>

      {open && (
        <div className="mt-4 space-y-3">
          {/* Disparador */}
          <label className="block rounded-xl bg-cream-dark/25 p-3">
            <span className="mb-1 block text-xs font-semibold text-ink">⚡ Disparador — ¿a qué leads aplica?</span>
            <select className={inp} value={trigger} onChange={(e) => setTrigger(e.target.value as TriggerSource)}>
              {TRIGGER_SOURCES.map((t) => <option key={t} value={t}>{TRIGGER_SOURCE_LABEL[t]}</option>)}
            </select>
          </label>

          {/* Pasos */}
          {steps.map((s, i) => (
            <div key={i} className="rounded-xl border border-cream-dark bg-white p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-ink">Paso {i + 1} · {s.kind === 'stage' ? 'Cambiar etapa' : s.kind === 'whatsapp' ? 'WhatsApp' : 'Enviar correo'}</span>
                <button onClick={() => removeStep(i)} className="text-[11px] font-semibold text-red-600 hover:underline">Quitar</button>
              </div>
              <label className="mb-2 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                Ejecutar
                <input
                  type="number" min={0}
                  value={Math.round(s.delayHours / 24)}
                  onChange={(e) => setStep(i, { delayHours: Math.max(0, Number(e.target.value) || 0) * 24 })}
                  className="w-16 rounded-lg border border-cream-dark bg-white px-2 py-1 text-sm"
                />
                días después {i === 0 && <span className="text-ink-faint">(0 = de inmediato)</span>}
              </label>
              {s.kind === 'stage' ? (
                <label className="flex items-center gap-2 text-xs text-ink-soft">
                  Mover el lead a:
                  <select className="rounded-lg border border-cream-dark bg-white px-2 py-1.5 text-sm" value={s.stage} onChange={(e) => setStep(i, { stage: e.target.value })}>
                    {LEAD_STATUSES.map((st) => <option key={st} value={st}>{LEAD_STATUS_LABEL[st]}</option>)}
                  </select>
                </label>
              ) : s.kind === 'whatsapp' ? (
                <div className="space-y-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-medium text-ink-soft">Nombre de la plantilla aprobada</span>
                      <input className={inp} value={s.template} onChange={(e) => setStep(i, { template: e.target.value })} placeholder="ej. bienvenida_leads" />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-medium text-ink-soft">Idioma</span>
                      <input className={inp} value={s.lang} onChange={(e) => setStep(i, { lang: e.target.value })} placeholder="es_MX" />
                    </label>
                  </div>
                  <p className="text-[11px] text-ink-faint">El texto lo define la plantilla en Meta; la variable <b>{'{{'}1{'}}'}</b> se reemplaza por el nombre del lead. Requiere número de producción activo y plantilla aprobada.</p>
                </div>
              ) : (
                <>
                  <input className={`${inp} mb-2`} value={s.subject} onChange={(e) => setStep(i, { subject: e.target.value })} placeholder="Asunto (usa {{nombre}})" />
                  <textarea className={`${inp} min-h-24`} value={s.body} onChange={(e) => setStep(i, { body: e.target.value })} placeholder="Mensaje (usa {{nombre}})" />
                </>
              )}
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => addStep('email')} className="rounded-full border border-cream-dark px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-cream-dark/40">+ Correo</button>
            <button onClick={() => addStep('whatsapp')} className="rounded-full border border-cream-dark px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-cream-dark/40">+ WhatsApp</button>
            <button onClick={() => addStep('stage')} className="rounded-full border border-cream-dark px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-cream-dark/40">+ Cambiar etapa</button>
            <button onClick={save} disabled={saving} className="ml-auto rounded-full bg-brand px-4 py-2 text-sm font-semibold text-cream hover:opacity-90 disabled:opacity-60">{saving ? 'Guardando…' : 'Guardar workflow'}</button>
          </div>
          <p className="text-[11px] text-ink-faint">Los correos salen desde tu remitente de Move yA con el diseño de marca. {'{{'}nombre{'}}'} se reemplaza por el nombre del lead. (Paso de WhatsApp: próximamente, requiere plantilla aprobada de Meta.)</p>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Pestaña EMAIL (campañas a leads vía Resend)
// ---------------------------------------------------------------------------
function EmailTab() {
  const [leads, setLeads] = useState<MoveyaLead[]>([]);
  const [emails, setEmails] = useState<MoveyaEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'todos' | 'etapa' | 'manual'>('todos');
  const [stage, setStage] = useState<LeadStatus>('nuevo');
  const [manual, setManual] = useState({ email: '', name: '' });
  const [from, setFrom] = useState(DEFAULT_EMAIL_FROM);
  const [subject, setSubject] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [sending, setSending] = useState(false);

  const load = () => {
    fetchLeads().then(setLeads).catch(() => {});
    fetchEmailsRecent().then(setEmails).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const recipients = useMemo(() => {
    if (mode === 'manual') return manual.email.trim() ? [{ email: manual.email.trim(), name: manual.name.trim() }] : [];
    let ls = leads.filter((l) => l.email);
    if (mode === 'etapa') ls = ls.filter((l) => l.status === stage);
    return ls.map((l) => ({ email: l.email, name: l.ownerName || l.name }));
  }, [mode, stage, manual, leads]);

  const send = async () => {
    if (!subject.trim() || !bodyText.trim()) { notifyError('email', 'Falta asunto o contenido.'); return; }
    if (recipients.length === 0) { notifyError('email', 'No hay destinatarios con correo.'); return; }
    setSending(true);
    const res = await sendEmailCampaign({ from: from.trim(), subject: subject.trim(), html: brandedEmailHtml(bodyText), recipients });
    setSending(false);
    if ('error' in res && res.error) { notifyError('email', res.error); return; }
    const r = res as { sent: number; failed: number };
    notifySuccess(`Enviados: ${r.sent}${r.failed ? ` · fallidos: ${r.failed}` : ''}.`);
    fetchEmailsRecent().then(setEmails);
  };

  return (
    <>
      <SequenceAutomation />

      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-semibold text-ink">Enviar correo a leads</h2>

        {/* Destinatarios */}
        <div>
          <span className="mb-1 block text-xs font-medium text-ink-soft">Para</span>
          <div className="flex flex-wrap gap-2">
            {([['todos', 'Todos con correo'], ['etapa', 'Por etapa'], ['manual', 'Uno manual']] as [typeof mode, string][]).map(([k, label]) => (
              <button key={k} onClick={() => setMode(k)} className={`rounded-full px-3 py-1 text-xs font-semibold transition ${mode === k ? 'bg-brand text-cream' : 'bg-cream-dark/50 text-ink-soft hover:bg-cream-dark'}`}>{label}</button>
            ))}
          </div>
          {mode === 'etapa' && (
            <select className={`${inp} mt-2`} value={stage} onChange={(e) => setStage(e.target.value as LeadStatus)}>
              {LEAD_STATUSES.map((s) => <option key={s} value={s}>{LEAD_STATUS_LABEL[s]}</option>)}
            </select>
          )}
          {mode === 'manual' && (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input className={inp} value={manual.email} onChange={(e) => setManual({ ...manual, email: e.target.value })} placeholder="correo@..." />
              <input className={inp} value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} placeholder="Nombre (opcional)" />
            </div>
          )}
          <p className="mt-1 text-xs text-ink-faint">{recipients.length} destinatario{recipients.length === 1 ? '' : 's'}</p>
        </div>

        {/* Plantillas */}
        <div>
          <span className="mb-1 block text-xs font-medium text-ink-soft">Plantillas</span>
          <div className="flex flex-wrap gap-2">
            {DEFAULT_EMAIL_TEMPLATES.map((t) => (
              <button key={t.name} onClick={() => { setSubject(t.subject); setBodyText(t.body); }} className="rounded-full border border-cream-dark px-3 py-1 text-xs font-semibold text-ink-soft hover:bg-cream-dark/40">{t.name}</button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-soft">Remitente (debe ser @moveyaapp.app)</span>
          <input className={inp} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-soft">Asunto</span>
          <input className={inp} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Asunto del correo" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-soft">Mensaje</span>
          <textarea className={`${inp} min-h-40`} value={bodyText} onChange={(e) => setBodyText(e.target.value)} placeholder="Escribe tu mensaje… Usa {{nombre}} y se reemplaza por el nombre de cada lead." />
          <span className="mt-1 block text-xs text-ink-faint">Se envía con el diseño de marca Move yA. <code className="rounded bg-cream-dark/50 px-1">{'{{nombre}}'}</code> se personaliza por destinatario.</span>
        </label>

        <div className="flex justify-end">
          <button onClick={send} disabled={sending || recipients.length === 0} className="rounded-2xl bg-brand px-5 py-2.5 text-sm font-semibold text-cream hover:opacity-90 disabled:opacity-60">
            {sending ? 'Enviando…' : `Enviar a ${recipients.length}`}
          </button>
        </div>
      </Card>

      {/* Enviados recientes */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Enviados recientes</h2>
        {loading ? (
          <p className="text-ink-faint">Cargando…</p>
        ) : emails.length === 0 ? (
          <Card className="p-6 text-center text-ink-faint">Aún no has enviado correos.</Card>
        ) : (
          <Card className="divide-y divide-cream-dark p-0">
            {emails.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{e.toName || e.toEmail}</p>
                  <p className="truncate text-xs text-ink-faint">{e.subject}</p>
                </div>
                <div className="shrink-0 text-right">
                  {e.status === 'sent' ? <Badge tone="success">Enviado</Badge> : <Badge tone="danger">Error</Badge>}
                  <p className="mt-0.5 text-[10px] text-ink-faint">{fmtDate(e.sentAt)}</p>
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>

      <p className="pt-1 text-center text-xs text-ink-faint">
        Envíos vía Resend desde tu dominio verificado. Respeta a quien pida "baja". Las respuestas llegan a tu correo de moveyaapp.app (Zoho).
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Pestaña WHATSAPP (bot de ventas de Move yA): Bandeja + Configuración
// ---------------------------------------------------------------------------
function WhatsAppTab() {
  const [view, setView] = useState<'bandeja' | 'config'>('bandeja');
  return (
    <>
      <div className="flex gap-2">
        {([['bandeja', 'Bandeja'], ['config', 'Configuración']] as ['bandeja' | 'config', string][]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setView(k)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              view === k ? 'bg-brand text-cream' : 'bg-cream-dark/50 text-ink-soft hover:bg-cream-dark'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {view === 'bandeja' ? <WaBandejaView /> : <WaConfigView />}
    </>
  );
}

// --- Bandeja: conversaciones + responder ---
const waTime = (s: string | null) => (s ? new Date(s).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

function WaBandejaView() {
  const [convos, setConvos] = useState<WaConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<WaConversation | null>(null);
  const [thread, setThread] = useState<WaMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const loadConvos = () => { setLoading(true); fetchWaConvos().then(setConvos).finally(() => setLoading(false)); };
  useEffect(loadConvos, []);

  const openConvo = async (c: WaConversation) => {
    setSel(c); setLoadingThread(true);
    const t = await fetchWaThread(c.id); setThread(t); setLoadingThread(false);
    if (c.unread > 0) { await markWaRead(c.id); setConvos((p) => p.map((x) => (x.id === c.id ? { ...x, unread: 0 } : x))); }
  };

  const send = async () => {
    if (!sel || !reply.trim()) return;
    setSending(true);
    const ok = await sendWaReply(sel.id, reply.trim());
    setSending(false);
    if (ok) { setReply(''); setThread(await fetchWaThread(sel.id)); loadConvos(); }
    else notifyError('whatsapp', 'No se pudo enviar. ¿El número de Move yA está conectado?');
  };

  const toggleMode = async () => {
    if (!sel) return;
    const next = sel.mode === 'bot' ? 'human' : 'bot';
    const ok = await setWaMode(sel.id, next);
    if (ok) { setSel({ ...sel, mode: next }); setConvos((p) => p.map((x) => (x.id === sel.id ? { ...x, mode: next } : x))); }
    else notifyError('whatsapp', 'No se pudo cambiar el modo.');
  };

  // Vista de conversación abierta
  if (sel) {
    return (
      <Card className="flex h-[70vh] flex-col p-0">
        <div className="flex items-center justify-between gap-2 border-b border-cream-dark p-3">
          <button onClick={() => setSel(null)} className="text-sm font-semibold text-ink-soft hover:text-ink">← Chats</button>
          <div className="min-w-0 text-center">
            <p className="truncate text-sm font-semibold text-ink">{sel.contactName || sel.contactPhone}</p>
            <p className="text-xs text-ink-faint">{sel.contactPhone}</p>
          </div>
          <button
            onClick={toggleMode}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${sel.mode === 'human' ? 'bg-amber-100 text-amber-800' : 'bg-cream-dark/60 text-ink-soft'}`}
            title="Alternar entre que responda el bot o tú"
          >
            {sel.mode === 'human' ? '🙋 Humano' : '🤖 Bot'}
          </button>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto bg-cream-light/40 p-3">
          {loadingThread ? (
            <p className="text-center text-xs text-ink-faint">Cargando…</p>
          ) : thread.length === 0 ? (
            <p className="text-center text-xs text-ink-faint">Sin mensajes.</p>
          ) : (
            thread.map((m) => {
              const out = m.direction === 'out';
              return (
                <div key={m.id} className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${out ? 'bg-brand text-cream' : 'bg-white text-ink border border-cream-dark'}`}>
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p className={`mt-1 text-[10px] ${out ? 'text-cream/70' : 'text-ink-faint'}`}>
                      {m.sender === 'bot' ? 'bot · ' : m.sender === 'human' ? 'tú · ' : ''}{waTime(m.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-end gap-2 border-t border-cream-dark p-3">
          <textarea
            className={`${inp} min-h-10 flex-1`}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
            placeholder="Escribe tu respuesta…"
          />
          <button onClick={send} disabled={sending || !reply.trim()} className="shrink-0 rounded-2xl bg-brand px-4 py-2.5 text-sm font-semibold text-cream hover:opacity-90 disabled:opacity-60">
            {sending ? '…' : 'Enviar'}
          </button>
        </div>
      </Card>
    );
  }

  // Lista de conversaciones
  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Conversaciones</h2>
        <button onClick={loadConvos} className="rounded-full border border-cream-dark px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-cream-dark/40">Actualizar</button>
      </div>
      {loading ? (
        <p className="text-ink-faint">Cargando…</p>
      ) : convos.length === 0 ? (
        <Card className="p-8 text-center text-ink-faint">
          Aún no hay conversaciones. Cuando conectes tu número y te escriban prospectos, aparecerán aquí.
        </Card>
      ) : (
        <section className="space-y-2">
          {convos.map((c) => (
            <Card key={c.id} className="cursor-pointer p-3 hover:bg-cream-dark/20" >
              <button onClick={() => openConvo(c)} className="block w-full text-left">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold text-ink">{c.contactName || c.contactPhone}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    {c.mode === 'human' && <Badge tone="warning">Humano</Badge>}
                    {c.unread > 0 && <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold text-cream">{c.unread}</span>}
                    <span className="text-xs text-ink-faint">{waTime(c.lastMessageAt)}</span>
                  </div>
                </div>
                <p className="mt-0.5 truncate text-xs text-ink-faint">
                  {c.lastDirection === 'out' ? 'Tú: ' : ''}{c.lastMessageText}
                </p>
              </button>
            </Card>
          ))}
        </section>
      )}
    </>
  );
}

// --- Configuración del bot + base de conocimiento ---
function WaConfigView() {
  const [cfg, setCfg] = useState<MoveyaWaConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [botEnabled, setBotEnabled] = useState(false);
  const [aiActive, setAiActive] = useState(false);
  const [number, setNumber] = useState('');
  const [kb, setKb] = useState<string[]>([]);
  const [newFact, setNewFact] = useState('');

  useEffect(() => {
    fetchWaConfig().then((c) => {
      if (c) {
        setCfg(c);
        setBotEnabled(c.botEnabled); setAiActive(c.aiActive); setNumber(c.number); setKb(c.knowledge);
      }
    }).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    const ok = await saveWaConfig({ botEnabled, aiActive, number: number.trim(), knowledge: kb });
    setSaving(false);
    if (ok) { notifySuccess('Configuración guardada.'); setCfg({ ...(cfg as MoveyaWaConfig), botEnabled, aiActive, number: number.trim(), knowledge: kb }); }
    else notifyError('whatsapp', 'No se pudo guardar.');
  };

  const addFact = () => { const t = newFact.trim(); if (!t) return; setKb([...kb, t]); setNewFact(''); };
  const loadDefault = () => { const merged = Array.from(new Set([...kb, ...DEFAULT_SALES_KB])); setKb(merged); notifySuccess('Base de ventas cargada. Revisa y guarda.'); };

  if (loading) return <p className="text-ink-faint">Cargando…</p>;
  if (!cfg) return <Card className="p-6 text-center text-ink-soft">No se pudo cargar. Verifica tu acceso de creador y que el SQL de WhatsApp esté aplicado.</Card>;

  return (
    <>
      {/* Estado de conexión */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">Número de Move yA</h2>
            <p className="text-xs text-ink-faint">El número con el que tu bot de ventas recibe y responde.</p>
          </div>
          {cfg.connected ? <Badge tone="success">Conectado</Badge> : <Badge tone="warning">Sin conectar</Badge>}
        </div>
        {!cfg.connected && (
          <p className="mt-2 rounded-xl bg-cream-dark/40 p-3 text-xs text-ink-soft">
            Aún no conectas un número dedicado de Move yA. La bandeja (ver/responder) llega en la siguiente entrega;
            por ahora puedes dejar lista la configuración del bot y su base de conocimiento.
          </p>
        )}
        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-medium text-ink-soft">Número (solo informativo)</span>
          <input className={inp} value={number} onChange={(e) => setNumber(e.target.value)} placeholder="+52..." />
        </label>
      </Card>

      {/* Config del bot */}
      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-semibold text-ink">Bot de ventas</h2>
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm text-ink-soft">Bot encendido (responde automático)</span>
          <input type="checkbox" checked={botEnabled} onChange={(e) => setBotEnabled(e.target.checked)} />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm text-ink-soft">Respuestas con IA (Claude) <span className="text-ink-faint">· requiere saldo Anthropic</span></span>
          <input type="checkbox" checked={aiActive} onChange={(e) => setAiActive(e.target.checked)} />
        </label>
        <p className="text-xs text-ink-faint">Con IA apagada, el bot responde con reglas (gratis) usando la base de abajo. Si el prospecto pide una persona, pasa a tu bandeja.</p>
      </Card>

      {/* Base de conocimiento de ventas */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-ink">Base de conocimiento (ventas)</h2>
            <p className="text-xs text-ink-faint">Frases que el bot usa para responder. Una idea por línea.</p>
          </div>
          <button onClick={loadDefault} className="shrink-0 rounded-full border border-cream-dark px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-cream-dark/40">Cargar base</button>
        </div>

        <div className="flex gap-2">
          <input className={inp} value={newFact} onChange={(e) => setNewFact(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addFact(); }} placeholder="Agregar una frase…" />
          <button onClick={addFact} className="shrink-0 rounded-2xl bg-brand px-4 py-2 text-sm font-semibold text-cream hover:opacity-90">Agregar</button>
        </div>

        {kb.length === 0 ? (
          <p className="text-xs text-ink-faint">Sin frases aún. Toca <span className="font-semibold text-ink">Cargar base</span> para empezar con la de ventas.</p>
        ) : (
          <ul className="space-y-2">
            {kb.map((fact, i) => (
              <li key={i} className="flex items-start gap-2">
                <textarea
                  className={`${inp} min-h-10`}
                  value={fact}
                  onChange={(e) => setKb(kb.map((f, j) => (j === i ? e.target.value : f)))}
                />
                <button onClick={() => setKb(kb.filter((_, j) => j !== i))} className="mt-1 shrink-0 rounded-2xl border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50">✕</button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-ink-faint">{kb.length} frase{kb.length === 1 ? '' : 's'}</p>
      </Card>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving} className="rounded-2xl bg-brand px-5 py-2.5 text-sm font-semibold text-cream hover:opacity-90 disabled:opacity-60">
          {saving ? 'Guardando…' : 'Guardar configuración'}
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Pestaña CONTENIDO (calendario/planificador de redes) · Fase 5
// ---------------------------------------------------------------------------
const CONTENT_TONE: Record<ContentStatus, 'neutral' | 'brand' | 'success'> = {
  idea: 'neutral', listo: 'brand', publicado: 'success',
};
const CHANNEL_ICON: Record<ContentChannel, string> = {
  instagram: '📸', facebook: '👍', tiktok: '🎵', whatsapp: '💬', otro: '📝',
};
const todayStr = () => new Date().toISOString().slice(0, 10);
const emptyPost = (): ContentPost => ({
  id: '', scheduledFor: todayStr(), channel: 'instagram', title: '', caption: '', status: 'idea', link: '', media: [],
});

// Calendario mensual (tipo GHL): toca un día para ver/crear, colores por estado,
// y arrastra una publicación de un día a otro para reprogramarla.
const MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const WEEK_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
// Color del chip según estado (idea / listo / publicado).
const STATUS_CHIP: Record<ContentStatus, string> = {
  idea: 'bg-cream-dark/70 text-ink-soft', listo: 'bg-mint/60 text-ink', publicado: 'bg-green-100 text-green-700',
};
const ymdOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function monthGrid(cursor: Date): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const startDow = (first.getDay() + 6) % 7; // lunes = 0
  const start = new Date(first);
  start.setDate(first.getDate() - startDow);
  return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
}

function ContentCalendar({ posts, onNew, onEdit, onReschedule }: {
  posts: ContentPost[];
  onNew: (dateStr: string) => void;
  onEdit: (p: ContentPost) => void;
  onReschedule: (p: ContentPost, dateStr: string) => void;
}) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selected, setSelected] = useState(ymdOf(new Date()));
  const [dragId, setDragId] = useState<string | null>(null);
  const days = monthGrid(cursor);
  const todayYmd = ymdOf(new Date());
  const move = (delta: number) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  const selectedPosts = posts.filter((p) => p.scheduledFor === selected);

  return (
    <Card className="p-3">
      <div className="mb-3 flex items-center justify-between">
        <button onClick={() => move(-1)} className="grid h-8 w-8 place-items-center rounded-lg text-ink hover:bg-cream-dark/40">‹</button>
        <span className="text-sm font-bold text-ink">{MONTHS_ES[cursor.getMonth()]} {cursor.getFullYear()}</span>
        <button onClick={() => move(1)} className="grid h-8 w-8 place-items-center rounded-lg text-ink hover:bg-cream-dark/40">›</button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {WEEK_ES.map((w) => <div key={w} className="pb-1 text-center text-[10px] font-semibold text-ink-faint">{w}</div>)}
        {days.map((d) => {
          const dstr = ymdOf(d);
          const inMonth = d.getMonth() === cursor.getMonth();
          const dayPosts = posts.filter((p) => p.scheduledFor === dstr);
          const isSel = dstr === selected;
          return (
            <div
              key={dstr}
              onClick={() => setSelected(dstr)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                const p = posts.find((x) => x.id === dragId);
                if (p && p.scheduledFor !== dstr) onReschedule(p, dstr);
                setDragId(null);
              }}
              className={`flex min-h-[54px] cursor-pointer flex-col rounded-lg border p-1 text-left transition ${isSel ? 'border-brand ring-1 ring-brand' : inMonth ? 'border-cream-dark bg-white hover:border-brand' : 'border-transparent bg-cream-dark/20 text-ink-faint'}`}
            >
              <span className={`text-[10px] font-semibold ${dstr === todayYmd ? 'grid h-4 w-4 place-items-center rounded-full bg-brand text-cream' : 'text-ink-soft'}`}>{d.getDate()}</span>
              <div className="mt-0.5 flex flex-wrap gap-0.5">
                {dayPosts.slice(0, 3).map((p) => (
                  <span
                    key={p.id}
                    draggable
                    onDragStart={(e) => { e.stopPropagation(); setDragId(p.id); }}
                    onDragEnd={() => setDragId(null)}
                    onClick={(e) => { e.stopPropagation(); onEdit(p); }}
                    title={p.title || CONTENT_CHANNEL_LABEL[p.channel]}
                    className={`grid h-4 w-4 cursor-grab place-items-center rounded text-[10px] leading-none active:cursor-grabbing ${STATUS_CHIP[p.status]}`}
                  >
                    {CHANNEL_ICON[p.channel]}
                  </span>
                ))}
                {dayPosts.length > 3 && <span className="text-[9px] text-ink-faint">+{dayPosts.length - 3}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Leyenda de estados */}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-ink-faint">
        {CONTENT_STATUSES.map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className={`h-3 w-3 rounded ${STATUS_CHIP[s]}`} /> {CONTENT_STATUS_LABEL[s]}
          </span>
        ))}
        <span className="ml-auto">Arrastra para reprogramar</span>
      </div>

      {/* Publicaciones del día seleccionado */}
      <div className="mt-3 border-t border-cream-dark pt-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-ink">{fmtDate(selected)}</span>
          <button onClick={() => onNew(selected)} className="rounded-full bg-brand px-3 py-1 text-xs font-semibold text-cream hover:opacity-90">+ Nueva este día</button>
        </div>
        {selectedPosts.length === 0 ? (
          <p className="text-[11px] text-ink-faint">Sin publicaciones este día.</p>
        ) : (
          <div className="space-y-1.5">
            {selectedPosts.map((p) => (
              <button key={p.id} onClick={() => onEdit(p)} className="flex w-full items-center gap-2 rounded-lg border border-cream-dark bg-white px-2 py-1.5 text-left hover:border-brand">
                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded ${STATUS_CHIP[p.status]}`}>{CHANNEL_ICON[p.channel]}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-ink">{p.title || p.caption || CONTENT_CHANNEL_LABEL[p.channel]}</span>
                <Badge tone={CONTENT_TONE[p.status]}>{CONTENT_STATUS_LABEL[p.status]}</Badge>
              </button>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function ContenidoTab() {
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<ContentPost | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [view, setView] = useState<'calendario' | 'lista'>('calendario');

  const load = () => { setLoading(true); fetchContent().then(setPosts).finally(() => setLoading(false)); };
  useEffect(load, []);

  // Material del post: links de video + imágenes subidas.
  const addVideoLink = () => setDraft((d) => (d ? { ...d, media: [...d.media, { kind: 'video', url: '' }] } : d));
  const setMediaUrl = (i: number, url: string) =>
    setDraft((d) => (d ? { ...d, media: d.media.map((m, idx) => (idx === i ? { ...m, url } : m)) } : d));
  const removeMedia = (i: number) => setDraft((d) => {
    if (!d) return d;
    const m = d.media[i];
    if (m?.kind === 'image' && m.path) void removeContentImage(m.path);
    return { ...d, media: d.media.filter((_, idx) => idx !== i) };
  });
  const pickImages = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setUploading(true);
    const added: ContentMedia[] = [];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) { notifyError('content', `${f.name}: solo imágenes.`); continue; }
      if (f.size > CONTENT_MAX_IMG_MB * 1024 * 1024) { notifyError('content', `${f.name}: máximo ${CONTENT_MAX_IMG_MB} MB.`); continue; }
      const up = await uploadContentImage(f);
      if (up) added.push(up); else notifyError('content', `No se pudo subir ${f.name}.`);
    }
    setUploading(false);
    if (added.length) setDraft((d) => (d ? { ...d, media: [...d.media, ...added] } : d));
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.scheduledFor) { notifyError('content', 'Falta la fecha.'); return; }
    setSaving(true);
    const ok = await saveContent({
      id: draft.id || undefined, scheduledFor: draft.scheduledFor, channel: draft.channel,
      title: draft.title.trim(), caption: draft.caption.trim(), status: draft.status, link: draft.link.trim(),
      media: draft.media.filter((m) => m.kind === 'image' || m.url.trim() !== ''),
    });
    setSaving(false);
    if (ok) { notifySuccess(draft.id ? 'Publicación actualizada.' : 'Publicación agregada.'); setDraft(null); load(); }
    else notifyError('content', 'No se pudo guardar.');
  };

  const changeStatus = async (p: ContentPost, status: ContentStatus) => {
    const ok = await saveContent({ ...p, id: p.id, status });
    if (ok) load(); else notifyError('content', 'No se pudo actualizar.');
  };

  const remove = async (id: string) => {
    const ok = await deleteContent(id);
    setConfirmDel(null);
    if (ok) { notifySuccess('Publicación eliminada.'); load(); } else notifyError('content', 'No se pudo eliminar.');
  };

  const copyCaption = async (text: string) => {
    try { await navigator.clipboard.writeText(text); notifySuccess('Copy copiado.'); }
    catch { notifyError('content', 'No se pudo copiar.'); }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">Calendario de contenido</h2>
          <p className="text-xs text-ink-faint">Planea tus publicaciones de redes. Guarda idea, fecha, canal y copy.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex rounded-full bg-cream-dark/50 p-0.5">
            {(['calendario', 'lista'] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={`rounded-full px-3 py-1 text-xs font-semibold transition ${view === v ? 'bg-brand text-cream' : 'text-ink-soft'}`}>
                {v === 'calendario' ? 'Calendario' : 'Lista'}
              </button>
            ))}
          </div>
          {!draft && (
            <button onClick={() => setDraft(emptyPost())} className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-cream hover:opacity-90">+ Nueva</button>
          )}
        </div>
      </div>

      <Card className="p-3 text-xs text-ink-soft">
        💡 Por ahora es un <b>planificador</b>: organizas y copias el texto para publicarlo tú. La publicación automática a Instagram/TikTok necesita aprobación de Meta/TikTok (lo activamos cuando la tengas).
      </Card>

      {view === 'calendario' && !draft && (
        <ContentCalendar
          posts={posts}
          onNew={(dstr) => setDraft({ ...emptyPost(), scheduledFor: dstr })}
          onEdit={(p) => setDraft({ ...p })}
          onReschedule={async (p, dstr) => {
            const ok = await saveContent({ ...p, id: p.id, scheduledFor: dstr });
            if (ok) { notifySuccess('Publicación reprogramada.'); load(); } else notifyError('content', 'No se pudo reprogramar.');
          }}
        />
      )}

      {/* Formulario crear/editar */}
      {draft && (
        <Card className="p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-soft">Fecha *</span>
              <input type="date" className={inp} value={draft.scheduledFor} onChange={(e) => setDraft({ ...draft, scheduledFor: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-soft">Canal</span>
              <select className={inp} value={draft.channel} onChange={(e) => setDraft({ ...draft, channel: e.target.value as ContentChannel })}>
                {CONTENT_CHANNELS.map((c) => <option key={c} value={c}>{CONTENT_CHANNEL_LABEL[c]}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-soft">Estado</span>
              <select className={inp} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as ContentStatus })}>
                {CONTENT_STATUSES.map((s) => <option key={s} value={s}>{CONTENT_STATUS_LABEL[s]}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-soft">Título / idea interna</span>
              <input className={inp} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Ej. Reel: 3 beneficios del Pilates" />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-soft">Copy (texto a publicar)</span>
            <textarea className={`${inp} min-h-28`} value={draft.caption} onChange={(e) => setDraft({ ...draft, caption: e.target.value })} placeholder="Escribe el texto del post, con hashtags y llamado a la acción…" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-soft">Link del post (cuando lo publiques, opcional)</span>
            <input className={inp} value={draft.link} onChange={(e) => setDraft({ ...draft, link: e.target.value })} placeholder="https://instagram.com/p/…" />
          </label>

          {/* Material del post: videos por link + imágenes subidas */}
          <div className="rounded-2xl border border-cream-dark bg-cream/40 p-3 space-y-3">
            <span className="block text-xs font-semibold text-ink">🎬 Material del post</span>

            {/* Links de video / Reel */}
            <div className="space-y-2">
              {draft.media.map((m, i) => (m.kind === 'video' ? (
                <div key={`v${i}`} className="flex items-center gap-2">
                  <span className="text-sm">🎬</span>
                  <input className={inp} value={m.url} onChange={(e) => setMediaUrl(i, e.target.value)}
                    placeholder="Link del Reel/video (Drive, YouTube, Vimeo, Dropbox…)" />
                  <button type="button" onClick={() => removeMedia(i)} className="shrink-0 rounded-full px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">✕</button>
                </div>
              ) : null))}
              <button type="button" onClick={addVideoLink} className="text-xs font-semibold text-brand hover:underline">+ Agregar link de video / Reel</button>
            </div>

            {/* Imágenes subidas */}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex cursor-pointer items-center rounded-full border border-brand bg-white px-3 py-1.5 text-xs font-semibold text-brand hover:bg-brand/5">
                  <input type="file" accept="image/*" multiple className="hidden" disabled={uploading}
                    onChange={(e) => { void pickImages(e.target.files); e.currentTarget.value = ''; }} />
                  {uploading ? 'Subiendo…' : '+ Subir imágenes'}
                </label>
                <span className="text-[11px] text-ink-faint">JPG/PNG/WebP · hasta {CONTENT_MAX_IMG_MB} MB c/u. Los videos van por link (más ligero).</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {draft.media.map((m, i) => (m.kind === 'image' ? (
                  <div key={`i${i}`} className="relative">
                    <img src={m.url} alt={m.name || 'imagen'} className="h-16 w-16 rounded-lg border border-cream-dark object-cover" />
                    <button type="button" onClick={() => removeMedia(i)}
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white shadow">✕</button>
                  </div>
                ) : null))}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={() => setDraft(null)} disabled={saving} className="rounded-2xl px-4 py-2 text-sm font-semibold text-ink-soft hover:bg-cream-dark/40 disabled:opacity-60">Cancelar</button>
            <button onClick={save} disabled={saving} className="rounded-2xl bg-brand px-4 py-2 text-sm font-semibold text-cream hover:opacity-90 disabled:opacity-60">{saving ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </Card>
      )}

      {/* Lista de publicaciones */}
      {view === 'lista' && (loading ? (
        <p className="text-ink-faint">Cargando…</p>
      ) : posts.length === 0 && !draft ? (
        <Card className="p-8 text-center text-ink-faint">Aún no tienes contenido planeado. Toca <span className="font-semibold text-ink">+ Nueva</span> para tu primera publicación.</Card>
      ) : (
        <section className="space-y-3">
          {posts.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-ink">{CHANNEL_ICON[p.channel]} {CONTENT_CHANNEL_LABEL[p.channel]}</span>
                    <Badge tone={CONTENT_TONE[p.status]}>{CONTENT_STATUS_LABEL[p.status]}</Badge>
                    <span className="text-xs text-ink-faint">📅 {fmtDate(p.scheduledFor)}</span>
                  </div>
                  {p.title && <p className="mt-1 text-sm font-medium text-ink">{p.title}</p>}
                  {p.caption && <p className="mt-1 whitespace-pre-wrap text-xs text-ink-soft line-clamp-4">{p.caption}</p>}
                  {p.link && <a href={p.link} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-brand underline">Ver post publicado</a>}
                  {p.media.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {p.media.filter((m) => m.kind === 'image').map((m, i) => (
                        <a key={`li${i}`} href={m.url} target="_blank" rel="noreferrer">
                          <img src={m.url} alt="" className="h-12 w-12 rounded-lg border border-cream-dark object-cover" />
                        </a>
                      ))}
                      {p.media.filter((m) => m.kind === 'video' && m.url.trim()).map((m, i) => (
                        <a key={`lv${i}`} href={m.url} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-full bg-cream-dark/60 px-2.5 py-1 text-[11px] font-semibold text-ink-soft hover:bg-cream-dark">🎬 Ver video {i + 1}</a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                {p.caption && <button onClick={() => copyCaption(p.caption)} className="rounded-2xl border border-cream-dark px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-cream-dark/40">Copiar copy</button>}
                <select value={p.status} onChange={(e) => changeStatus(p, e.target.value as ContentStatus)} className="rounded-2xl border border-cream-dark bg-white px-2 py-1.5 text-xs font-semibold text-ink-soft">
                  {CONTENT_STATUSES.map((s) => <option key={s} value={s}>{CONTENT_STATUS_LABEL[s]}</option>)}
                </select>
                <button onClick={() => setDraft({ ...p })} className="rounded-2xl border border-cream-dark px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-cream-dark/40">Editar</button>
                {confirmDel === p.id ? (
                  <>
                    <span className="self-center text-xs text-red-700">¿Seguro?</span>
                    <button onClick={() => remove(p.id)} className="rounded-2xl bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">Sí</button>
                    <button onClick={() => setConfirmDel(null)} className="rounded-2xl px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-cream-dark/40">No</button>
                  </>
                ) : (
                  <button onClick={() => setConfirmDel(p.id)} className="rounded-2xl border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50">Borrar</button>
                )}
              </div>
            </Card>
          ))}
        </section>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Pestaña PRODUCTOS (catálogo "Recomendados Move yA")
// ---------------------------------------------------------------------------
const emptyDraft = (sort: number): PlatformProductRow => ({
  id: '', title: '', description: '', imageUrl: '', url: '', category: '', priceText: '', active: true, sortOrder: sort,
});

function ProductosTab() {
  const [items, setItems] = useState<PlatformProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<PlatformProductRow | null>(null); // crear/editar
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetchAllPlatformProducts().then(setItems).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const save = async () => {
    if (!draft) return;
    if (!draft.title.trim() || !draft.url.trim()) { notifyError('producto', 'Título y link son obligatorios.'); return; }
    setSaving(true);
    const ok = await savePlatformProduct({
      id: draft.id || undefined,
      title: draft.title.trim(),
      description: draft.description.trim(),
      imageUrl: draft.imageUrl.trim(),
      url: draft.url.trim(),
      category: draft.category.trim(),
      priceText: draft.priceText.trim(),
      active: draft.active,
      sortOrder: Number(draft.sortOrder) || 0,
    });
    setSaving(false);
    if (ok) { notifySuccess(draft.id ? 'Producto actualizado.' : 'Producto agregado.'); setDraft(null); load(); }
    else notifyError('producto', 'No se pudo guardar.');
  };

  const toggleActive = async (p: PlatformProductRow) => {
    const ok = await savePlatformProduct({ ...p, id: p.id, active: !p.active });
    if (ok) load(); else notifyError('producto', 'No se pudo actualizar.');
  };

  const remove = async (id: string) => {
    const ok = await deletePlatformProduct(id);
    setConfirmDel(null);
    if (ok) { notifySuccess('Producto eliminado.'); load(); }
    else notifyError('producto', 'No se pudo eliminar.');
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-ink">Recomendados Move yA</h2>
          <p className="text-xs text-ink-faint">Productos/links que aparecen en la tienda de los estudios que activan el programa.</p>
        </div>
        {!draft && (
          <button
            onClick={() => setDraft(emptyDraft(items.length))}
            className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-cream hover:opacity-90"
          >
            + Agregar
          </button>
        )}
      </div>

      {/* Formulario crear/editar */}
      {draft && (
        <Card className="p-4 space-y-3">
          <h3 className="text-sm font-semibold text-ink">{draft.id ? 'Editar producto' : 'Nuevo producto'}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-ink-soft">Título *</span>
              <input className={inp} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Proteína Whey 1kg" />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-ink-soft">Link (afiliado o tu tienda) *</span>
              <input className={inp} value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="https://..." />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-ink-soft">Descripción</span>
              <input className={inp} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Proteína de suero, sabor chocolate." />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-ink-soft">Imagen (URL)</span>
              <input className={inp} value={draft.imageUrl} onChange={(e) => setDraft({ ...draft, imageUrl: e.target.value })} placeholder="https://.../foto.jpg" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-soft">Categoría</span>
              <input className={inp} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} placeholder="Suplementos" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-soft">Precio (texto)</span>
              <input className={inp} value={draft.priceText} onChange={(e) => setDraft({ ...draft, priceText: e.target.value })} placeholder="$499 MXN" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-soft">Orden</span>
              <input type="number" className={inp} value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: Math.floor(Number(e.target.value) || 0) })} />
            </label>
            <label className="flex items-center gap-2 pt-6 text-sm text-ink-soft">
              <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
              Activo (visible)
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setDraft(null)} disabled={saving} className="rounded-2xl px-4 py-2 text-sm font-semibold text-ink-soft hover:bg-cream-dark/40 disabled:opacity-60">Cancelar</button>
            <button onClick={save} disabled={saving} className="rounded-2xl bg-brand px-4 py-2 text-sm font-semibold text-cream hover:opacity-90 disabled:opacity-60">{saving ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </Card>
      )}

      {/* Lista */}
      {loading ? (
        <p className="text-ink-faint">Cargando…</p>
      ) : items.length === 0 && !draft ? (
        <Card className="p-8 text-center text-ink-faint">
          Aún no tienes productos. Toca <span className="font-semibold text-ink">+ Agregar</span> para crear el primero.
        </Card>
      ) : (
        <section className="space-y-3">
          {items.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold text-ink">{p.title}</span>
                    {p.active ? <Badge tone="success">Activo</Badge> : <Badge tone="neutral">Oculto</Badge>}
                    {p.category && <Badge tone="neutral">{p.category}</Badge>}
                  </div>
                  {p.description && <p className="mt-1 text-xs text-ink-faint">{p.description}</p>}
                  <a href={p.url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs text-brand underline">{p.url}</a>
                </div>
                {p.priceText && <span className="shrink-0 text-sm font-bold text-ink">{p.priceText}</span>}
              </div>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button onClick={() => toggleActive(p)} className="rounded-2xl border border-cream-dark px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-cream-dark/40">
                  {p.active ? 'Ocultar' : 'Activar'}
                </button>
                <button onClick={() => setDraft({ ...p })} className="rounded-2xl border border-cream-dark px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-cream-dark/40">Editar</button>
                {confirmDel === p.id ? (
                  <>
                    <span className="self-center text-xs text-red-700">¿Seguro?</span>
                    <button onClick={() => remove(p.id)} className="rounded-2xl bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">Sí, borrar</button>
                    <button onClick={() => setConfirmDel(null)} className="rounded-2xl px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-cream-dark/40">No</button>
                  </>
                ) : (
                  <button onClick={() => setConfirmDel(p.id)} className="rounded-2xl border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50">Borrar</button>
                )}
              </div>
            </Card>
          ))}
        </section>
      )}
    </>
  );
}
