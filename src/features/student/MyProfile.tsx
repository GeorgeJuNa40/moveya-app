import { useState } from 'react';
import { useStore } from '../../lib/store';
import { PageHeader, Card, Button } from '../../components/ui';
import Avatar from '../../components/Avatar';
import ImageUpload from '../../components/ImageUpload';
import { notifySuccess, notifyError } from '../../lib/notify';

// Perfil del alumno: puede corregir su nombre y teléfono, cambiar su foto y
// (si lo necesita) su contraseña. El correo de acceso se muestra, pero no se
// edita aquí para no romper su inicio de sesión.
export default function MyProfile() {
  const { currentUser, updateMyProfile, updateUserAvatar, updatePassword } = useStore();
  const u = currentUser!;

  const [name, setName] = useState(u.fullName);
  const [phone, setPhone] = useState(u.phone);
  const dirty = name.trim() !== u.fullName.trim() || phone.trim() !== (u.phone ?? '').trim();

  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [saving, setSaving] = useState(false);

  const inp = 'w-full rounded-xl border border-cream-dark bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 ring-brand';

  const saveProfile = () => {
    if (!name.trim()) { notifyError('perfil', 'El nombre no puede quedar vacío.'); return; }
    updateMyProfile({ fullName: name.trim(), phone: phone.trim() });
    notifySuccess('Tus datos se guardaron.');
  };

  const changePass = async () => {
    if (pass.length < 6) { notifyError('contraseña', 'La contraseña debe tener al menos 6 caracteres.'); return; }
    if (pass !== pass2) { notifyError('contraseña', 'Las contraseñas no coinciden.'); return; }
    setSaving(true);
    try {
      await updatePassword(pass);
      setPass(''); setPass2('');
      notifySuccess('Contraseña actualizada.');
    } catch (e) {
      notifyError('contraseña', (e as Error)?.message ?? 'No se pudo actualizar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title="Mi perfil" subtitle="Tus datos y tu cuenta" />

      <div className="mx-auto max-w-xl space-y-6">
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Avatar url={u.avatarUrl} initials={u.avatarInitials} className="h-14 w-14 text-lg" />
            <ImageUpload label="Cambiar foto" onSelect={(url) => updateUserAvatar(u.id, url)} />
          </div>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-soft">Tu nombre</span>
            <input className={inp} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-soft">Tu teléfono</span>
            <input className={inp} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-soft">Correo (con el que inicias sesión)</span>
            <input className={`${inp} bg-cream-dark/30 text-ink-faint`} value={u.email} readOnly />
            <span className="mt-1 block text-xs text-ink-faint">Para cambiar tu correo, pídelo en tu estudio.</span>
          </label>

          <div className="flex justify-end">
            <Button onClick={saveProfile} disabled={!dirty}>Guardar mis datos</Button>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-sm font-semibold text-ink">Cambiar contraseña</h2>
          <p className="mt-0.5 text-xs text-ink-faint">Si la olvidaste o quieres cambiarla, escribe una nueva.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-soft">Nueva contraseña</span>
              <input type="password" className={inp} value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Mínimo 6 caracteres" autoComplete="new-password" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-soft">Repite la contraseña</span>
              <input type="password" className={inp} value={pass2} onChange={(e) => setPass2(e.target.value)} autoComplete="new-password" />
            </label>
          </div>
          <div className="mt-3 flex justify-end">
            <Button variant="secondary" onClick={changePass} disabled={saving || !pass || !pass2}>
              {saving ? 'Guardando…' : 'Actualizar contraseña'}
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}
