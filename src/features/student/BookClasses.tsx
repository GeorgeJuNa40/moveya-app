import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, Button, Card, Modal } from '../../components/ui';
import WeekCalendar from '../../components/WeekCalendar';
import { useStore } from '../../lib/store';
import { fetchTakenSpots } from '../../lib/spots';
import SpotMap from '../../components/SpotMap';
import type { ClassSession, Spot } from '../../lib/types';

// Alumno: reserva de clases con disponibilidad en tiempo real ("Quedan X lugares").
export default function BookClasses() {
  const { db, currentUser, currentStudio, bookSession, cancelBooking, joinWaitlist, leaveWaitlist, availableCredits } = useStore();
  const uid = currentUser!.id;
  // Clase para la que el alumno está eligiendo lugar (modal).
  const [pickFor, setPickFor] = useState<ClassSession | null>(null);
  const spotsFor = (s: ClassSession) => db.classTemplates.find((t) => t.id === s.templateId)?.spots ?? [];

  // Reservas activas (RESERVED) y lista de espera (WAITLIST) del alumno, por sesión.
  const myActiveBookings = useMemo(
    () =>
      new Map(
        db.bookings
          .filter((b) => b.userId === uid && b.status === 'RESERVED')
          .map((b) => [b.sessionId, b.id]),
      ),
    [db.bookings, uid],
  );
  const myWaitlist = useMemo(
    () =>
      new Map(
        db.bookings
          .filter((b) => b.userId === uid && b.status === 'WAITLIST')
          .map((b) => [b.sessionId, b.id]),
      ),
    [db.bookings, uid],
  );

  // Créditos usables (activos, con vigencia) — mismo cálculo en toda la app.
  const creditsLeft = availableCredits(uid);

  // Política de cancelación que definió el estudio (si la configuró).
  const cancellationPolicy = currentStudio!.branding.cancellationPolicy?.trim();
  // Candado: horas mínimas de anticipación para poder cancelar una reserva.
  const cancelHours = currentStudio!.branding.cancellationHours ?? 0;
  // Cierre de reservas: minutos antes de la clase en que ya no se puede reservar.
  const cutoffMin = currentStudio!.branding.bookingCutoffMinutes ?? 0;

  return (
    <>
      <PageHeader
        title="Reservar clases"
        subtitle="Elige tu próxima sesión — disponibilidad en tiempo real"
      />

      {cancellationPolicy && (
        <Card className="mb-6 p-4 bg-cream-dark/30">
          <p className="text-sm font-semibold text-ink">Política de cancelación</p>
          <p className="mt-1 text-sm text-ink-soft whitespace-pre-line">{cancellationPolicy}</p>
        </Card>
      )}

      {creditsLeft === 0 && (
        <Card className="mb-6 p-4 bg-amber-50 border-amber-200">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <p className="text-sm text-amber-800">
              No tienes clases disponibles. Revisa la vigencia de tu paquete o compra uno nuevo para
              seguir reservando.
            </p>
            <Link to="/app/packages">
              <Button variant="secondary">Ver paquetes</Button>
            </Link>
          </div>
        </Card>
      )}
      {creditsLeft > 0 && (
        <p className="mb-4 text-sm text-ink-soft">
          Te quedan <span className="font-semibold text-brand">{creditsLeft}</span> clase(s) para reservar.
        </p>
      )}

      <WeekCalendar
        filter={(s) => s.studioId === currentStudio!.id}
        renderAction={(s, seats) => {
          const bookingId = myActiveBookings.get(s.id);
          if (bookingId) {
            // Candado: si faltan menos horas que las exigidas por el estudio,
            // se bloquea la cancelación para cumplir su política.
            const hoursUntil = (new Date(s.startsAt).getTime() - Date.now()) / 3_600_000;
            const locked = cancelHours > 0 && hoursUntil < cancelHours;
            if (locked) {
              return (
                <div className="text-center">
                  <Button variant="secondary" disabled className="w-full">
                    🔒 Reserva bloqueada
                  </Button>
                  <p className="mt-1 text-xs text-ink-faint">
                    No se puede cancelar con menos de {cancelHours} h de anticipación.
                  </p>
                </div>
              );
            }
            return (
              <Button variant="danger" onClick={() => cancelBooking(bookingId)}>
                Cancelar reserva
              </Button>
            );
          }
          // Cierre por tiempo: aunque haya cupo, no se reserva si ya pasó el
          // límite que fijó el estudio (ej. 30 min antes de la clase).
          const minutesUntil = (new Date(s.startsAt).getTime() - Date.now()) / 60000;
          // Cerrada si ya empezó (no se reserva en el pasado) o si pasó el cierre del estudio.
          const closed = minutesUntil <= 0 || (cutoffMin > 0 && minutesUntil < cutoffMin);
          const hasSpots = spotsFor(s).length > 0;

          // Ya está en lista de espera → puede salir de ella.
          const waitId = myWaitlist.get(s.id);
          if (waitId) {
            return (
              <div className="text-center">
                <Button variant="secondary" disabled className="w-full">🕒 En lista de espera</Button>
                <button onClick={() => leaveWaitlist(waitId)} className="mt-1 text-xs font-medium text-red-600">Salir de la lista</button>
              </div>
            );
          }
          // Llena pero abierta → ofrecer lista de espera (sin consumir crédito).
          if (seats === 0 && !closed) {
            return (
              <div className="text-center">
                <Button variant="secondary" className="w-full" onClick={() => joinWaitlist(s.id)}>
                  Unirme a lista de espera
                </Button>
                <p className="mt-1 text-xs text-ink-faint">Te avisamos si se libera un lugar.</p>
              </div>
            );
          }
          const canBook = seats > 0 && creditsLeft > 0 && !closed;
          return (
            <Button
              disabled={!canBook}
              onClick={() => (hasSpots ? setPickFor(s) : bookSession(s.id))}
              className="w-full"
            >
              {closed
                ? 'Reservas cerradas'
                : creditsLeft === 0
                  ? 'Sin clases'
                  : hasSpots
                    ? 'Elegir lugar'
                    : 'Reservar'}
            </Button>
          );
        }}
      />

      {pickFor && (
        <SpotPicker
          session={pickFor}
          spots={spotsFor(pickFor)}
          onClose={() => setPickFor(null)}
          onConfirm={(spot) => { bookSession(pickFor.id, spot); setPickFor(null); }}
        />
      )}
    </>
  );
}

// Modal para elegir un lugar (cama/bici) libre antes de reservar. Muestra el
// mapa del salón tal como lo acomodó el estudio; los ocupados salen tachados.
function SpotPicker({
  session, spots, onClose, onConfirm,
}: {
  session: ClassSession;
  spots: Spot[];
  onClose: () => void;
  onConfirm: (spot: string) => void;
}) {
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<string>('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    fetchTakenSpots(session.id).then((arr) => { if (alive) { setTaken(new Set(arr)); setLoading(false); } });
    return () => { alive = false; };
  }, [session.id]);

  return (
    <Modal onClose={onClose}>
      <Card className="p-6">
        <h2 className="mb-1 text-lg font-bold text-ink">Elige tu lugar</h2>
        <p className="mb-4 text-sm text-ink-faint">Toca un lugar disponible en el mapa de tu salón.</p>
        {loading ? (
          <p className="text-sm text-ink-faint">Cargando lugares…</p>
        ) : (
          <SpotMap
            spots={spots}
            takenLabels={taken}
            selected={sel}
            onSelect={(label) => setSel((cur) => (cur === label ? '' : label))}
          />
        )}
        {sel && <p className="mt-3 text-sm text-ink">Lugar elegido: <span className="font-semibold text-brand">{sel}</span></p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={!sel} onClick={() => sel && onConfirm(sel)}>Reservar lugar</Button>
        </div>
      </Card>
    </Modal>
  );
}
