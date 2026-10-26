import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../lib/store';
import { PageHeader, Card, Button, StatCard, EmptyState } from '../../components/ui';
import { usd } from '../../lib/format';
import {
  fetchClassLogs, ensureClassLogs, coachConfirmClass, logStatus, type ClassLog,
} from '../../lib/coachClasses';
import { notifySuccess } from '../../lib/notify';

const MONTH_FMT = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const d2 = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${d2(d.getMonth() + 1)}-${d2(d.getDate())}`;

// Panel del coach para confirmar sus clases dadas (incluye semanas/meses pasados),
// independiente del calendario de 7 días. Cada clase necesita su confirmación +
// la del estudio para contar en el pago.
export default function CoachClassesConfirm() {
  const { currentStudio } = useStore();
  const studioId = currentStudio!.id;

  const months = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      return { key: `${d.getFullYear()}-${d.getMonth()}`, label: cap(MONTH_FMT.format(d)), start: ymd(d), end: ymd(end) };
    });
  }, []);
  const [monthKey, setMonthKey] = useState(months[0].key);
  const month = months.find((m) => m.key === monthKey) ?? months[0];

  const [logs, setLogs] = useState<ClassLog[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = () => {
    setLoading(true);
    void ensureClassLogs(month.start, month.end)
      .then(() => fetchClassLogs(studioId, month.start, month.end))
      .then((l) => { setLogs(l); setLoading(false); });
  };
  useEffect(reload, [studioId, month.start, month.end]);

  const ordered = useMemo(() => logs.slice().sort((a, b) => b.occurredOn.localeCompare(a.occurredOn)), [logs]);
  const pendingCount = logs.filter((l) => !l.coachConfirmedAt).length;
  const payConfirmed = logs.filter((l) => logStatus(l) === 'confirmada').reduce((a, l) => a + l.amount, 0);

  const confirm = async (l: ClassLog) => {
    if (!l.sessionId) return;
    setBusy(l.id);
    const ok = await coachConfirmClass(l.sessionId, l.occurredOn);
    if (ok) { notifySuccess('Clase confirmada ✓'); reload(); }
    setBusy(null);
  };

  return (
    <>
      <PageHeader title="Clases por confirmar" subtitle="Marca tu pase de lista y confirma la clase — los asistentes se toman solos de ahí. Incluye semanas pasadas." />

      <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
        {months.map((m) => (
          <button
            key={m.key}
            onClick={() => setMonthKey(m.key)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
              m.key === month.key ? 'bg-brand text-cream-light shadow-card' : 'bg-white text-ink-soft ring-1 ring-black/[0.06]'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <StatCard label="Por confirmar" value={pendingCount} hint="clases que aún no confirmas" icon="!" />
        <StatCard label="Pago confirmado" value={usd(payConfirmed)} hint="solo clases con doble confirmación" />
      </div>

      {loading ? (
        <p className="text-sm text-ink-faint">Cargando…</p>
      ) : ordered.length === 0 ? (
        <EmptyState>No hay clases registradas este mes.</EmptyState>
      ) : (
        <Card className="p-5">
          <div className="divide-y divide-cream-dark">
            {ordered.map((l) => {
              const coachOk = !!l.coachConfirmedAt;
              const studioOk = !!l.staffConfirmedAt;
              return (
                <div key={l.id} className="flex flex-wrap items-center gap-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{l.title || 'Clase'}</p>
                    <p className="text-xs text-ink-faint">{l.occurredOn}{l.capacity ? ` · cupo ${l.capacity}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-semibold">
                    <span className={coachOk ? 'text-green-700' : 'text-amber-700'}>Tú {coachOk ? '✓' : '—'}</span>
                    <span className={studioOk ? 'text-green-700' : 'text-amber-700'}>Estudio {studioOk ? '✓' : '—'}</span>
                  </div>
                  {coachOk && <span className="text-xs text-ink-faint">{l.attendees} asist.</span>}
                  <Button disabled={busy === l.id} onClick={() => confirm(l)}>
                    {coachOk ? 'Actualizar' : 'Confirmar clase dada ✓'}
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </>
  );
}
