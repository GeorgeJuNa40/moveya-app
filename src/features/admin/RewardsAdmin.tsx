import { useMemo, useState } from 'react';
import { useStore } from '../../lib/store';
import { PageHeader, Card, Button, Badge } from '../../components/ui';
import { fmtDay } from '../../lib/format';
import type { Reward } from '../../lib/types';

const emptyDraft = (studioId: string): Reward => ({
  id: 'new', studioId, name: '', description: '', starCost: 10, active: true,
});

// Plan de recompensas editable — el estudio incentiva a sus alumnos.
export default function RewardsAdmin() {
  const { db, currentStudio, studioUsers, starBalance, goalProgress, upsertReward, deleteReward, updateBranding } = useStore();
  const rewards = db.rewards.filter((r) => r.studioId === currentStudio!.id);
  const goalReward = currentStudio!.branding.goalStarReward ?? 5;
  const [draft, setDraft] = useState<Reward | null>(null);

  const students = studioUsers('STUDENT');
  const nameOf = (userId: string) => db.users.find((u) => u.id === userId)?.fullName ?? 'Alumno';

  // Canjes recientes (quién canjeó qué y cuándo).
  const redemptions = useMemo(
    () =>
      db.stars
        .filter((s) => s.reason === 'redemption')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 20)
        .map((s) => ({
          entry: s,
          student: nameOf(s.userId),
          reward: s.rewardId ? db.rewards.find((r) => r.id === s.rewardId)?.name : undefined,
          cost: -s.delta,
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db.stars, db.rewards, db.users],
  );

  // Ranking de estrellas + a cuánto están de la recompensa activa más barata.
  const cheapest = rewards.filter((r) => r.active).sort((a, b) => a.starCost - b.starCost)[0];
  const ranking = useMemo(
    () =>
      students
        .map((s) => ({ s, balance: starBalance(s.id) }))
        .filter((x) => x.balance > 0)
        .sort((a, b) => b.balance - a.balance),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [students, db.stars],
  );

  // Metas de los alumnos con su avance.
  const goalsWithProgress = useMemo(
    () =>
      db.goals
        .filter((g) => students.some((s) => s.id === g.userId))
        .map((g) => ({ g, student: nameOf(g.userId), progress: goalProgress(g) }))
        .sort((a, b) => Number(a.g.achieved) - Number(b.g.achieved)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db.goals, students, db.bookings],
  );

  const save = () => {
    if (!draft || !draft.name.trim()) return;
    upsertReward(draft);
    setDraft(null);
  };

  return (
    <>
      <PageHeader
        title="Recompensas"
        subtitle="Gamificación: define premios canjeables con estrellas para incentivar a tus alumnos"
        action={<Button onClick={() => setDraft(emptyDraft(currentStudio!.id))}>+ Nueva recompensa</Button>}
      />

      <Card className="p-4 mb-6 bg-cream-dark/40 text-sm text-ink-soft">
        Los alumnos ganan <strong>1 estrella por asistencia</strong> y las canjean por estas recompensas.
      </Card>

      {/* Configuración de metas: el alumno se pone sus propias metas de asistencia. */}
      <Card className="p-5 mb-6">
        <h2 className="font-semibold text-ink">Metas de tus alumnos</h2>
        <p className="text-sm text-ink-faint mt-1">
          Cada alumno se pone sus propias metas de asistencia y la app lleva el conteo. Define cuántas
          estrellas gana al cumplir una meta (pon 0 si no quieres dar estrellas por metas).
        </p>
        <label className="mt-3 flex items-center gap-3">
          <span className="text-sm font-medium text-ink-soft">Estrellas por meta cumplida</span>
          <input
            type="number"
            min="0"
            className="w-24 rounded-xl border border-cream-dark px-3 py-2 outline-none focus:ring-2 ring-brand"
            value={goalReward}
            onChange={(e) => updateBranding({ goalStarReward: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
          />
          <span className="text-brand">★</span>
        </label>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rewards.map((r) => {
          const redeemed = db.stars.filter((s) => s.reason === 'redemption' && s.rewardId === r.id).length;
          return (
            <Card key={r.id} className="p-5 flex flex-col">
              <div className="flex items-start justify-between">
                <h3 className="font-semibold text-ink">{r.name}</h3>
                <Badge tone={r.active ? 'brand' : 'neutral'}>★ {r.starCost}</Badge>
              </div>
              <p className="text-sm text-ink-faint mt-1 flex-1">{r.description}</p>
              <p className="text-xs text-ink-faint mt-2">{r.active ? 'Activa' : 'Inactiva'} · {redeemed} canjes totales</p>
              <div className="mt-3 flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => setDraft({ ...r })}>Editar</Button>
                <Button variant="ghost" onClick={() => upsertReward({ ...r, active: !r.active })}>{r.active ? 'Ocultar' : 'Activar'}</Button>
                <Button variant="danger" onClick={() => { if (confirm(`¿Eliminar "${r.name}"?`)) deleteReward(r.id); }}>✕</Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* ---- Visibilidad para el estudio ---- */}
      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        {/* Canjes recientes */}
        <Card className="p-5">
          <h2 className="font-semibold text-ink mb-1">Canjes recientes</h2>
          <p className="text-xs text-ink-faint mb-3">Qué recompensa canjeó cada alumno.</p>
          {redemptions.length === 0 && <p className="text-sm text-ink-faint">Aún no hay canjes.</p>}
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {redemptions.map(({ entry, student, reward, cost }) => (
              <div key={entry.id} className="rounded-lg bg-cream-dark/40 px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-ink truncate">{student}</span>
                  <span className="shrink-0 text-brand font-semibold">★ {cost}</span>
                </div>
                <p className="text-xs text-ink-faint">{reward ?? 'Recompensa'} · {fmtDay(entry.createdAt)}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Estrellas de los alumnos */}
        <Card className="p-5">
          <h2 className="font-semibold text-ink mb-1">Estrellas de tus alumnos</h2>
          <p className="text-xs text-ink-faint mb-3">
            {cheapest ? <>Recompensa más cercana: <strong>{cheapest.name}</strong> (★ {cheapest.starCost}).</> : 'Crea una recompensa para ver el avance.'}
          </p>
          {ranking.length === 0 && <p className="text-sm text-ink-faint">Nadie tiene estrellas todavía.</p>}
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {ranking.map(({ s, balance }) => {
              const missing = cheapest ? cheapest.starCost - balance : 0;
              return (
                <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-cream-dark/40 px-3 py-2 text-sm">
                  <span className="font-medium text-ink truncate">{s.fullName}</span>
                  <span className="shrink-0 text-xs">
                    <span className="text-brand font-semibold">★ {balance}</span>
                    {cheapest && (missing <= 0
                      ? <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 font-semibold text-green-700">¡Ya puede canjear!</span>
                      : <span className="ml-2 text-ink-faint">a {missing}★</span>)}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Metas de los alumnos */}
        <Card className="p-5">
          <h2 className="font-semibold text-ink mb-1">Metas de tus alumnos</h2>
          <p className="text-xs text-ink-faint mb-3">Avance de las metas de asistencia que se pusieron.</p>
          {goalsWithProgress.length === 0 && <p className="text-sm text-ink-faint">Aún no hay metas.</p>}
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {goalsWithProgress.map(({ g, student, progress }) => {
              const pct = Math.min(100, Math.round((progress / Math.max(1, g.targetValue)) * 100));
              return (
                <div key={g.id} className="rounded-lg bg-cream-dark/40 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-ink truncate">{student}</span>
                    {g.achieved
                      ? <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">Cumplida</span>
                      : <span className="shrink-0 text-xs text-ink-faint">{progress}/{g.targetValue}</span>}
                  </div>
                  <p className="text-xs text-ink-faint truncate">{g.title}</p>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-cream-dark">
                    <div className="h-1.5 rounded-full bg-brand" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {draft && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4">
          <Card className="w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-ink mb-4">{draft.id === 'new' ? 'Nueva recompensa' : 'Editar recompensa'}</h2>
            <div className="space-y-4">
              <Field label="Nombre"><input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
              <Field label="Descripción"><textarea rows={2} className="input" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
              <Field label="Costo en estrellas"><input type="number" className="input" value={draft.starCost} onChange={(e) => setDraft({ ...draft, starCost: +e.target.value })} /></Field>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDraft(null)}>Cancelar</Button>
              <Button onClick={save}>Guardar</Button>
            </div>
            <style>{`.input{width:100%;border:1px solid #E8E3D6;border-radius:.75rem;padding:.6rem .8rem;background:#fff;outline:none}.input:focus{box-shadow:0 0 0 2px var(--brand-primary)}`}</style>
          </Card>
        </div>
      )}
    </>
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
