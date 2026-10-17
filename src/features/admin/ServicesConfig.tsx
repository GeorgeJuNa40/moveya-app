import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../lib/store';
import { PageHeader, Card, Toggle, Button, Badge, EmptyState } from '../../components/ui';
import { notifySuccess } from '../../lib/notify';
import {
  fetchAppointments, updateAppointment, serviceCommission,
} from '../../lib/appointments';
import type { OptionalService, ServiceAppointment, AppointmentStatus } from '../../lib/types';

// Servicios opcionales: el estudio los edita (nombre, descripción, WhatsApp del
// proveedor, precio y comisión). El alumno paga DIRECTO al proveedor; el estudio
// lleva el control de las citas y cobra su comisión (ver "Consultas" abajo).
export default function ServicesConfig() {
  const { currentStudio, addService, updateService, removeService } = useStore();
  const services = currentStudio!.services;
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [wa, setWa] = useState('');

  const add = () => {
    if (!name.trim()) return;
    addService(name.trim(), desc.trim(), wa.trim());
    setName('');
    setDesc('');
    setWa('');
  };

  return (
    <>
      <PageHeader title="Servicios Opcionales" subtitle="Módulos de bienestar que ofreces a tus alumnos" />

      <Card className="p-5 mb-6 bg-cream-dark/30">
        <p className="text-sm text-ink-soft">
          Cada servicio lleva al alumno <b>directo al WhatsApp de quien lo brinda</b> (nutriólogo,
          kinesiólogo, etc.). Si activas <b>“Permitir agendar”</b>, el alumno también podrá solicitar
          una cita desde la app: la verás en <b>Consultas</b> (abajo), donde la agendas, la marcas
          realizada y registras tu <b>comisión</b>. El alumno paga directo al proveedor.
        </p>
      </Card>

      {/* Servicios existentes (editables) */}
      <div className="space-y-4">
        {services.map((sv) => (
          <ServiceCard key={sv.id} sv={sv} ceuCode={currentStudio!.ceuCode} updateService={updateService} removeService={removeService} />
        ))}
        {services.length === 0 && (
          <Card className="p-6 text-center text-sm text-ink-faint">
            Aún no has agregado servicios. Agrega el primero abajo.
          </Card>
        )}
      </div>

      {/* Agregar nuevo */}
      <Card className="p-5 mt-6">
        <p className="font-medium text-ink mb-3">Agregar servicio</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <input className="input" placeholder="Nombre (ej. Masaje deportivo)" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input" placeholder="Descripción breve" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <input className="input" placeholder="WhatsApp del proveedor" value={wa} onChange={(e) => setWa(e.target.value)} />
        </div>
        <Button className="mt-3" onClick={add}>+ Agregar</Button>
      </Card>

      {/* Consultas / citas de servicios */}
      <AppointmentsSection studioId={currentStudio!.id} services={services} />

      <style>{`.input{width:100%;border:1px solid #E8E3D6;border-radius:.75rem;padding:.6rem .8rem;background:#fff;outline:none}.input:focus{box-shadow:0 0 0 2px var(--brand-primary)}`}</style>
    </>
  );
}

function ServiceCard({
  sv, ceuCode, updateService, removeService,
}: {
  sv: OptionalService;
  ceuCode: string;
  updateService: (id: string, patch: Partial<OptionalService>) => void;
  removeService: (id: string) => void;
}) {
  const estComm = serviceCommission(sv);
  const [copied, setCopied] = useState(false);
  const providerLink = `${window.location.origin}/#/?ceu=${encodeURIComponent(ceuCode)}&role=proveedor&service=${encodeURIComponent(sv.id)}`;
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(providerLink); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* bloqueado */ }
  };
  return (
    <Card className="p-5 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre del servicio">
          <input className="input" value={sv.name} onChange={(e) => updateService(sv.id, { name: e.target.value })} />
        </Field>
        <Field label="WhatsApp del proveedor">
          <input
            className="input"
            value={sv.whatsapp ?? ''}
            onChange={(e) => updateService(sv.id, { whatsapp: e.target.value })}
            placeholder="+52 55 1234 5678"
          />
        </Field>
      </div>
      <Field label="Descripción">
        <input className="input" value={sv.description} onChange={(e) => updateService(sv.id, { description: e.target.value })} />
      </Field>

      {/* Agenda + comisión */}
      <div className="rounded-xl bg-cream-dark/30 p-3 space-y-3">
        <Toggle
          label="Permitir agendar consulta desde la app"
          checked={!!sv.bookable}
          onChange={(v) => updateService(sv.id, { bookable: v })}
        />
        {sv.bookable && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Precio del servicio (lo cobra el proveedor)">
              <input
                type="number" min={0} step="0.01" className="input"
                value={sv.price ?? ''} placeholder="0.00"
                onChange={(e) => updateService(sv.id, { price: e.target.value === '' ? undefined : Number(e.target.value) })}
              />
            </Field>
            <Field label="Tipo de comisión">
              <select
                className="input"
                value={sv.commissionType ?? 'fixed'}
                onChange={(e) => updateService(sv.id, { commissionType: e.target.value as 'fixed' | 'percent' })}
              >
                <option value="fixed">Monto fijo ($)</option>
                <option value="percent">Porcentaje (%)</option>
              </select>
            </Field>
            <Field label={sv.commissionType === 'percent' ? 'Comisión (%)' : 'Comisión ($)'}>
              <input
                type="number" min={0} step="0.01" className="input"
                value={sv.commissionValue ?? ''} placeholder="0"
                onChange={(e) => updateService(sv.id, { commissionValue: e.target.value === '' ? undefined : Number(e.target.value) })}
              />
            </Field>
          </div>
        )}
        {sv.bookable && (
          <p className="text-sm text-ink-faint">
            Comisión estimada por cita: <b>${estComm.toFixed(2)}</b>
            {sv.commissionType === 'percent' && sv.price ? ` (${sv.commissionValue ?? 0}% de $${Number(sv.price).toFixed(2)})` : ''}
          </p>
        )}
        {sv.bookable && (
          <div className="pt-1">
            <span className="mb-1 block text-sm font-medium text-ink-soft">Invitar al proveedor (login propio)</span>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg bg-cream-dark/50 px-3 py-2 text-xs text-ink-soft">{providerLink}</code>
              <button type="button" onClick={copyLink} className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-cream">
                {copied ? '¡Copiado!' : 'Copiar'}
              </button>
            </div>
            <p className="mt-1 text-xs text-ink-faint">El proveedor verá y agendará solo las citas de este servicio. No ve datos de tus miembros.</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-1">
        <Toggle
          label="Visible para tus alumnos"
          checked={sv.enabled}
          onChange={(v) => updateService(sv.id, { enabled: v })}
        />
        {sv.custom && (
          <button onClick={() => removeService(sv.id)} className="text-sm text-red-600">
            Eliminar
          </button>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Consultas: el estudio ve cada cita, la agenda, la completa y cobra comisión.
// ---------------------------------------------------------------------------
const STATUS_LABEL: Record<AppointmentStatus, string> = {
  requested: 'Solicitada',
  scheduled: 'Agendada',
  done: 'Realizada',
  cancelled: 'Cancelada',
};
const STATUS_TONE: Record<AppointmentStatus, 'neutral' | 'success' | 'warning' | 'brand'> = {
  requested: 'warning',
  scheduled: 'brand',
  done: 'success',
  cancelled: 'neutral',
};

function fmt(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function AppointmentsSection({ studioId, services }: { studioId: string; services: OptionalService[] }) {
  const [appts, setAppts] = useState<ServiceAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'open' | 'done' | 'all'>('open');

  const reload = async () => {
    setLoading(true);
    setAppts(await fetchAppointments(studioId));
    setLoading(false);
  };
  useEffect(() => { void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [studioId]);

  const shown = useMemo(() => {
    if (filter === 'open') return appts.filter((a) => a.status === 'requested' || a.status === 'scheduled');
    if (filter === 'done') return appts.filter((a) => a.status === 'done');
    return appts;
  }, [appts, filter]);

  const pendingComm = useMemo(
    () => appts.filter((a) => a.status === 'done' && !a.commissionPaid)
      .reduce((s, a) => s + a.commissionUsd, 0),
    [appts],
  );

  const patch = async (id: string, p: Parameters<typeof updateAppointment>[1]) => {
    const ok = await updateAppointment(id, p);
    if (ok) { await reload(); }
  };

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-ink">Consultas</h2>
        <div className="flex gap-1 text-sm">
          {(['open', 'done', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full ${filter === f ? 'bg-sage text-white' : 'bg-cream-dark/50 text-ink-soft'}`}
            >
              {f === 'open' ? 'Abiertas' : f === 'done' ? 'Realizadas' : 'Todas'}
            </button>
          ))}
        </div>
      </div>

      {pendingComm > 0 && (
        <Card className="p-4 mb-3 bg-amber-50 border border-amber-200">
          <p className="text-sm text-ink">
            Comisiones realizadas <b>por cobrar</b>: <b>${pendingComm.toFixed(2)}</b>
          </p>
        </Card>
      )}

      {loading ? (
        <Card className="p-6 text-center text-sm text-ink-faint">Cargando…</Card>
      ) : shown.length === 0 ? (
        <EmptyState>No hay consultas {filter === 'open' ? 'abiertas' : filter === 'done' ? 'realizadas' : ''}.</EmptyState>
      ) : (
        <div className="space-y-3">
          {shown.map((a) => (
            <ApptRow key={a.id} appt={a} service={services.find((s) => s.id === a.serviceId)} patch={patch} />
          ))}
        </div>
      )}
    </div>
  );
}

function ApptRow({
  appt, service, patch,
}: {
  appt: ServiceAppointment;
  service?: OptionalService;
  patch: (id: string, p: Parameters<typeof updateAppointment>[1]) => Promise<void>;
}) {
  const [date, setDate] = useState('');
  const [comm, setComm] = useState<string>(appt.commissionUsd ? String(appt.commissionUsd) : '');

  const schedule = async () => {
    if (!date) return;
    await patch(appt.id, { status: 'scheduled', scheduledFor: new Date(date).toISOString() });
    setDate('');
  };
  const markDone = async () => {
    const def = appt.commissionUsd || (service ? serviceCommission(service) : 0);
    await patch(appt.id, { status: 'done', commissionUsd: def });
    notifySuccess('Consulta marcada como realizada.');
  };
  const saveComm = async () => {
    await patch(appt.id, { commissionUsd: comm === '' ? 0 : Number(comm) });
    notifySuccess('Comisión actualizada.');
  };

  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-ink">{appt.userName ?? 'Alumno'} · <span className="text-ink-soft">{appt.serviceName}</span></p>
          <p className="text-sm text-ink-faint">
            Solicitada: {fmt(appt.preferredAt ?? appt.createdAt)}
            {appt.scheduledFor ? ` · Agendada: ${fmt(appt.scheduledFor)}` : ''}
          </p>
          {appt.note && <p className="text-sm text-ink-soft mt-1">“{appt.note}”</p>}
        </div>
        <Badge tone={STATUS_TONE[appt.status]}>{STATUS_LABEL[appt.status]}</Badge>
      </div>

      {appt.status === 'requested' && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <input type="datetime-local" className="input !w-auto" value={date} onChange={(e) => setDate(e.target.value)} />
          <Button onClick={schedule} disabled={!date}>Agendar</Button>
          <Button variant="secondary" onClick={() => patch(appt.id, { status: 'cancelled' })}>Cancelar</Button>
        </div>
      )}

      {appt.status === 'scheduled' && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button onClick={markDone}>Marcar realizada</Button>
          <Button variant="secondary" onClick={() => patch(appt.id, { status: 'cancelled' })}>Cancelar</Button>
        </div>
      )}

      {appt.status === 'done' && (
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-cream-dark/60">
          <span className="text-sm text-ink-soft">Comisión $</span>
          <input
            type="number" min={0} step="0.01" className="input !w-28"
            value={comm} onChange={(e) => setComm(e.target.value)} onBlur={saveComm}
          />
          <Button
            variant={appt.commissionPaid ? 'secondary' : 'primary'}
            onClick={() => patch(appt.id, { commissionPaid: !appt.commissionPaid })}
          >
            {appt.commissionPaid ? '✓ Cobrada' : 'Marcar cobrada'}
          </Button>
        </div>
      )}
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink-soft">{label}</span>
      {children}
    </label>
  );
}
