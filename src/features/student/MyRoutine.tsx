import { useEffect, useState } from 'react';
import { useStore } from '../../lib/store';
import { PageHeader, Card, Button } from '../../components/ui';
import {
  fetchRoutines, fetchMeasurements, addMeasurement, markRoutineDone, fetchMyCompletions, fetchVideos,
  type Routine, type Measurement, type Completion, type RoutineVideo,
} from '../../lib/routines';
import { notifySuccess } from '../../lib/notify';

// Alumno (gym/mixto): ve su rutina asignada y registra su peso (seguimiento).
export default function MyRoutine() {
  const { currentUser, currentStudio, db } = useStore();
  const uid = currentUser!.id;
  const studioId = currentStudio!.id;
  // Nombre del coach que asignó la rutina (si lo conocemos en el estudio).
  const coachName = (id?: string) =>
    id ? db.users.find((u) => u.id === id)?.fullName ?? null : null;

  const [routines, setRoutines] = useState<Routine[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [videos, setVideos] = useState<RoutineVideo[]>([]);
  const [weight, setWeight] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [marking, setMarking] = useState<string | null>(null);

  const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local

  const load = async () => {
    setRoutines(await fetchRoutines(uid));
    setMeasurements(await fetchMeasurements(uid));
    setCompletions(await fetchMyCompletions(uid));
    setVideos(await fetchVideos());
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // Estado de HOY de una rutina: sin marcar / pendiente de coach / logrado.
  const todayStatus = (routineId: string): 'none' | 'pending' | 'done' => {
    const c = completions.find((x) => x.routineId === routineId && x.day === todayStr);
    if (!c) return 'none';
    return c.coachConfirmed ? 'done' : 'pending';
  };
  const markDone = async (routineId: string) => {
    setMarking(routineId);
    const ok = await markRoutineDone(routineId);
    setMarking(null);
    if (ok) {
      notifySuccess('¡Registrado! Tu coach lo confirmará. 💪');
      setCompletions(await fetchMyCompletions(uid));
    }
  };

  const addWeight = async () => {
    const w = parseFloat(weight.replace(',', '.'));
    if (!Number.isFinite(w) && !note.trim()) return;
    setSaving(true);
    const ok = await addMeasurement({ studioId, userId: uid, weightKg: Number.isFinite(w) ? w : null, note: note.trim() || null });
    setSaving(false);
    if (ok) {
      notifySuccess('Registro guardado 💪');
      setWeight('');
      setNote('');
      setMeasurements(await fetchMeasurements(uid));
    }
  };

  const lastWeight = measurements.find((m) => m.weightKg != null)?.weightKg ?? null;

  return (
    <>
      <PageHeader title="Mi rutina" subtitle="Tu plan de entrenamiento y tu progreso" />

      {/* Rutinas asignadas */}
      {routines.length === 0 ? (
        <Card className="mb-6 p-8 text-center text-ink-faint">
          Aún no tienes una rutina asignada. Tu entrenador la preparará pronto. 💪
        </Card>
      ) : (
        <div className="mb-6 grid gap-4 md:grid-cols-2">
          {routines.map((r) => {
            const st = todayStatus(r.id);
            return (
            <Card key={r.id} className="p-5">
              <h3 className="font-semibold text-ink">{r.title}</h3>
              {coachName(r.updatedBy) && (
                <p className="mt-0.5 text-xs text-ink-faint">👤 Tu coach: <span className="font-medium text-brand">{coachName(r.updatedBy)}</span></p>
              )}
              <ul className="mt-3 space-y-2">
                {r.items.map((it, i) => (
                  <li key={i} className="rounded-xl bg-cream-dark/30 px-3 py-2">
                    <p className="font-medium text-ink">{it.name}</p>
                    <p className="text-sm text-ink-soft">
                      {[it.sets && it.reps ? `${it.sets}×${it.reps}` : it.sets || it.reps, it.load]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {it.notes && <p className="text-xs text-ink-faint">{it.notes}</p>}
                  </li>
                ))}
              </ul>
              {/* Cumplimiento de hoy (2 pasos: tú marcas, el coach confirma) */}
              <div className="mt-3 border-t border-cream-dark pt-3">
                {st === 'done' ? (
                  <p className="text-sm font-medium text-green-700">✅ Logrado hoy · confirmado por tu coach</p>
                ) : st === 'pending' ? (
                  <p className="text-sm font-medium text-amber-700">⏳ Marcada como cumplida · esperando que tu coach la confirme</p>
                ) : (
                  <Button className="w-full" disabled={marking === r.id} onClick={() => markDone(r.id)}>
                    {marking === r.id ? 'Registrando…' : 'Marcar como cumplida hoy'}
                  </Button>
                )}
              </div>
            </Card>
          );})}
        </div>
      )}

      {/* Biblioteca de videos (rutinas genéricas del estudio) */}
      {videos.length > 0 && (
        <Card className="mb-6 p-5">
          <h2 className="font-semibold text-ink mb-1">Rutinas en video</h2>
          <p className="text-sm text-ink-faint mb-3">Entrenamientos guiados que puedes hacer por tu cuenta.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {videos.map((v) => (
              <a
                key={v.id}
                href={v.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 rounded-xl border border-cream-dark p-3 hover:bg-brand-soft"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">▶</span>
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{v.title}</span>
                  {(v.level || v.area) && <span className="block text-[11px] text-ink-faint">{[v.level, v.area].filter(Boolean).join(' · ')}</span>}
                </span>
              </a>
            ))}
          </div>
        </Card>
      )}

      {/* Seguimiento: peso */}
      <Card className="p-5">
        <h2 className="font-semibold text-ink">Mi progreso</h2>
        <p className="text-sm text-ink-faint">
          Registra tu peso para ver tu avance.{lastWeight != null ? ` Último: ${lastWeight} kg.` : ''}
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-soft">Peso (kg)</span>
            <input
              type="number"
              inputMode="decimal"
              className="w-28 rounded-xl border border-cream-dark bg-white px-3 py-2 outline-none focus:ring-2 ring-brand"
              placeholder="70"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </label>
          <label className="block flex-1 min-w-[10rem]">
            <span className="mb-1 block text-xs font-medium text-ink-soft">Nota (opcional)</span>
            <input
              className="w-full rounded-xl border border-cream-dark bg-white px-3 py-2 outline-none focus:ring-2 ring-brand"
              placeholder="Ej. me sentí con energía"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <Button onClick={addWeight} disabled={saving || (!weight.trim() && !note.trim())}>
            {saving ? 'Guardando…' : 'Registrar'}
          </Button>
        </div>

        {measurements.length > 0 && (
          <div className="mt-4 space-y-1 max-h-72 overflow-y-auto">
            {measurements.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-lg bg-cream-dark/30 px-3 py-1.5 text-sm">
                <span className="font-medium text-ink">{m.weightKg != null ? `${m.weightKg} kg` : '—'}</span>
                <span className="text-ink-faint truncate px-2">{m.note || ''}</span>
                <span className="text-xs text-ink-faint shrink-0">{new Date(m.createdAt).toLocaleDateString('es-MX')}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
