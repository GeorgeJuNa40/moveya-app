import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../lib/store';
import { PageHeader, Card, Badge, Button, StatCard, EmptyState } from '../../components/ui';
import { usd } from '../../lib/format';
import {
  fetchClassLogs, staffConfirmClass, setClassAmount, logStatus, type ClassLog,
} from '../../lib/coachClasses';
import { notifySuccess } from '../../lib/notify';
import type { CoachPay } from '../../lib/types';

const MONTH_FMT = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const d2 = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${d2(d.getMonth() + 1)}-${d2(d.getDate())}`;
const payModeLabel: Record<CoachPay['mode'], string> = {
  por_clase: 'por clase', por_asistente: 'por asistente', fijo: 'sueldo fijo',
};

// Base de sueldo fijo aplicable a un mes (si es quincenal, 2 por mes).
const fixedBaseForMonth = (pay?: CoachPay): number =>
  pay?.mode === 'fijo' ? (pay.rate || 0) * (pay.period === 'quincena' ? 2 : 1) : 0;

export default function CoachClasses() {
  const { currentStudio, studioUsers } = useStore();
  const studioId = currentStudio!.id;
  const coaches = studioUsers('COACH');
  const coachById = useMemo(() => new Map(coaches.map((c) => [c.id, c])), [coaches]);

  // Selector de mes: mes actual + 5 anteriores.
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
  const [draftAmt, setDraftAmt] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const reload = () => void fetchClassLogs(studioId, month.start, month.end).then(setLogs);
  useEffect(reload, [studioId, month.start, month.end]);

  // Agrupa por coach.
  const groups = useMemo(() => {
    const m = new Map<string, ClassLog[]>();
    for (const l of logs) {
      if (!m.has(l.coachId)) m.set(l.coachId, []);
      m.get(l.coachId)!.push(l);
    }
    return [...m.entries()].map(([coachId, list]) => {
      const confirmed = list.filter((l) => logStatus(l) === 'confirmada');
      const pending = list.filter((l) => logStatus(l) === 'pendiente');
      const classesTotal = confirmed.reduce((a, l) => a + l.amount, 0);
      const base = fixedBaseForMonth(coachById.get(coachId)?.coachPay);
      return { coachId, list, confirmed, pending, classesTotal, base, total: classesTotal + base };
    });
  }, [logs, coachById]);

  const grandTotal = groups.reduce((a, g) => a + g.total, 0);
  const totalConfirmed = logs.filter((l) => logStatus(l) === 'confirmada').length;
  const totalPending = logs.filter((l) => logStatus(l) === 'pendiente').length;

  const amtValue = (l: ClassLog) => (l.id in draftAmt ? draftAmt[l.id] : String(l.amount));
  const confirm = async (l: ClassLog) => {
    setBusy(l.id);
    const amount = Math.max(0, Number(amtValue(l)) || 0);
    const ok = await staffConfirmClass(l.id, undefined, amount);
    if (ok) { notifySuccess('Clase confirmada ✓'); reload(); }
    setBusy(null);
  };
  const saveAmount = async (l: ClassLog) => {
    setBusy(l.id);
    const amount = Math.max(0, Number(amtValue(l)) || 0);
    const ok = await setClassAmount(l.id, amount);
    if (ok) { notifySuccess('Monto actualizado'); reload(); }
    setBusy(null);
  };

  return (
    <>
      <PageHeader title="Clases por coach" subtitle="Confirma las clases dadas y revisa cuánto pagar a cada coach" />

      {/* Selector de mes */}
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

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total a pagar" value={usd(grandTotal)} hint="clases confirmadas + sueldos fijos" />
        <StatCard label="Clases confirmadas" value={totalConfirmed} hint="con doble confirmación" icon="✓" />
        <StatCard label="Pendientes" value={totalPending} hint="falta confirmación del estudio" icon="!" />
      </div>

      {groups.length === 0 ? (
        <EmptyState>
          Aún no hay clases registradas este mes. Cuando un coach confirme "clase dada" en su app, aparecerá aquí para que la confirmes.
        </EmptyState>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => {
            const coach = coachById.get(g.coachId);
            const pay = coach?.coachPay;
            return (
              <Card key={g.coachId} className="p-5">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-ink">{coach?.fullName ?? 'Coach'}</h3>
                    <p className="text-xs text-ink-faint">
                      {pay ? `Pago ${payModeLabel[pay.mode]}` : 'Sin config de pago'}
                      {g.base > 0 && ` · base ${usd(g.base)}/mes`}
                      {` · ${g.confirmed.length} confirmadas`}
                      {g.pending.length > 0 && ` · ${g.pending.length} pendientes`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-ink">{usd(g.total)}</p>
                    <p className="text-[11px] text-ink-faint">a pagar este mes</p>
                  </div>
                </div>

                <div className="divide-y divide-cream-dark">
                  {g.list.map((l) => {
                    const done = logStatus(l) === 'confirmada';
                    return (
                      <div key={l.id} className="flex flex-wrap items-center gap-2 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">{l.title || 'Clase'}</p>
                          <p className="text-xs text-ink-faint">
                            {l.occurredOn} · {l.attendees}/{l.capacity || '—'} {l.isFull ? '· llena' : ''}
                          </p>
                        </div>
                        <Badge tone={done ? 'success' : 'warning'}>{done ? 'Confirmada' : 'Pendiente'}</Badge>
                        <div className="flex items-center gap-1">
                          <span className="text-sm text-ink-faint">$</span>
                          <input
                            type="number" min="0" step="0.01"
                            className="w-24 rounded-lg border border-cream-dark px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                            value={amtValue(l)}
                            onChange={(e) => setDraftAmt((p) => ({ ...p, [l.id]: e.target.value }))}
                          />
                        </div>
                        {done ? (
                          <Button variant="ghost" disabled={busy === l.id} onClick={() => saveAmount(l)}>Guardar monto</Button>
                        ) : (
                          <Button disabled={busy === l.id} onClick={() => confirm(l)}>Confirmar ✓</Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
