import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../lib/store';
import { fetchCheckinsSince, type Checkin } from '../../lib/access';
import { PageHeader, Card, Badge, Button, EmptyState, Modal } from '../../components/ui';
import Avatar from '../../components/Avatar';
import ImageUpload from '../../components/ImageUpload';
import InviteCard from './InviteCard';
import type { CoachStatus, CoachType, User } from '../../lib/types';

const STATUS_META: Record<CoachStatus, { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  APPROVED: { label: 'Aprobado', tone: 'success' },
  PENDING: { label: 'Pendiente', tone: 'warning' },
  DENIED: { label: 'Denegado', tone: 'danger' },
};

const initials = (name: string) =>
  name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';

type Draft = {
  id: string; fullName: string; email: string; phone: string;
  bio: string; specialties: string; yearsExp: number; avatarUrl?: string;
  coachType: CoachType; externalFeeNote: string; branchId: string;
};

export default function CoachesAdmin() {
  const { currentStudio, studioUsers, setCoachStatus, setCoachType, upsertCoach } = useStore();
  const isGymish = currentStudio!.studioType === 'gym' || currentStudio!.studioType === 'mixed';
  const coaches = studioUsers('COACH');
  const students = studioUsers('STUDENT');
  const branches = currentStudio!.branches ?? [];
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [err, setErr] = useState('');

  // Visitas de los últimos 30 días para el resumen de coaches externos.
  const hasExternos = coaches.some((c) => c.coachType === 'externo');
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  useEffect(() => {
    if (!isGymish || !hasExternos) return;
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    void fetchCheckinsSince(since).then(setCheckins);
  }, [isGymish, hasExternos]);

  // Resumen por coach externo: alumnos ligados y visitas (coach + sus alumnos) en 30 días.
  const externSummary = useMemo(() => {
    const m: Record<string, { students: number; visits: number }> = {};
    for (const c of coaches) {
      if (c.coachType !== 'externo') continue;
      const linked = students.filter((s) => s.externalCoachId === c.id);
      const ids = new Set<string>([c.id, ...linked.map((s) => s.id)]);
      const visits = checkins.filter((ck) => ids.has(ck.userId)).length;
      m[c.id] = { students: linked.length, visits };
    }
    return m;
  }, [coaches, students, checkins]);

  const editDraft = (c: User) => {
    setErr('');
    setDraft({
      id: c.id, fullName: c.fullName, email: c.email, phone: c.phone,
      bio: c.coachProfile?.bio ?? '', specialties: (c.coachProfile?.specialties ?? []).join(', '),
      yearsExp: c.coachProfile?.yearsExp ?? 1, avatarUrl: c.avatarUrl,
      coachType: c.coachType ?? 'fijo', externalFeeNote: c.externalFeeNote ?? '',
      branchId: c.branchId ?? '',
    });
  };

  const save = () => {
    if (!draft) return;
    if (!draft.fullName.trim()) return setErr('Escribe el nombre del coach.');
    if (draft.email.trim() && !/^\S+@\S+\.\S+$/.test(draft.email.trim())) {
      return setErr('El correo no tiene un formato válido.');
    }
    const existing = coaches.find((c) => c.id === draft.id);
    const coach: User = {
      id: draft.id,
      studioId: currentStudio!.id,
      role: 'COACH',
      fullName: draft.fullName,
      email: draft.email,
      phone: draft.phone,
      avatarInitials: initials(draft.fullName),
      avatarUrl: draft.avatarUrl,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      coachStatus: existing?.coachStatus ?? 'APPROVED',
      coachType: isGymish ? draft.coachType : existing?.coachType,
      externalFeeNote: isGymish && draft.coachType === 'externo' ? draft.externalFeeNote.trim() : existing?.externalFeeNote,
      branchId: branches.length ? (draft.branchId || undefined) : existing?.branchId,
      coachProfile: {
        bio: draft.bio,
        specialties: draft.specialties.split(',').map((s) => s.trim()).filter(Boolean),
        yearsExp: draft.yearsExp,
      },
    };
    upsertCoach(coach);
    setDraft(null);
  };

  return (
    <>
      <PageHeader
        title="Coaches"
        subtitle="Aprueba, deniega o edita a tus instructores"
        action={
          <Button onClick={() => setShowInvite((v) => !v)}>
            {showInvite ? 'Ocultar invitación' : '+ Invitar coach'}
          </Button>
        }
      />

      {showInvite && (
        <div className="mb-2">
          <InviteCard ceuCode={currentStudio!.ceuCode} />
          <p className="mb-6 -mt-2 text-sm text-ink-faint">
            Comparte el link o QR de <b>coaches</b> con tu instructor. Se registrará como pendiente y
            aparecerá aquí para que lo apruebes.
          </p>
        </div>
      )}

      {coaches.length === 0 && !showInvite && (
        <EmptyState>
          Aún no tienes coaches. Usa <b>“+ Invitar coach”</b> para compartir el link de registro.
        </EmptyState>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {coaches.map((c) => {
          const meta = STATUS_META[c.coachStatus ?? 'APPROVED'];
          const isExterno = (c.coachType ?? 'fijo') === 'externo';
          return (
            <Card key={c.id} className="p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar url={c.avatarUrl} initials={c.avatarInitials} className="h-12 w-12 text-base" />
                  <div>
                    <h3 className="font-semibold text-ink">{c.fullName}</h3>
                    <p className="text-xs text-ink-faint">{c.phone} · {c.email}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                  {isGymish && <Badge tone={isExterno ? 'warning' : 'neutral'}>{isExterno ? 'Externo' : 'Fijo'}</Badge>}
                </div>
              </div>
              <p className="mt-3 text-sm text-ink-soft">{c.coachProfile?.bio}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {c.coachProfile?.specialties.map((s) => <Badge key={s} tone="neutral">{s}</Badge>)}
              </div>
              {isGymish && isExterno && (
                <div className="mt-3 rounded-xl bg-cream-dark/60 px-3 py-2 space-y-2">
                  <div className="flex gap-4">
                    <div>
                      <p className="text-lg font-black text-ink">{externSummary[c.id]?.students ?? 0}</p>
                      <p className="text-[11px] text-ink-faint">alumnos ligados</p>
                    </div>
                    <div>
                      <p className="text-lg font-black text-ink">{externSummary[c.id]?.visits ?? 0}</p>
                      <p className="text-[11px] text-ink-faint">visitas (30 días)</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-ink-soft">💳 Cómo le cobras</p>
                    <p className="text-sm text-ink">{c.externalFeeNote?.trim() || 'Sin definir — edítalo para registrar el acuerdo.'}</p>
                  </div>
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => editDraft(c)}>Editar</Button>
                {isGymish && (
                  <Button variant="ghost" onClick={() => setCoachType(c.id, isExterno ? 'fijo' : 'externo')}>
                    {isExterno ? 'Marcar como fijo' : 'Marcar como externo'}
                  </Button>
                )}
                {c.coachStatus !== 'APPROVED' && <Button onClick={() => setCoachStatus(c.id, 'APPROVED')}>Aprobar</Button>}
                {c.coachStatus !== 'DENIED' && <Button variant="danger" onClick={() => setCoachStatus(c.id, 'DENIED')}>Denegar</Button>}
              </div>
            </Card>
          );
        })}
      </div>

      {draft && (
        <Modal onClose={() => setDraft(null)} className="w-full max-w-lg">
          <Card className="p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-ink mb-4">Editar coach</h2>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Avatar url={draft.avatarUrl} initials={initials(draft.fullName || '?')} className="h-14 w-14 text-lg" />
                <ImageUpload label="Subir foto" onSelect={(url) => setDraft({ ...draft, avatarUrl: url })} />
                {draft.avatarUrl && <button type="button" onClick={() => setDraft({ ...draft, avatarUrl: undefined })} className="text-sm text-red-600">Quitar</button>}
              </div>
              <Field label="Nombre completo"><input className="input" value={draft.fullName} onChange={(e) => setDraft({ ...draft, fullName: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Teléfono"><input className="input" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></Field>
                <Field label="Años de exp."><input type="number" min="0" className="input" value={draft.yearsExp} onChange={(e) => setDraft({ ...draft, yearsExp: +e.target.value })} /></Field>
              </div>
              <Field label="Correo"><input className="input" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></Field>
              <Field label="Especialidades (separadas por coma)"><input className="input" value={draft.specialties} onChange={(e) => setDraft({ ...draft, specialties: e.target.value })} /></Field>
              <Field label="Biografía"><textarea rows={3} className="input" value={draft.bio} onChange={(e) => setDraft({ ...draft, bio: e.target.value })} /></Field>
              {isGymish && (
                <Field label="Tipo de coach">
                  <div className="grid grid-cols-2 gap-2">
                    {(['fijo', 'externo'] as CoachType[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setDraft({ ...draft, coachType: t })}
                        className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                          draft.coachType === t
                            ? 'border-mint-dark bg-mint-soft/40 text-ink'
                            : 'border-cream-dark bg-white text-ink-faint'
                        }`}
                      >
                        {t === 'fijo' ? 'Fijo (de planta)' : 'Externo (renta espacio)'}
                      </button>
                    ))}
                  </div>
                </Field>
              )}
              {branches.length > 0 && (
                <Field label="Sucursal">
                  <select
                    className="input"
                    value={draft.branchId}
                    onChange={(e) => setDraft({ ...draft, branchId: e.target.value })}
                  >
                    <option value="">— Sede principal —</option>
                    {branches.map((br) => (
                      <option key={br.id} value={br.id}>{br.name}</option>
                    ))}
                  </select>
                </Field>
              )}
              {isGymish && draft.coachType === 'externo' && (
                <Field label="¿Cómo le cobras? (tú defines el acuerdo)">
                  <textarea
                    rows={2}
                    className="input"
                    placeholder="Ej: Renta $2,000/mes · o $100 por visita · o 20% de cada alumno"
                    value={draft.externalFeeNote}
                    onChange={(e) => setDraft({ ...draft, externalFeeNote: e.target.value })}
                  />
                  <span className="mt-1 block text-xs text-ink-faint">
                    Texto libre: mensualidad, renta, por visita, por alumno… lo que acuerdes con el coach.
                  </span>
                </Field>
              )}
            </div>
            {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDraft(null)}>Cancelar</Button>
              <Button onClick={save}>Guardar</Button>
            </div>
            <style>{`.input{width:100%;border:1px solid #E8E3D6;border-radius:.75rem;padding:.6rem .8rem;background:#fff;outline:none}.input:focus{box-shadow:0 0 0 2px var(--brand-primary)}`}</style>
          </Card>
        </Modal>
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
