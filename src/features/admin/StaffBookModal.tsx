import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../lib/store';
import { Modal, Card, Button, Badge } from '../../components/ui';
import SpotMap from '../../components/SpotMap';
import { fmtDay, fmtTime } from '../../lib/format';
import { fetchTakenSpots } from '../../lib/spots';
import { notifySuccess } from '../../lib/notify';
import type { ClassSession, Spot, User } from '../../lib/types';

// Modal para que el STAFF (admin/gerente/recepción) reserve una clase a nombre de
// un alumno — p. ej. cuando lo pide por teléfono/WhatsApp o justo tras un registro
// manual. Respeta cupo, créditos y lugares (lo valida el servidor en book_session).
export default function StaffBookModal({
  student, onClose, headline,
}: {
  student: User;
  onClose: () => void;
  headline?: string;
}) {
  const { db, currentStudio, seatsLeft, staffBookSession } = useStore();
  const [pickFor, setPickFor] = useState<ClassSession | null>(null); // clase con lugares a elegir
  const [busy, setBusy] = useState<string | null>(null);
  const [bookedIds, setBookedIds] = useState<Set<string>>(new Set());

  const sessions = useMemo(
    () =>
      db.classSessions
        .filter((s) => s.studioId === currentStudio!.id)
        .filter((s) => new Date(s.startsAt).getTime() > Date.now())
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
        .slice(0, 20),
    [db.classSessions, currentStudio],
  );

  const spotsFor = (s: ClassSession): Spot[] => db.classTemplates.find((t) => t.id === s.templateId)?.spots ?? [];

  const doBook = async (s: ClassSession, spot?: string) => {
    setBusy(s.id);
    const ok = await staffBookSession(s.id, student.id, spot);
    if (ok) { notifySuccess(`Clase reservada para ${student.fullName.split(' ')[0]} ✓`); setBookedIds((p) => new Set(p).add(s.id)); setPickFor(null); }
    setBusy(null);
  };

  return (
    <Modal onClose={onClose}>
      <Card className="w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-ink">Reservar clase</h2>
        <p className="mb-4 text-sm text-ink-faint">
          {headline ?? <>Elige una clase para <b>{student.fullName}</b>. Se descuenta de su paquete/membresía.</>}
        </p>

        {sessions.length === 0 ? (
          <p className="text-sm text-ink-faint">No hay clases próximas en la agenda.</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => {
              const tpl = db.classTemplates.find((t) => t.id === s.templateId);
              const seats = seatsLeft(s.id);
              const hasSpots = spotsFor(s).length > 0;
              const booked = bookedIds.has(s.id);
              return (
                <div key={s.id} className="flex items-center gap-3 rounded-xl bg-cream-dark/40 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{tpl?.name ?? 'Clase'}</p>
                    <p className="text-xs text-ink-faint">{fmtDay(s.startsAt)} · {fmtTime(s.startsAt)}</p>
                  </div>
                  {seats <= 0 ? (
                    <Badge tone="danger">Lleno</Badge>
                  ) : (
                    <span className="text-xs text-ink-faint">{seats} lugares</span>
                  )}
                  {booked ? (
                    <Badge tone="success">Reservada ✓</Badge>
                  ) : (
                    <Button
                      disabled={busy === s.id || seats <= 0}
                      onClick={() => (hasSpots ? setPickFor(s) : doBook(s))}
                    >
                      {busy === s.id ? '…' : 'Reservar'}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-5 text-right">
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
        </div>
      </Card>

      {pickFor && (
        <SpotPicker
          session={pickFor}
          spots={spotsFor(pickFor)}
          busy={busy === pickFor.id}
          onClose={() => setPickFor(null)}
          onConfirm={(spot) => doBook(pickFor, spot)}
        />
      )}
    </Modal>
  );
}

// Selector de lugar (cama/bici) para clases con mapa de salón.
function SpotPicker({
  session, spots, busy, onClose, onConfirm,
}: {
  session: ClassSession;
  spots: Spot[];
  busy: boolean;
  onClose: () => void;
  onConfirm: (spot: string) => void;
}) {
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    fetchTakenSpots(session.id).then((arr) => { if (alive) { setTaken(new Set(arr)); setLoading(false); } });
    return () => { alive = false; };
  }, [session.id]);

  return (
    <Modal onClose={onClose}>
      <Card className="p-6">
        <h2 className="mb-1 text-lg font-bold text-ink">Elige el lugar</h2>
        <p className="mb-4 text-sm text-ink-faint">Toca un lugar disponible en el mapa del salón.</p>
        {loading ? (
          <p className="text-sm text-ink-faint">Cargando lugares…</p>
        ) : (
          <SpotMap spots={spots} takenLabels={taken} selected={sel} onSelect={(label) => setSel((cur) => (cur === label ? '' : label))} />
        )}
        {sel && <p className="mt-3 text-sm text-ink">Lugar: <span className="font-semibold text-brand">{sel}</span></p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={!sel || busy} onClick={() => sel && onConfirm(sel)}>Reservar lugar</Button>
        </div>
      </Card>
    </Modal>
  );
}
