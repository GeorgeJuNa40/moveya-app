import { useMemo, useState } from 'react';
import { Card, Badge, EmptyState } from './ui';
import type { ServiceAppointment, AppointmentStatus } from '../lib/types';

const WD = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const localKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  requested: 'Solicitada', scheduled: 'Agendada', done: 'Realizada', cancelled: 'Cancelada',
};
const STATUS_TONE: Record<AppointmentStatus, 'neutral' | 'success' | 'warning' | 'brand'> = {
  requested: 'warning', scheduled: 'brand', done: 'success', cancelled: 'neutral',
};
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

// Calendario semanal de CITAS (servicios). Muestra las citas con fecha agendada
// (scheduledFor); las solicitudes sin fecha se gestionan en la vista de lista.
// Reutilizable: admin (muestra servicio) y proveedor (solo sus citas).
export default function AppointmentsCalendar({
  appointments, showService = false, renderAction,
}: {
  appointments: ServiceAppointment[];
  showService?: boolean;
  renderAction?: (a: ServiceAppointment) => React.ReactNode;
}) {
  // Inicio de la ventana de 7 días (se puede mover con ‹ ›).
  const [offset, setOffset] = useState(0); // en semanas desde hoy
  const [sel, setSel] = useState(0); // día seleccionado dentro de la ventana

  const days = useMemo(() => {
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    base.setDate(base.getDate() + offset * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d;
    });
  }, [offset]);

  // Agrupa las citas AGENDADAS por día local.
  const byDay = useMemo(() => {
    const m = new Map<string, ServiceAppointment[]>();
    for (const a of appointments) {
      if (!a.scheduledFor || a.status === 'cancelled') continue;
      const k = localKey(new Date(a.scheduledFor));
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(a);
    }
    for (const list of m.values()) list.sort((x, y) => (x.scheduledFor ?? '').localeCompare(y.scheduledFor ?? ''));
    return m;
  }, [appointments]);

  const selDay = days[sel] ?? days[0];
  const selList = byDay.get(localKey(selDay)) ?? [];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button onClick={() => { setOffset((o) => o - 1); setSel(0); }} className="rounded-full bg-cream-dark/50 px-3 py-1 text-sm text-ink-soft">‹</button>
        <span className="text-sm font-medium text-ink-soft">
          {days[0].toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} – {days[6].toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
        </span>
        <button onClick={() => { setOffset((o) => o + 1); setSel(0); }} className="rounded-full bg-cream-dark/50 px-3 py-1 text-sm text-ink-soft">›</button>
      </div>

      <div className="mb-4 grid grid-cols-7 gap-1">
        {days.map((d, i) => {
          const count = (byDay.get(localKey(d)) ?? []).length;
          const active = i === sel;
          return (
            <button
              key={i}
              onClick={() => setSel(i)}
              className={`rounded-xl px-1 py-2 text-center ${active ? 'bg-brand text-cream-light' : 'bg-cream-dark/40 text-ink-soft'}`}
            >
              <div className="text-[11px]">{WD[d.getDay()]}</div>
              <div className="text-sm font-bold">{d.getDate()}</div>
              {count > 0 && <div className={`mx-auto mt-0.5 h-1.5 w-1.5 rounded-full ${active ? 'bg-cream-light' : 'bg-brand'}`} />}
            </button>
          );
        })}
      </div>

      {selList.length === 0 ? (
        <EmptyState>Sin citas agendadas este día.</EmptyState>
      ) : (
        <div className="space-y-2">
          {selList.map((a) => (
            <Card key={a.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-brand">{a.scheduledFor ? hhmm(a.scheduledFor) : ''}</p>
                <p className="truncate text-sm font-medium text-ink">
                  {a.userName ?? 'Cliente'}{showService ? ` · ${a.serviceName}` : ''}
                </p>
                {a.note && <p className="truncate text-xs text-ink-faint">“{a.note}”</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
                {renderAction?.(a)}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
