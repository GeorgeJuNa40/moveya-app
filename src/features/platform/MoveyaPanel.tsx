import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, StatCard, Badge } from '../../components/ui';
import { notifySuccess, notifyError } from '../../lib/notify';
import {
  fetchMoveyaOverview, monthlyUsd, trialExpired, type MoveyaStudioRow,
  fetchAllPlatformProducts, savePlatformProduct, deletePlatformProduct, type PlatformProductRow,
} from '../../lib/platform';
import { FOUNDER_CODE } from '../../lib/plans';

// Panel de CREADOR (dueño de Move yA). Página independiente, oculta y protegida
// (solo platform_owner). Dos pestañas: Resumen del negocio y gestión del
// catálogo "Recomendados Move yA".
const usd = (n: number) => `$${n.toFixed(2)}`;
const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const PLAN_LABEL: Record<string, string> = { inicio: 'Inicio', pro: 'Pro', premium: 'Premium' };
const inp = 'w-full rounded-xl border border-cream-dark bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 ring-brand';
const FOUNDER_CAP = 10;

type Tab = 'resumen' | 'productos';

export default function MoveyaPanel() {
  const [tab, setTab] = useState<Tab>('resumen');

  return (
    <div className="min-h-screen bg-cream">
      <header className="sticky top-0 z-10 border-b border-cream-dark bg-cream/90 backdrop-blur">
        <div className="mx-auto max-w-4xl px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-faint">Panel de creador</p>
              <h1 className="text-lg font-bold text-ink">Move yA · Negocio</h1>
            </div>
            <Link to="/admin" className="rounded-full border border-cream-dark px-4 py-2 text-sm font-semibold text-ink-soft hover:bg-cream-dark/40">
              ← Volver
            </Link>
          </div>
          {/* Menú de pestañas */}
          <div className="mt-3 flex gap-2">
            {([['resumen', 'Resumen'], ['productos', 'Productos Move yA']] as [Tab, string][]).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                  tab === k ? 'bg-brand text-cream' : 'text-ink-soft hover:bg-cream-dark/40'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        {tab === 'resumen' ? <ResumenTab /> : <ProductosTab />}
      </main>
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

function ResumenTab() {
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
    const paying = rows.filter((r) => r.status === 'ACTIVE').length;
    const trialing = rows.filter((r) => r.status === 'TRIALING' && !trialExpired(r)).length;
    const foundersUsed = rows.filter((r) => r.founder && r.status === 'ACTIVE').length;
    const mrr = rows.reduce((a, r) => a + monthlyUsd(r), 0);
    return { paying, trialing, foundersUsed, mrr };
  }, [rows]);

  const ordered = useMemo(() => {
    const rank: Record<string, number> = { ACTIVE: 0, TRIALING: 1, PAST_DUE: 2, CANCELED: 3 };
    return [...rows].sort((a, b) => (rank[a.status ?? ''] ?? 9) - (rank[b.status ?? ''] ?? 9));
  }, [rows]);

  if (loading) return <p className="text-ink-faint">Cargando…</p>;
  if (err) return <Card className="p-6 text-center text-ink-soft">No se pudo cargar. Verifica que tu cuenta tenga acceso de creador.</Card>;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="MRR (USD)" value={usd(m.mrr)} hint="Ingreso recurrente mensual" icon="💵" />
        <StatCard label="Pagando" value={m.paying} hint="Suscripciones activas" icon="✅" />
        <StatCard label="En prueba" value={m.trialing} hint="Pruebas vigentes" icon="⏳" />
        <StatCard label="Fundadores" value={`${m.foundersUsed}/${FOUNDER_CAP}`} hint={`Código ${FOUNDER_CODE}`} icon="⭐" />
      </div>

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
