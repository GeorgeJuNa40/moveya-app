import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../lib/store';
import { PageHeader, Card, Button, Badge, EmptyState } from '../../components/ui';
import { notifySuccess } from '../../lib/notify';
import { fetchProviderAppointments, updateAppointment } from '../../lib/appointments';
import type { ServiceAppointment, AppointmentStatus } from '../../lib/types';

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  requested: 'Solicitada', scheduled: 'Agendada', done: 'Realizada', cancelled: 'Cancelada',
};
const STATUS_TONE: Record<AppointmentStatus, 'neutral' | 'success' | 'warning' | 'brand'> = {
  requested: 'warning', scheduled: 'brand', done: 'success', cancelled: 'neutral',
};
const fmt = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

// Portal del proveedor (nutriólogo/kinesiólogo/convenio): ve y gestiona SOLO las
// citas de su servicio. No ve datos de miembros ni comisiones (eso es del estudio).
export default function ProviderDashboard() {
  const { currentUser } = useStore();
  const serviceId = currentUser?.providerServiceId;
  const [appts, setAppts] = useState<ServiceAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'open' | 'done' | 'all'>('open');

  const reload = async () => {
    if (!serviceId) { setLoading(false); return; }
    setLoading(true);
    setAppts(await fetchProviderAppointments(serviceId));
    setLoading(false);
  };
  useEffect(() => { void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [serviceId]);

  const shown = useMemo(() => {
    if (filter === 'open') return appts.filter((a) => a.status === 'requested' || a.status === 'scheduled');
    if (filter === 'done') return appts.filter((a) => a.status === 'done');
    return appts;
  }, [appts, filter]);

  const patch = async (id: string, p: Parameters<typeof updateAppointment>[1]) => {
    if (await updateAppointment(id, p)) await reload();
  };

  if (!serviceId) {
    return (
      <>
        <PageHeader title="Mis citas" subtitle="Portal del proveedor" />
        <EmptyState>Tu cuenta aún no está ligada a un servicio. Pídele al estudio el enlace de invitación de proveedor.</EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Mis citas" subtitle="Agenda de tu servicio" />
      <div className="mb-3 flex gap-1 text-sm">
        {(['open', 'done', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full ${filter === f ? 'bg-brand text-cream-light' : 'bg-cream-dark/50 text-ink-soft'}`}
          >
            {f === 'open' ? 'Abiertas' : f === 'done' ? 'Realizadas' : 'Todas'}
          </button>
        ))}
      </div>

      {loading ? (
        <Card className="p-6 text-center text-sm text-ink-faint">Cargando…</Card>
      ) : shown.length === 0 ? (
        <EmptyState>No hay citas {filter === 'open' ? 'abiertas' : filter === 'done' ? 'realizadas' : ''}.</EmptyState>
      ) : (
        <div className="space-y-3">
          {shown.map((a) => (
            <Card key={a.id} className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-ink">{a.userName ?? 'Cliente'}</p>
                  <p className="text-sm text-ink-faint">
                    Solicitada: {fmt(a.preferredAt ?? a.createdAt)}
                    {a.scheduledFor ? ` · Agendada: ${fmt(a.scheduledFor)}` : ''}
                  </p>
                  {a.note && <p className="text-sm text-ink-soft mt-1">“{a.note}”</p>}
                </div>
                <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
              </div>

              {a.status === 'requested' && <ScheduleRow onSchedule={(iso) => patch(a.id, { status: 'scheduled', scheduledFor: iso })} onCancel={() => patch(a.id, { status: 'cancelled' })} />}
              {a.status === 'scheduled' && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button onClick={async () => { await patch(a.id, { status: 'done' }); notifySuccess('Cita marcada como realizada.'); }}>Marcar realizada</Button>
                  <Button variant="secondary" onClick={() => patch(a.id, { status: 'cancelled' })}>Cancelar</Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      <style>{`.pinp{width:100%;border:1px solid #E8E3D6;border-radius:.75rem;padding:.55rem .7rem;background:#fff;outline:none}.pinp:focus{box-shadow:0 0 0 2px var(--brand-primary)}`}</style>
    </>
  );
}

function ScheduleRow({ onSchedule, onCancel }: { onSchedule: (iso: string) => void; onCancel: () => void }) {
  const [when, setWhen] = useState('');
  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <input type="datetime-local" className="pinp !w-auto" value={when} onChange={(e) => setWhen(e.target.value)} />
      <Button disabled={!when} onClick={() => when && onSchedule(new Date(when).toISOString())}>Agendar</Button>
      <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
    </div>
  );
}
