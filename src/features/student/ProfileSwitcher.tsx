import { useState } from 'react';
import { useStore } from '../../lib/store';
import { Card, Button } from '../../components/ui';
import Avatar from '../../components/Avatar';
import { notifyError } from '../../lib/notify';

// Selector de perfil (subcuentas): el titular cambia entre su perfil y el de sus
// familiares. Toda la app del alumno opera sobre el perfil elegido.
export default function ProfileSwitcher({ variant = 'compact' }: { variant?: 'compact' | 'full' }) {
  const { accountUser, activeProfileId, linkedProfiles, currentUser, switchProfile } = useStore();
  const [adding, setAdding] = useState(false);

  if (!accountUser) return null;
  // Solo tiene sentido para alumnos (los demás roles no gestionan familiares).
  if (accountUser.role !== 'STUDENT') return null;

  const activeId = activeProfileId ?? accountUser.id;
  const chip = (id: string, name: string, initials?: string, isTitular = false) => {
    const on = activeId === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => switchProfile(id)}
        className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
          on ? 'border-brand bg-brand text-cream-light shadow-soft' : 'border-cream-dark bg-white text-ink-soft'
        }`}
      >
        <Avatar initials={initials ?? ''} className="h-6 w-6 text-[10px]" />
        <span className="max-w-[9rem] truncate">{isTitular ? `${name.split(' ')[0]} (tú)` : name}</span>
      </button>
    );
  };

  // Vista "compact": fila de chips para el inicio del alumno.
  if (variant === 'compact') {
    // Si no hay familiares, un solo botón discreto para agregar.
    if (linkedProfiles.length === 0) {
      return (
        <>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-sm font-medium text-brand"
          >
            ＋ Agregar familiar (reserva por tu hijo/a o un adulto mayor)
          </button>
          {adding && <AddFamiliarModal onClose={() => setAdding(false)} />}
        </>
      );
    }
    return (
      <Card className="p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">Perfil activo</p>
        <div className="flex flex-wrap items-center gap-2">
          {chip(accountUser.id, accountUser.fullName, accountUser.avatarInitials, true)}
          {linkedProfiles.map((f) => chip(f.id, f.fullName, f.avatarInitials))}
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-full border border-dashed border-cream-dark px-3 py-1.5 text-sm font-semibold text-ink-soft"
          >
            ＋ Familiar
          </button>
        </div>
        {activeId !== accountUser.id && (
          <p className="mt-2 text-xs text-ink-faint">
            Estás gestionando el perfil de <b>{currentUser?.fullName}</b>. Lo que reserves o compres es para esta persona.
          </p>
        )}
        {adding && <AddFamiliarModal onClose={() => setAdding(false)} />}
      </Card>
    );
  }

  // Vista "full": gestión en Mi perfil (lista + editar + agregar).
  return (
    <Card className="p-6 space-y-3">
      <div>
        <h2 className="font-semibold text-ink">Mis familiares</h2>
        <p className="mt-0.5 text-sm text-ink-faint">
          Agrega a tu hijo/a (menor) o a un adulto mayor para llevar su membresía y reservar por ellos con tu misma cuenta.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {chip(accountUser.id, accountUser.fullName, accountUser.avatarInitials, true)}
        {linkedProfiles.map((f) => chip(f.id, f.fullName, f.avatarInitials))}
      </div>
      {linkedProfiles.map((f) => (
        <FamiliarRow key={f.id} id={f.id} name={f.fullName} phone={f.phone} />
      ))}
      <Button variant="secondary" onClick={() => setAdding(true)}>＋ Agregar familiar</Button>
      {adding && <AddFamiliarModal onClose={() => setAdding(false)} />}
    </Card>
  );
}

function FamiliarRow({ id, name, phone }: { id: string; name: string; phone: string }) {
  const { updateLinkedProfile, switchProfile } = useStore();
  const [open, setOpen] = useState(false);
  const [n, setN] = useState(name);
  const [p, setP] = useState(phone);
  const inp = 'w-full rounded-xl border border-cream-dark bg-white px-3 py-2 text-sm outline-none focus:ring-2 ring-brand';
  return (
    <div className="rounded-xl bg-cream-dark/40 p-3">
      {!open ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-ink">{name}</span>
          <div className="flex gap-2">
            <button onClick={() => switchProfile(id)} className="text-sm font-medium text-brand">Usar</button>
            <button onClick={() => { setN(name); setP(phone); setOpen(true); }} className="text-sm font-medium text-ink-soft">Editar</button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <input className={inp} value={n} onChange={(e) => setN(e.target.value)} placeholder="Nombre" />
          <input className={inp} value={p} onChange={(e) => setP(e.target.value)} placeholder="Teléfono (opcional)" />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button disabled={!n.trim()} onClick={async () => { await updateLinkedProfile(id, { fullName: n.trim(), phone: p.trim() }); setOpen(false); }}>Guardar</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddFamiliarModal({ onClose }: { onClose: () => void }) {
  const { addLinkedProfile } = useStore();
  const [name, setName] = useState('');
  const [birth, setBirth] = useState('');
  const [saving, setSaving] = useState(false);
  const inp = 'w-full rounded-xl border border-cream-dark bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 ring-brand';

  const save = async () => {
    if (!name.trim()) { notifyError('familiar', 'Escribe el nombre.'); return; }
    setSaving(true);
    await addLinkedProfile(name.trim(), birth || undefined);
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <Card className="w-full max-w-sm p-6" >
        <div onClick={(e) => e.stopPropagation()}>
          <h2 className="mb-1 text-lg font-bold text-ink">Agregar familiar</h2>
          <p className="mb-4 text-sm text-ink-faint">
            Crea un perfil para tu hijo/a o un adulto mayor. Usa tu misma cuenta; podrás cambiar entre perfiles cuando quieras.
          </p>
          <label className="mb-3 block">
            <span className="mb-1 block text-sm font-medium text-ink-soft">Nombre completo</span>
            <input className={inp} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-soft">Fecha de nacimiento (opcional)</span>
            <input type="date" className={inp} value={birth} onChange={(e) => setBirth(e.target.value)} />
          </label>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button disabled={saving || !name.trim()} onClick={save}>{saving ? 'Agregando…' : 'Agregar'}</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
