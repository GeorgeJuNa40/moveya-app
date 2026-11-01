import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, StatCard, Badge } from '../../components/ui';
import { fetchMoveyaOverview, monthlyUsd, trialExpired, type MoveyaStudioRow } from '../../lib/platform';
import { FOUNDER_CODE } from '../../lib/plans';

// Panel de CREADOR (dueño de Move yA): consolidado de todo lo que vende la
// plataforma. Página independiente (fuera del AppShell de estudio), oculta y
// protegida: solo la abre quien tiene platform_owner.
const usd = (n: number) => `$${n.toFixed(2)}`;
const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const PLAN_LABEL: Record<string, string> = { inicio: 'Inicio', pro: 'Pro', premium: 'Premium' };

function estadoBadge(r: MoveyaStudioRow) {
  if (r.status === 'ACTIVE') return <Badge tone="success">Pagando</Badge>;
  if (r.status === 'TRIALING') return trialExpired(r)
    ? <Badge tone="danger">Prueba vencida</Badge>
    : <Badge tone="warning">En prueba</Badge>;
  if (r.status === 'PAST_DUE') return <Badge tone="danger">Vencido</Badge>;
  if (r.status === 'CANCELED') return <Badge tone="neutral">Cancelado</Badge>;
  return <Badge tone="neutral">—</Badge>;
}

const FOUNDER_CAP = 10;

export default function MoveyaPanel() {
  const [rows, setRows] = useState<MoveyaStudioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  useEffect(() => {
    fetchMoveyaOverview()
      .then((r) => { setRows(r); if (!r.length) setErr(true); })
      .catch(() => setErr(true))
      .finally(() => setLoading(false));
  }, []);

  const m = useMemo(() => {
    const paying = rows.filter((r) => r.status === 'ACTIVE');
    const trialing = rows.filter((r) => r.status === 'TRIALING' && !trialExpired(r));
    const foundersUsed = rows.filter((r) => r.founder && r.status === 'ACTIVE').length;
    const mrr = rows.reduce((a, r) => a + monthlyUsd(r), 0);
    return { paying: paying.length, trialing: trialing.length, foundersUsed, mrr };
  }, [rows]);

  const ordered = useMemo(() => {
    const rank: Record<string, number> = { ACTIVE: 0, TRIALING: 1, PAST_DUE: 2, CANCELED: 3 };
    return [...rows].sort((a, b) => (rank[a.status ?? ''] ?? 9) - (rank[b.status ?? ''] ?? 9));
  }, [rows]);

  return (
    <div className="min-h-screen bg-cream">
      <header className="sticky top-0 z-10 border-b border-cream-dark bg-cream/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-faint">Panel de creador</p>
            <h1 className="text-lg font-bold text-ink">Move yA · Negocio</h1>
          </div>
          <Link to="/admin" className="rounded-full border border-cream-dark px-4 py-2 text-sm font-semibold text-ink-soft hover:bg-cream-dark/40">
            ← Volver
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        {loading ? (
          <p className="text-ink-faint">Cargando…</p>
        ) : err ? (
          <Card className="p-6 text-center text-ink-soft">
            No se pudo cargar el panel. Verifica que tu cuenta tenga acceso de creador.
          </Card>
        ) : (
          <>
            {/* Métricas clave */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="MRR (USD)" value={usd(m.mrr)} hint="Ingreso recurrente mensual" icon="💵" />
              <StatCard label="Pagando" value={m.paying} hint="Suscripciones activas" icon="✅" />
              <StatCard label="En prueba" value={m.trialing} hint="Pruebas vigentes" icon="⏳" />
              <StatCard label="Fundadores" value={`${m.foundersUsed}/${FOUNDER_CAP}`} hint={`Código ${FOUNDER_CODE}`} icon="⭐" />
            </div>

            {/* Estudios */}
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
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-ink-faint">
                      <span>Pasarela: {r.provider === 'mercadopago' ? 'Mercado Pago' : r.provider === 'stripe' ? 'Stripe' : '—'}</span>
                      <span>·</span>
                      <span>Cobro en línea: {r.stripeOk ? 'Stripe ✓' : r.mpOk ? 'MP ✓' : 'sin pasarela'}</span>
                    </div>
                  </Card>
                );
              })}
            </section>

            <p className="pt-2 text-center text-xs text-ink-faint">
              El MRR cuenta solo suscripciones activas (pagando). Las comisiones de paquetes/tienda se ven en tu panel de Stripe/Mercado Pago.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
