import { useEffect, useState } from 'react';
import { useStore } from '../../lib/store';
import { PageHeader, Card, Button, EmptyState, Badge, Modal } from '../../components/ui';
import { notifySuccess } from '../../lib/notify';
import { requestAppointment, fetchMyAppointments } from '../../lib/appointments';
import type { OptionalService, ServiceAppointment, AppointmentStatus } from '../../lib/types';

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
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Alumno: servicios activados por el estudio. Puede contactar por WhatsApp y,
// si el servicio lo permite, AGENDAR una consulta (la gestiona el estudio).
export default function OptionalServices() {
  const { currentStudio, currentUser } = useStore();
  const services = currentStudio!.services.filter((s) => s.enabled);
  const [booking, setBooking] = useState<OptionalService | null>(null);
  const [mine, setMine] = useState<ServiceAppointment[]>([]);

  const reloadMine = async () => {
    if (currentUser?.id) setMine(await fetchMyAppointments(currentUser.id));
  };
  useEffect(() => { void reloadMine(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [currentUser?.id]);

  const waLink = (num: string | undefined, service: string) => {
    const digits = (num ?? '').replace(/\D/g, '');
    if (!digits) return undefined;
    return `https://wa.me/${digits}?text=${encodeURIComponent(
      `Hola, quiero información sobre el servicio de ${service}.`,
    )}`;
  };

  return (
    <>
      <PageHeader title="Servicios" subtitle="Bienestar integral más allá de la clase" />
      {services.length === 0 ? (
        <EmptyState>Tu estudio aún no ha activado servicios opcionales.</EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {services.map((s) => {
            const link = waLink(s.whatsapp, s.name);
            return (
              <Card key={s.id} className="p-6 flex flex-col">
                <div className="text-4xl">✚</div>
                <h3 className="mt-3 font-semibold text-ink">{s.name}</h3>
                <p className="text-sm text-ink-faint mt-1 flex-1">{s.description}</p>
                {s.bookable && s.price ? (
                  <p className="text-sm text-ink-soft mt-2">Desde <b>${Number(s.price).toFixed(2)}</b></p>
                ) : null}
                <div className="mt-4 space-y-2">
                  {s.bookable && (
                    <Button className="w-full" onClick={() => setBooking(s)}>Agendar consulta</Button>
                  )}
                  {link ? (
                    <a href={link} target="_blank" rel="noreferrer" className="block">
                      <Button className="w-full" variant={s.bookable ? 'secondary' : 'primary'}>
                        Contactar por WhatsApp
                      </Button>
                    </a>
                  ) : (
                    !s.bookable && (
                      <Button className="w-full" variant="secondary" disabled>
                        Contacto no disponible
                      </Button>
                    )
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Mis consultas */}
      {mine.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-ink mb-3">Mis consultas</h2>
          <div className="space-y-2">
            {mine.map((a) => (
              <Card key={a.id} className="p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-ink">{a.serviceName}</p>
                  <p className="text-sm text-ink-faint">
                    {a.scheduledFor ? `Agendada: ${fmt(a.scheduledFor)}` : `Solicitada: ${fmt(a.preferredAt ?? a.createdAt)}`}
                  </p>
                </div>
                <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
              </Card>
            ))}
          </div>
        </div>
      )}

      {booking && (
        <BookingModal
          service={booking}
          studioId={currentStudio!.id}
          userId={currentUser!.id}
          userName={currentUser?.fullName}
          onClose={() => setBooking(null)}
          onDone={async () => { setBooking(null); await reloadMine(); }}
        />
      )}
    </>
  );
}

function BookingModal({
  service, studioId, userId, userName, onClose, onDone,
}: {
  service: OptionalService;
  studioId: string;
  userId: string;
  userName?: string;
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const [when, setWhen] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    const res = await requestAppointment({
      studioId, serviceId: service.id, serviceName: service.name,
      userId, userName,
      preferredAt: when ? new Date(when).toISOString() : undefined,
      note: note.trim() || undefined,
    });
    setSaving(false);
    if (res.ok) {
      notifySuccess('¡Solicitud enviada! El estudio confirmará tu cita.');
      await onDone();
    }
  };

  return (
    <Modal onClose={onClose}>
      <Card className="p-6">
      <h2 className="mb-4 text-lg font-bold text-ink">Agendar: {service.name}</h2>
      <div className="space-y-4">
        <p className="text-sm text-ink-soft">
          Envía tu solicitud y el estudio confirmará la fecha. El pago lo haces directo con el proveedor.
        </p>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink-soft">Fecha y hora que prefieres (opcional)</span>
          <input type="datetime-local" className="binp" value={when} onChange={(e) => setWhen(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink-soft">Nota para el estudio (opcional)</span>
          <textarea className="binp" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. prefiero por la tarde" />
        </label>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Enviando…' : 'Enviar solicitud'}</Button>
        </div>
      </div>
      <style>{`.binp{width:100%;border:1px solid #E8E3D6;border-radius:.75rem;padding:.6rem .8rem;background:#fff;outline:none}.binp:focus{box-shadow:0 0 0 2px var(--brand-primary)}`}</style>
      </Card>
    </Modal>
  );
}
