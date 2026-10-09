import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../lib/store';
import { PageHeader, Card, Button } from '../../components/ui';
import {
  fetchRoutines, saveRoutine, deleteRoutine, fetchMeasurements,
  fetchPendingCompletions, confirmCompletion,
  fetchVideos, addVideo, deleteVideo,
  type Routine, type Exercise, type Measurement, type Completion, type RoutineVideo,
} from '../../lib/routines';
import { notifySuccess } from '../../lib/notify';

// Pantalla "Rutinas" (gym/mixto): el staff arma rutinas y se las asigna a un
// miembro. También ve el seguimiento (peso) que el miembro registró.
type Draft = { id?: string; title: string; items: Exercise[] };
const emptyExercise = (): Exercise => ({ name: '', sets: '', reps: '', load: '', notes: '' });

export default function RoutinesAdmin() {
  const { db, currentStudio, currentUser } = useStore();
  const studioId = currentStudio!.id;
  const students = useMemo(
    () => db.users.filter((u) => u.studioId === studioId && u.role === 'STUDENT').sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [db.users, studioId],
  );

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  // Pendientes por confirmar (todo el estudio) y biblioteca de videos.
  const [pending, setPending] = useState<Completion[]>([]);
  const [videos, setVideos] = useState<RoutineVideo[]>([]);
  const [vTitle, setVTitle] = useState('');
  const [vUrl, setVUrl] = useState('');
  const [vLevel, setVLevel] = useState('');
  const [vArea, setVArea] = useState('');

  const loadStudio = async () => {
    setPending(await fetchPendingCompletions());
    setVideos(await fetchVideos());
  };
  useEffect(() => {
    void loadStudio();
  }, []);

  const doConfirm = async (id: string) => {
    if (await confirmCompletion(id)) {
      notifySuccess('Cumplimiento confirmado ✅');
      setPending(await fetchPendingCompletions());
    }
  };
  const addVideoHandler = async () => {
    if (!vTitle.trim() || !vUrl.trim()) return;
    const ok = await addVideo({ studioId, title: vTitle.trim(), url: vUrl.trim(), level: vLevel.trim() || null, area: vArea.trim() || null });
    if (ok) {
      notifySuccess('Video agregado.');
      setVTitle(''); setVUrl(''); setVLevel(''); setVArea('');
      setVideos(await fetchVideos());
    }
  };
  const removeVideo = async (id: string) => {
    if (await deleteVideo(id)) setVideos(await fetchVideos());
  };

  const nameOf = (uid: string) => db.users.find((u) => u.id === uid)?.fullName ?? 'Miembro';
  const selectedUser = students.find((u) => u.id === selected) ?? null;

  const loadMember = async (userId: string) => {
    setSelected(userId);
    setDraft(null);
    setRoutines(await fetchRoutines(userId));
    setMeasurements(await fetchMeasurements(userId));
  };

  const filtered = search.trim()
    ? students.filter((u) => u.fullName.toLowerCase().includes(search.toLowerCase()))
    : students;

  const startNew = () => setDraft({ title: 'Rutina', items: [emptyExercise()] });
  const startEdit = (r: Routine) => setDraft({ id: r.id, title: r.title, items: r.items.length ? r.items : [emptyExercise()] });

  const setItem = (i: number, patch: Partial<Exercise>) =>
    setDraft((d) => (d ? { ...d, items: d.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) } : d));
  const addItem = () => setDraft((d) => (d ? { ...d, items: [...d.items, emptyExercise()] } : d));
  const removeItem = (i: number) => setDraft((d) => (d ? { ...d, items: d.items.filter((_, idx) => idx !== i) } : d));

  const save = async () => {
    if (!draft || !selected) return;
    const items = draft.items.filter((it) => it.name.trim());
    if (!items.length) { notifySuccess('Agrega al menos un ejercicio.'); return; }
    setSaving(true);
    const ok = await saveRoutine({
      id: draft.id,
      studioId,
      userId: selected,
      title: draft.title.trim() || 'Rutina',
      items,
      updatedBy: currentUser!.id,
    });
    setSaving(false);
    if (ok) {
      notifySuccess('Rutina guardada.');
      setDraft(null);
      setRoutines(await fetchRoutines(selected));
    }
  };

  const removeRoutine = async (id: string) => {
    if (!selected) return;
    if (!confirm('¿Eliminar esta rutina?')) return;
    if (await deleteRoutine(id)) setRoutines(await fetchRoutines(selected));
  };

  return (
    <>
      <PageHeader title="Rutinas" subtitle="Arma rutinas para tus miembros y revisa su progreso" />

      {/* Pendientes por confirmar: el alumno marcó que cumplió; el coach confirma. */}
      {pending.length > 0 && (
        <Card className="mb-6 p-5">
          <h2 className="font-semibold text-ink mb-2">Por confirmar <span className="text-ink-faint">({pending.length})</span></h2>
          <p className="text-sm text-ink-faint mb-3">Tus miembros marcaron que cumplieron su rutina. Confírmalo para que les aparezca como "Logrado".</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {pending.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-xl bg-cream-dark/30 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{nameOf(c.userId)}</p>
                  <p className="text-[11px] text-ink-faint">{new Date(c.day).toLocaleDateString('es-MX', { dateStyle: 'medium' })}</p>
                </div>
                <Button variant="secondary" onClick={() => doConfirm(c.id)}>Confirmar</Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Miembros */}
        <Card className="p-5">
          <h2 className="font-semibold text-ink mb-2">Miembros</h2>
          <input
            className="w-full rounded-xl border border-cream-dark bg-white px-4 py-2.5 outline-none focus:ring-2 ring-brand mb-3"
            placeholder="Buscar…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="space-y-1 max-h-[28rem] overflow-y-auto">
            {filtered.map((u) => (
              <button
                key={u.id}
                onClick={() => loadMember(u.id)}
                className={`block w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                  selected === u.id ? 'bg-brand text-cream' : 'hover:bg-cream-dark/40 text-ink'
                }`}
              >
                {u.fullName}
              </button>
            ))}
            {filtered.length === 0 && <p className="text-xs text-ink-faint">Sin miembros.</p>}
          </div>
        </Card>

        {/* Rutinas + seguimiento del miembro */}
        <div className="space-y-6">
          {!selectedUser ? (
            <Card className="p-8 text-center text-ink-faint">Elige un miembro para ver o crear su rutina.</Card>
          ) : (
            <>
              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-ink">Rutinas de {selectedUser.fullName}</h2>
                  {!draft && <Button onClick={startNew}>+ Nueva rutina</Button>}
                </div>

                {!draft && (
                  <div className="mt-3 space-y-3">
                    {routines.length === 0 && <p className="text-sm text-ink-faint">Aún no tiene rutinas.</p>}
                    {routines.map((r) => (
                      <div key={r.id} className="rounded-xl border border-cream-dark p-3">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0">
                            <p className="font-semibold text-ink">{r.title}</p>
                            {r.updatedBy && <p className="text-[11px] text-ink-faint">👤 Asignada por {nameOf(r.updatedBy)}</p>}
                          </div>
                          <div className="flex gap-2 text-sm shrink-0">
                            <button onClick={() => startEdit(r)} className="text-brand font-medium">Editar</button>
                            <button onClick={() => removeRoutine(r.id)} className="text-red-600">Eliminar</button>
                          </div>
                        </div>
                        <ul className="mt-2 space-y-1 text-sm text-ink-soft">
                          {r.items.map((it, i) => (
                            <li key={i}>
                              • <b>{it.name}</b>
                              {it.sets || it.reps ? ` — ${it.sets || '?'}×${it.reps || '?'}` : ''}
                              {it.load ? ` · ${it.load}` : ''}
                              {it.notes ? ` · ${it.notes}` : ''}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}

                {/* Editor */}
                {draft && (
                  <div className="mt-4 space-y-3">
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-ink-soft">Nombre de la rutina</span>
                      <input
                        className="w-full rounded-xl border border-cream-dark bg-white px-4 py-2.5 outline-none focus:ring-2 ring-brand"
                        placeholder="Ej. Día de pierna"
                        value={draft.title}
                        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                      />
                    </label>
                    <div className="space-y-2">
                      {draft.items.map((it, i) => (
                        <div key={i} className="rounded-xl bg-cream-dark/30 p-2">
                          <div className="flex gap-2">
                            <input
                              className="flex-1 rounded-lg border border-cream-dark bg-white px-3 py-2 text-sm outline-none focus:ring-2 ring-brand"
                              placeholder="Ejercicio (ej. Sentadilla)"
                              value={it.name}
                              onChange={(e) => setItem(i, { name: e.target.value })}
                            />
                            <button onClick={() => removeItem(i)} className="shrink-0 px-2 text-red-600">✕</button>
                          </div>
                          <div className="mt-2 grid grid-cols-3 gap-2">
                            <input className="rounded-lg border border-cream-dark bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 ring-brand" placeholder="Series" value={it.sets} onChange={(e) => setItem(i, { sets: e.target.value })} />
                            <input className="rounded-lg border border-cream-dark bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 ring-brand" placeholder="Reps" value={it.reps} onChange={(e) => setItem(i, { reps: e.target.value })} />
                            <input className="rounded-lg border border-cream-dark bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 ring-brand" placeholder="Carga" value={it.load} onChange={(e) => setItem(i, { load: e.target.value })} />
                          </div>
                          <input className="mt-2 w-full rounded-lg border border-cream-dark bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 ring-brand" placeholder="Notas (opcional)" value={it.notes} onChange={(e) => setItem(i, { notes: e.target.value })} />
                        </div>
                      ))}
                      <button onClick={addItem} className="text-sm font-medium text-brand">+ Agregar ejercicio</button>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" onClick={() => setDraft(null)}>Cancelar</Button>
                      <Button onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar rutina'}</Button>
                    </div>
                  </div>
                )}
              </Card>

              {/* Seguimiento (solo lectura para el staff) */}
              <Card className="p-5">
                <h2 className="font-semibold text-ink mb-2">Seguimiento (peso)</h2>
                {measurements.length === 0 ? (
                  <p className="text-sm text-ink-faint">El miembro aún no registra medidas.</p>
                ) : (
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {measurements.map((m) => (
                      <div key={m.id} className="flex items-center justify-between rounded-lg bg-cream-dark/30 px-3 py-1.5 text-sm">
                        <span className="font-medium text-ink">{m.weightKg != null ? `${m.weightKg} kg` : '—'}</span>
                        <span className="text-ink-faint">{m.note || ''}</span>
                        <span className="text-xs text-ink-faint">{new Date(m.createdAt).toLocaleDateString('es-MX')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      </div>

      {/* Biblioteca de videos (rutinas genéricas por enlace, para todos los miembros) */}
      <Card className="mt-6 p-5">
        <h2 className="font-semibold text-ink mb-1">Biblioteca de videos</h2>
        <p className="text-sm text-ink-faint mb-3">
          Rutinas genéricas que ven todos tus miembros. Pega el enlace del video (YouTube/Vimeo).
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <input className="rounded-xl border border-cream-dark bg-white px-3 py-2 text-sm outline-none focus:ring-2 ring-brand" placeholder="Título (ej. Rutina pierna)" value={vTitle} onChange={(e) => setVTitle(e.target.value)} />
          <input className="rounded-xl border border-cream-dark bg-white px-3 py-2 text-sm outline-none focus:ring-2 ring-brand" placeholder="Enlace del video" value={vUrl} onChange={(e) => setVUrl(e.target.value)} />
          <input className="rounded-xl border border-cream-dark bg-white px-3 py-2 text-sm outline-none focus:ring-2 ring-brand" placeholder="Nivel (opcional)" value={vLevel} onChange={(e) => setVLevel(e.target.value)} />
          <input className="rounded-xl border border-cream-dark bg-white px-3 py-2 text-sm outline-none focus:ring-2 ring-brand" placeholder="Zona/categoría (opcional)" value={vArea} onChange={(e) => setVArea(e.target.value)} />
        </div>
        <div className="mt-2"><Button onClick={addVideoHandler} disabled={!vTitle.trim() || !vUrl.trim()}>+ Agregar video</Button></div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {videos.map((v) => (
            <div key={v.id} className="flex items-center justify-between gap-2 rounded-xl border border-cream-dark p-3">
              <div className="min-w-0">
                <a href={v.url} target="_blank" rel="noreferrer" className="block truncate font-medium text-brand hover:underline">▶ {v.title}</a>
                <p className="text-[11px] text-ink-faint">{[v.level, v.area].filter(Boolean).join(' · ')}</p>
              </div>
              <button onClick={() => removeVideo(v.id)} className="shrink-0 text-red-600">✕</button>
            </div>
          ))}
          {videos.length === 0 && <p className="text-sm text-ink-faint">Aún no hay videos.</p>}
        </div>
      </Card>
    </>
  );
}
