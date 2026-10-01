import { useEffect, useState } from 'react';
import { useStore } from '../../lib/store';
import { PageHeader, Card, Button } from '../../components/ui';
import { fetchRoutines, fetchMeasurements, addMeasurement, type Routine, type Measurement } from '../../lib/routines';
import { notifySuccess } from '../../lib/notify';

// Alumno (gym/mixto): ve su rutina asignada y registra su peso (seguimiento).
export default function MyRoutine() {
  const { currentUser, currentStudio } = useStore();
  const uid = currentUser!.id;
  const studioId = currentStudio!.id;

  const [routines, setRoutines] = useState<Routine[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [weight, setWeight] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setRoutines(await fetchRoutines(uid));
    setMeasurements(await fetchMeasurements(uid));
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

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
          {routines.map((r) => (
            <Card key={r.id} className="p-5">
              <h3 className="font-semibold text-ink">{r.title}</h3>
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
            </Card>
          ))}
        </div>
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
