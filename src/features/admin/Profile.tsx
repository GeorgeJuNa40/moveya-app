import { useEffect, useState } from 'react';
import { useStore } from '../../lib/store';
import { PageHeader, Card, Button } from '../../components/ui';
import ImageUpload from '../../components/ImageUpload';
import StudioLogo from '../../components/StudioLogo';
import { CURRENCIES } from '../../lib/countries';
import { notifySuccess, notifyError } from '../../lib/notify';
import type { Branding } from '../../lib/types';

// Perfil: la identidad del negocio (datos, logo, white-label, fotos) y los datos
// personales de la cuenta (nombre, teléfono, contraseña). Lo "operativo" (pagos,
// políticas, multisucursal, etc.) vive aparte en Configuración.
export default function Profile() {
  const { currentStudio, currentUser, updateStudioSettings, updateMyProfile, updatePassword, can } = useStore();
  const s = currentStudio!;

  const fonts = [
    'Inter', 'Poppins', 'Montserrat', 'Nunito', 'Lato', 'Work Sans', 'DM Sans',
    'Quicksand', 'Raleway', 'Rubik', 'Manrope', 'Josefin Sans', 'Comfortaa',
    'Playfair Display', 'Merriweather', 'Lora', 'Georgia', 'system-ui',
  ];

  // Borrador local del negocio (solo lo que vive en Perfil).
  const makeDraft = () => ({
    name: s.name,
    phone: s.phone,
    email: s.email,
    address: s.address,
    photos: s.photos,
    branding: { ...s.branding } as Branding,
  });
  const [draft, setDraft] = useState(makeDraft);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDraft(makeDraft());
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.id]);

  const b = draft.branding;
  const setStudio = (patch: Partial<typeof draft>) => { setDraft((d) => ({ ...d, ...patch })); setDirty(true); };
  const setBrand = (patch: Partial<Branding>) => { setDraft((d) => ({ ...d, branding: { ...d.branding, ...patch } })); setDirty(true); };
  const addPhoto = (dataUrl: string) => setStudio({ photos: [...draft.photos, dataUrl] });
  const removePhoto = (i: number) => setStudio({ photos: draft.photos.filter((_, idx) => idx !== i) });

  const save = () => {
    // Guarda SOLO los campos del negocio que administra esta página (no pisa lo
    // que se edita en Configuración).
    updateStudioSettings(
      { name: draft.name, phone: draft.phone, email: draft.email, address: draft.address, photos: draft.photos },
      {
        logoText: b.logoText, logoUrl: b.logoUrl, logoShape: b.logoShape, currencyCode: b.currencyCode,
        primaryColor: b.primaryColor, secondaryColor: b.secondaryColor, accentColor: b.accentColor,
        textColor: b.textColor, fontFamily: b.fontFamily,
      },
    );
    setDirty(false);
    notifySuccess('Perfil del negocio guardado.');
  };
  const discard = () => { setDraft(makeDraft()); setDirty(false); };

  return (
    <>
      <PageHeader title="Perfil" subtitle="Tu negocio y tu cuenta" />

      <div className="mx-auto max-w-3xl space-y-6">
        {/* A · Datos personales de la cuenta */}
        <AccountCard
          fullName={currentUser!.fullName}
          email={currentUser!.email}
          phone={currentUser!.phone}
          onSaveProfile={(fullName, phone) => updateMyProfile({ fullName, phone })}
          onChangePassword={updatePassword}
        />

        {/* 1 · Datos del negocio */}
        <Card className="p-6 space-y-4">
          <h2 className="font-semibold text-ink">1 · Datos del negocio</h2>
          <Field label="Nombre del negocio">
            <input className="input" value={draft.name} onChange={(e) => setStudio({ name: e.target.value })} />
          </Field>
          <Field label="Nombre visible (texto, si no subes logo)">
            <input className="input" value={b.logoText} onChange={(e) => setBrand({ logoText: e.target.value })} />
          </Field>
          <div>
            <span className="mb-1 block text-sm font-medium text-ink-soft">Logo del estudio (imagen)</span>
            <div className="flex items-center gap-3">
              <div className="grid h-12 min-w-[3rem] place-items-center rounded-lg bg-cream-dark/40 px-2">
                <StudioLogo branding={b} imgClass="h-10 max-w-[120px]" textClass="text-sm font-bold text-brand" />
              </div>
              <ImageUpload label="Subir logo" onSelect={(url) => setBrand({ logoUrl: url })} />
              {b.logoUrl && (
                <button type="button" onClick={() => setBrand({ logoUrl: undefined })} className="text-sm text-red-600">Quitar</button>
              )}
            </div>
            <p className="mt-1 text-xs text-ink-faint">Se muestra en la barra lateral y el encabezado, visible para admin, coaches y alumnos.</p>
            {b.logoUrl && (
              <div className="mt-3">
                <span className="mb-1 block text-sm font-medium text-ink-soft">Forma del logo</span>
                <div className="flex gap-2">
                  {([
                    { v: 'rounded', label: 'Cuadrado redondeado' },
                    { v: 'circle', label: 'Círculo' },
                  ] as const).map((opt) => (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setBrand({ logoShape: opt.v })}
                      className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                        (b.logoShape ?? 'rounded') === opt.v ? 'bg-brand text-cream-light' : 'bg-cream-dark text-ink-soft hover:bg-cream'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Teléfono"><input className="input" value={draft.phone} onChange={(e) => setStudio({ phone: e.target.value })} /></Field>
            <Field label="Correo"><input className="input" value={draft.email} onChange={(e) => setStudio({ email: e.target.value })} /></Field>
          </div>
          <Field label="Dirección">
            <input className="input" value={draft.address} onChange={(e) => setStudio({ address: e.target.value })} />
          </Field>
          <Field label="Moneda (se aplica a los precios de tus paquetes)">
            <select className="input" value={b.currencyCode ?? 'USD'} onChange={(e) => setBrand({ currencyCode: e.target.value })}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </Card>

        {/* 2 · White-label (branding) — plan Pro */}
        {can('whitelabel') ? (
          <Card className="p-6 space-y-4">
            <div>
              <h2 className="font-semibold text-ink">2 · White-label (tu marca)</h2>
              <p className="mt-1 text-sm text-ink-faint">
                Personaliza los colores y la tipografía de <strong>toda la app</strong> con tu marca.
                Los cambios se aplican al tocar <strong>Guardar cambios</strong>.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-4">
                <ColorField label="Color primario" value={b.primaryColor} onChange={(v) => setBrand({ primaryColor: v })} />
                <ColorField label="Color secundario (fondo)" value={b.secondaryColor} onChange={(v) => setBrand({ secondaryColor: v })} />
                <ColorField label="Color de acento (detalles de marca)" value={b.accentColor} onChange={(v) => setBrand({ accentColor: v })} />
                <ColorField label="Color del texto" value={b.textColor ?? b.accentColor} onChange={(v) => setBrand({ textColor: v })} />
                <Field label="Tipografía">
                  <select className="input" value={b.fontFamily} onChange={(e) => setBrand({ fontFamily: e.target.value })}>
                    {fonts.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
                  </select>
                </Field>
              </div>
              <div>
                <p className="text-xs uppercase text-ink-faint mb-2">Vista previa</p>
                <div className="rounded-2xl p-6 border" style={{ background: b.secondaryColor, borderColor: b.primaryColor }}>
                  <p className="text-2xl font-black" style={{ color: b.primaryColor, fontFamily: b.fontFamily }}>{b.logoText}</p>
                  <p className="mt-2" style={{ color: b.textColor ?? b.accentColor, fontFamily: b.fontFamily }}>Encuentra tu equilibrio. Reserva tu próxima clase.</p>
                  <button className="mt-4 rounded-xl px-4 py-2 text-sm font-semibold" style={{ background: b.primaryColor, color: b.secondaryColor }}>Reservar clase</button>
                </div>
              </div>
            </div>
          </Card>
        ) : (
          <LockedFeature title="2 · White-label (tu marca y colores)" plan="Pro" desc="Personaliza los colores y la tipografía de toda la app con tu marca." />
        )}

        {/* 3 · Fotos del negocio */}
        <Card className="p-6">
          <h2 className="font-semibold text-ink mb-3">3 · Fotos del negocio</h2>
          <ImageUpload variant="dropzone" label="Subir foto desde tu dispositivo" className="w-full mb-4" onSelect={addPhoto} />
          {draft.photos.length === 0 ? (
            <div className="rounded-xl border border-dashed border-cream-dark p-8 text-center text-ink-faint text-sm">Aún no has agregado fotos.</div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {draft.photos.map((p, i) => (
                <div key={i} className="relative group">
                  <img src={p} alt="" className="h-24 w-full object-cover rounded-lg" />
                  <button onClick={() => removePhoto(i)} className="absolute top-1 right-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white text-xs">✕</button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Barra de guardado del negocio (los datos personales se guardan aparte) */}
      <div className="sticky bottom-0 z-10 mt-6 -mx-4 border-t border-cream-dark bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <p className="text-sm text-ink-soft">{dirty ? '● Tienes cambios sin guardar' : '✓ Todo guardado'}</p>
          <div className="flex gap-2">
            {dirty && <Button variant="ghost" onClick={discard}>Descartar</Button>}
            <Button onClick={save} disabled={!dirty}>Guardar cambios</Button>
          </div>
        </div>
      </div>

      <style>{`.input{width:100%;border:1px solid #E8E3D6;border-radius:.75rem;padding:.6rem .8rem;background:#fff;outline:none}.input:focus{box-shadow:0 0 0 2px var(--brand-primary)}`}</style>
    </>
  );
}

// Datos personales de la cuenta: nombre, teléfono y contraseña. Guardado
// inmediato por acción (no usa la barra del negocio).
function AccountCard({
  fullName, email, phone, onSaveProfile, onChangePassword,
}: {
  fullName: string;
  email: string;
  phone: string;
  onSaveProfile: (fullName: string, phone: string) => void;
  onChangePassword: (newPassword: string) => Promise<void>;
}) {
  const [name, setName] = useState(fullName);
  const [tel, setTel] = useState(phone);
  const profileDirty = name.trim() !== fullName.trim() || tel.trim() !== phone.trim();

  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [saving, setSaving] = useState(false);

  const saveProfile = () => {
    if (!name.trim()) { notifyError('perfil', 'El nombre no puede quedar vacío.'); return; }
    onSaveProfile(name.trim(), tel.trim());
    notifySuccess('Tus datos se guardaron.');
  };

  const changePass = async () => {
    if (pass.length < 6) { notifyError('contraseña', 'La contraseña debe tener al menos 6 caracteres.'); return; }
    if (pass !== pass2) { notifyError('contraseña', 'Las contraseñas no coinciden.'); return; }
    setSaving(true);
    try {
      await onChangePassword(pass);
      setPass(''); setPass2('');
      notifySuccess('Contraseña actualizada.');
    } catch (e) {
      notifyError('contraseña', (e as Error)?.message ?? 'No se pudo actualizar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h2 className="font-semibold text-ink">Mis datos (cuenta)</h2>
        <p className="mt-1 text-sm text-ink-faint">Los datos con los que entras a la app. Solo tú los ves.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tu nombre"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Tu teléfono"><input className="input" value={tel} onChange={(e) => setTel(e.target.value)} /></Field>
      </div>
      <Field label="Correo (con el que inicias sesión)">
        <input className="input bg-cream-dark/30 text-ink-faint" value={email} readOnly />
        <span className="mt-1 block text-xs text-ink-faint">Para cambiar tu correo, escríbenos a soporte.</span>
      </Field>
      <div className="flex justify-end">
        <Button onClick={saveProfile} disabled={!profileDirty}>Guardar mis datos</Button>
      </div>

      <div className="border-t border-cream-dark pt-4">
        <h3 className="text-sm font-semibold text-ink">Cambiar contraseña</h3>
        <p className="mt-0.5 text-xs text-ink-faint">Si la olvidaste o quieres cambiarla, escribe una nueva.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Nueva contraseña">
            <input type="password" className="input" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Mínimo 6 caracteres" autoComplete="new-password" />
          </Field>
          <Field label="Repite la contraseña">
            <input type="password" className="input" value={pass2} onChange={(e) => setPass2(e.target.value)} autoComplete="new-password" />
          </Field>
        </div>
        <div className="mt-3 flex justify-end">
          <Button variant="secondary" onClick={changePass} disabled={saving || !pass || !pass2}>
            {saving ? 'Guardando…' : 'Actualizar contraseña'}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-4">
      <span className="text-sm font-medium text-ink-soft">{label}</span>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-9 rounded-lg border border-cream-dark cursor-pointer" />
        <input value={value} onChange={(e) => onChange(e.target.value)} className="w-24 rounded-lg border border-cream-dark px-2 py-1.5 text-sm font-mono" />
      </div>
    </label>
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

function LockedFeature({ title, plan, desc }: { title: string; plan: string; desc: string }) {
  return (
    <Card className="p-6">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-100 text-lg">✦</div>
        <div>
          <p className="font-semibold text-ink">{title}</p>
          <p className="mt-1 text-sm text-ink-soft">{desc}</p>
          <p className="mt-2 text-sm">
            <span className="rounded-full bg-cream-dark/60 px-2 py-0.5 text-xs font-semibold text-ink-soft">Disponible en el plan {plan}</span>{' '}
            <a href="#/admin/subscription" className="font-medium text-brand">Ver planes ↗</a>
          </p>
        </div>
      </div>
    </Card>
  );
}
