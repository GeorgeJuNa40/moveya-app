import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, StatCard, Badge } from '../../components/ui';
import { notifySuccess, notifyError } from '../../lib/notify';
import {
  fetchMoveyaOverview, monthlyUsd, trialExpired, type MoveyaStudioRow,
  fetchAllPlatformProducts, savePlatformProduct, deletePlatformProduct, type PlatformProductRow,
  fetchLeads, saveLead, deleteLead, type MoveyaLead, type LeadStatus, LEAD_STATUSES, LEAD_STATUS_LABEL,
  fetchWaConfig, saveWaConfig, DEFAULT_SALES_KB, type MoveyaWaConfig,
  fetchWaConvos, fetchWaThread, markWaRead, setWaMode, sendWaReply,
  type WaConversation, type WaMessage,
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

type Tab = 'resumen' | 'crm' | 'whatsapp' | 'productos';

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
            {([['resumen', 'Resumen'], ['crm', 'CRM'], ['whatsapp', 'WhatsApp'], ['productos', 'Productos Move yA']] as [Tab, string][]).map(([k, label]) => (
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
        {tab === 'resumen' ? <ResumenTab /> : tab === 'crm' ? <CrmTab /> : tab === 'whatsapp' ? <WhatsAppTab /> : <ProductosTab />}
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
// Pestaña CRM (leads / prospectos de estudios)
// ---------------------------------------------------------------------------
const LEAD_TONE: Record<LeadStatus, 'neutral' | 'brand' | 'warning' | 'success' | 'danger'> = {
  nuevo: 'neutral', contactado: 'brand', demo: 'warning', prueba: 'warning', pagando: 'success', perdido: 'danger',
};
const waLink = (phone: string) => `https://wa.me/${phone.replace(/[^\d]/g, '')}`;
const emptyLead = (): MoveyaLead => ({
  id: '', name: '', ownerName: '', phone: '', email: '', city: '', status: 'nuevo', source: '', notes: '', nextFollowup: null, createdAt: '',
});

function CrmTab() {
  const [leads, setLeads] = useState<MoveyaLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<LeadStatus | 'todos'>('todos');
  const [draft, setDraft] = useState<MoveyaLead | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

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

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-ink">Leads / prospectos</h2>
          <p className="text-xs text-ink-faint">Estudios y gyms por contactar y dar seguimiento.</p>
        </div>
        {!draft && (
          <button onClick={() => setDraft(emptyLead())} className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-cream hover:opacity-90">+ Agregar</button>
        )}
      </div>

      {/* Filtro por etapa */}
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

      {/* Lista */}
      {loading ? (
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
      )}
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
