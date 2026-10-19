import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, Button, Card, Modal } from '../../components/ui';
import WeekCalendar from '../../components/WeekCalendar';
import { useStore } from '../../lib/store';
import { fetchTakenSpots } from '../../lib/spots';
import type { ClassSession } from '../../lib/types';

// Alumno: reserva de clases con disponibilidad en tiempo real ("Quedan X lugares").
export default function BookClasses() {
  const { db, currentUser, currentStudio, bookSession, cancelBooking, availableCredits } = useStore();
  const uid = currentUser!.id;
  // Clase para la que el alumno está eligiendo lugar (modal).
  const [pickFor, setPickFor] = useState<ClassSession | null>(null);
  const spotsFor = (s: ClassSession) => db.classTemplates.find((t) => t.id === s.templateId)?.spots ?? [];

  const myActiveBookings = useMemo(
    () =>
      new Map(
        db.bookings
          .filter((b) => b.userId === uid && b.status !== 'CANCELED')
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
          const canBook = seats > 0 && creditsLeft > 0 && !closed;
          const hasSpots = spotsFor(s).length > 0;
          return (
            <Button
              disabled={!canBook}
              onClick={() => (hasSpots ? setPickFor(s) : bookSession(s.id))}
              className="w-full"
            >
              {closed
                ? 'Reservas cerradas'
                : seats === 0
                  ? 'Sin lugares'
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

// Modal para elegir un lugar (cama/bici) libre antes de reservar.
function SpotPicker({
  session, spots, onClose, onConfirm,
}: {
  session: ClassSession;
  spots: string[];
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
        <p className="mb-4 text-sm text-ink-faint">Selecciona un lugar disponible para tu clase.</p>
        {loading ? (
          <p className="text-sm text-ink-faint">Cargando lugares…</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {spots.map((sp) => {
              const isTaken = taken.has(sp);
              const on = sel === sp;
              return (
                <button
                  key={sp}
                  type="button"
                  disabled={isTaken}
                  onClick={() => setSel(on ? '' : sp)}
                  className={`rounded-xl px-2 py-3 text-sm font-semibold transition ${
                    isTaken
                      ? 'bg-cream-dark/40 text-ink-faint line-through cursor-not-allowed'
                      : on
                        ? 'bg-brand text-cream-light'
                        : 'bg-cream-dark/50 text-ink-soft hover:brightness-95'
                  }`}
                >
                  {sp}
                </button>
              );
            })}
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={!sel} onClick={() => sel && onConfirm(sel)}>Reservar lugar</Button>
        </div>
      </Card>
    </Modal>
  );
}
