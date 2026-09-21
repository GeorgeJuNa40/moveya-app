import { useState } from 'react';
import { PageHeader, Button, Card } from '../../components/ui';
import WeekCalendar from '../../components/WeekCalendar';
import { useStore } from '../../lib/store';
import { usd } from '../../lib/format';
import type { ClassSession } from '../../lib/types';

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

// Calendario editable: el estudio crea, edita o elimina clases.
export default function CalendarAdmin() {
  const { db, currentStudio, studioUsers, upsertSession, deleteSession, guestsOf } = useStore();
  const studioId = currentStudio!.id;
  const templates = db.classTemplates.filter((t) => t.studioId === studioId);
  const coaches = studioUsers('COACH').filter((c) => c.coachStatus !== 'DENIED');

  const [draft, setDraft] = useState<ClassSession | null>(null);
  const [startLocal, setStartLocal] = useState('');
  const [guestsFor, setGuestsFor] = useState<ClassSession | null>(null);

  const newDraft = () => {
    const start = new Date();
    start.setHours(start.getHours() + 1, 0, 0, 0);
    setDraft({
      id: 'new', studioId,
      templateId: templates[0]?.id ?? '',
      coachId: coaches[0]?.id ?? null,
      startsAt: start.toISOString(), endsAt: start.toISOString(), capacity: 10,
      recurring: true,
    });
    setStartLocal(toLocalInput(start.toISOString()));
  };

  const editDraft = (s: ClassSession) => {
    setDraft({ ...s });
    setStartLocal(toLocalInput(s.startsAt));
  };

  const save = () => {
    if (!draft || !draft.templateId) return;
    const tpl = templates.find((t) => t.id === draft.templateId)!;
    const start = new Date(startLocal);
    const end = new Date(start.getTime() + tpl.durationMin * 60000);
    upsertSession({ ...draft, startsAt: start.toISOString(), endsAt: end.toISOString() });
    setDraft(null);
  };

  return (
    <>
      <PageHeader
        title="Calendario"
        subtitle="Crea, edita o cancela clases — alumnos y coaches ven los cambios al instante"
        action={<Button onClick={newDraft} disabled={templates.length === 0}>+ Nueva clase</Button>}
      />

      {templates.length === 0 && (
        <Card className="p-4 mb-4 bg-amber-50 border-amber-200 text-sm text-amber-800">
          Primero crea tipos de clase en la sección <strong>Clases</strong>.
        </Card>
      )}

      <WeekCalendar
        filter={(s) => s.studioId === studioId}
        renderAction={(s) => {
          const nGuests = guestsOf(s.id).length;
          return (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => editDraft(s)}>Editar</Button>
              <Button variant="ghost" className="flex-1" onClick={() => setGuestsFor(s)}>
                Invitados{nGuests ? ` (${nGuests})` : ''}
              </Button>
              <Button variant="danger" onClick={() => { if (confirm('¿Cancelar/eliminar esta clase?')) deleteSession(s.id); }}>Eliminar</Button>
            </div>
          );
        }}
      />

      {draft && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4">
          <Card className="w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-ink mb-4">{draft.id === 'new' ? 'Nueva clase' : 'Editar clase'}</h2>
            <div className="space-y-4">
              <Field label="Tipo de clase">
                <select className="input" value={draft.templateId} onChange={(e) => setDraft({ ...draft, templateId: e.target.value })}>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.durationMin} min)</option>)}
                </select>
              </Field>
              <Field label="Coach">
                <select className="input" value={draft.coachId ?? ''} onChange={(e) => setDraft({ ...draft, coachId: e.target.value || null })}>
                  <option value="">Sin asignar</option>
                  {coaches.map((c) => <option key={c.id} value={c.id}>{c.fullName}{c.coachStatus === 'PENDING' ? ' (pendiente)' : ''}</option>)}
                </select>
              </Field>
              <Field label={draft.recurring ? 'Día y hora (de la primera clase)' : 'Fecha y hora'}>
                <input type="datetime-local" className="input" value={startLocal} onChange={(e) => setStartLocal(e.target.value)} />
              </Field>
              <Field label="Capacidad (lugares)">
                <input type="number" className="input" value={draft.capacity} onChange={(e) => setDraft({ ...draft, capacity: +e.target.value })} />
              </Field>
              <label className="flex items-start gap-3 rounded-xl bg-cream-dark/30 p-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-forest"
                  checked={draft.recurring}
                  onChange={(e) => setDraft({ ...draft, recurring: e.target.checked })}
                />
                <span className="text-sm text-ink-soft">
                  <strong className="text-ink">Clase fija semanal</strong> — se repite cada semana. No se borra:
                  al terminar el día se limpian solo las reservas y queda lista para la próxima semana.
                  Desmárcalo si es un <em>evento único</em>.
                </span>
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDraft(null)}>Cancelar</Button>
              <Button onClick={save}>Guardar</Button>
            </div>
            <style>{`.input{width:100%;border:1px solid #E8E3D6;border-radius:.75rem;padding:.6rem .8rem;background:#fff;outline:none}.input:focus{box-shadow:0 0 0 2px var(--brand-primary)}`}</style>
          </Card>
        </div>
      )}

      {guestsFor && <GuestsModal session={guestsFor} onClose={() => setGuestsFor(null)} />}
    </>
  );
}

// Modal para gestionar invitados de una clase: clase de prueba o acompañante 2x1.
function GuestsModal({ session, onClose }: { session: ClassSession; onClose: () => void }) {
  const { db, studioUsers, guestsOf, addGuest, removeGuest, seatsLeft } = useStore();
  const students = studioUsers('STUDENT');
  const tpl = db.classTemplates.find((t) => t.id === session.templateId);
  const guests = guestsOf(session.id);

  const [kind, setKind] = useState<'trial' | 'companion'>('trial');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [cost, setCost] = useState('0');
  const [hostId, setHostId] = useState('');

  const seats = seatsLeft(session.id);
  const canAdd = name.trim() && (kind === 'trial' || hostId) && seats > 0;

  const submit = () => {
    if (!canAdd) return;
    addGuest({
      sessionId: session.id,
      name,
      phone: phone.trim() || undefined,
      kind,
      cost: kind === 'trial' ? Number(cost) || 0 : 0,
      hostUserId: kind === 'companion' ? hostId : null,
    });
    setName(''); setPhone(''); setCost('0'); setHostId('');
  };

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <Card className="w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" >
        <div onClick={(e) => e.stopPropagation()}>
          <h2 className="text-lg font-bold text-ink">Invitados — {tpl?.name}</h2>
          <p className="text-sm text-ink-faint mb-4">
            Agrega personas que asisten sin cuenta: una <strong>clase de prueba</strong> o un{' '}
            <strong>acompañante (2×1)</strong>. Ocupan un lugar. {seats > 0 ? `Quedan ${seats} lugares.` : 'Clase llena.'}
          </p>

          {/* Selector de tipo */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <button
              onClick={() => setKind('trial')}
              className={`rounded-xl border p-3 text-sm text-left ${kind === 'trial' ? 'border-forest bg-forest/5 text-ink' : 'border-cream-dark text-ink-soft'}`}
            >
              <div className="font-semibold">Clase de prueba</div>
              <div className="text-xs text-ink-faint">Alguien que viene a probar.</div>
            </button>
            <button
              onClick={() => setKind('companion')}
              className={`rounded-xl border p-3 text-sm text-left ${kind === 'companion' ? 'border-forest bg-forest/5 text-ink' : 'border-cream-dark text-ink-soft'}`}
            >
              <div className="font-semibold">Acompañante (2×1)</div>
              <div className="text-xs text-ink-faint">Invitado de un alumno.</div>
            </button>
          </div>

          <div className="space-y-3">
            <Field label="Nombre">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Ana López" />
            </Field>
            <Field label="Teléfono (opcional, pero útil)">
              <input className="input" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} placeholder="10 dígitos" />
              <span className="mt-1 block text-xs text-ink-faint">Si después se registra con este teléfono, lo reconocerás en Miembros.</span>
            </Field>
            {kind === 'trial' ? (
              <Field label="Lo que pagó por la clase">
                <input className="input" type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} />
                <span className="mt-1 block text-xs text-ink-faint">0 si fue gratis.</span>
              </Field>
            ) : (
              <Field label="Acompaña a">
                <select className="input" value={hostId} onChange={(e) => setHostId(e.target.value)}>
                  <option value="">Elige un alumno…</option>
                  {students.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
                </select>
              </Field>
            )}
            <Button className="w-full" disabled={!canAdd} onClick={submit}>Agregar</Button>
          </div>

          {/* Lista de invitados */}
          <div className="mt-5 border-t border-cream-dark pt-3">
            <h3 className="text-sm font-semibold text-ink mb-2">En esta clase ({guests.length})</h3>
            {guests.length === 0 && <p className="text-sm text-ink-faint">Aún no hay invitados.</p>}
            <div className="space-y-2">
              {guests.map((g) => {
                const host = g.hostUserId ? db.users.find((u) => u.id === g.hostUserId) : null;
                return (
                  <div key={g.id} className="flex items-center justify-between gap-2 rounded-lg bg-cream-dark/40 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="text-ink truncate">{g.name}</p>
                      <p className="text-xs text-ink-faint">
                        {g.kind === 'trial'
                          ? `Clase de prueba${g.cost > 0 ? ` · ${usd(g.cost)}` : ' · gratis'}`
                          : `Acompaña a ${host?.fullName ?? '—'}`}
                        {g.phone ? ` · ${g.phone}` : ''}
                      </p>
                    </div>
                    <Button variant="ghost" onClick={() => removeGuest(g.id)}>Quitar</Button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <Button variant="ghost" onClick={onClose}>Cerrar</Button>
          </div>
          <style>{`.input{width:100%;border:1px solid #E8E3D6;border-radius:.75rem;padding:.6rem .8rem;background:#fff;outline:none}.input:focus{box-shadow:0 0 0 2px var(--brand-primary)}`}</style>
        </div>
      </Card>
    </div>
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
