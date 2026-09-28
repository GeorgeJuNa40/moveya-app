import { useEffect, useState } from 'react';
import { useStore } from '../../lib/store';
import { PageHeader, Card, Button } from '../../components/ui';
import ImageUpload from '../../components/ImageUpload';
import StudioLogo from '../../components/StudioLogo';
import InviteCard from './InviteCard';
import InfoPageEditor from './InfoPageEditor';
import { CURRENCIES } from '../../lib/countries';
import type { Branding, StudioInfoPage } from '../../lib/types';

// Configuración: datos del negocio, fotos y White-label (branding).
// Los cambios se guardan SOLO al tocar "Guardar cambios" (no en automático).
export default function Settings() {
  const { currentStudio, updateStudio, updateBranding, can } = useStore();
  const s = currentStudio!;
  // Tipografías disponibles (cargadas en index.html). El estudio elige la suya.
  const fonts = [
    'Inter',
    'Poppins',
    'Montserrat',
    'Nunito',
    'Lato',
    'Work Sans',
    'DM Sans',
    'Quicksand',
    'Raleway',
    'Rubik',
    'Manrope',
    'Josefin Sans',
    'Comfortaa',
    'Playfair Display',
    'Merriweather',
    'Lora',
    'Georgia',
    'system-ui',
  ];

  // Borrador local: aquí viven los cambios hasta que se guardan.
  const makeDraft = () => ({
    name: s.name,
    studioType: (s.studioType ?? 'studio') as 'studio' | 'gym' | 'mixed',
    phone: s.phone,
    email: s.email,
    address: s.address,
    photos: s.photos,
    branding: { ...s.branding } as Branding,
  });
  const [draft, setDraft] = useState(makeDraft);
  const [dirty, setDirty] = useState(false);

  // Si cambia el estudio (recarga / cambio de sesión), re-sincroniza el borrador.
  useEffect(() => {
    setDraft(makeDraft());
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.id]);

  const b = draft.branding;
  const setStudio = (patch: Partial<typeof draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };
  const setBrand = (patch: Partial<Branding>) => {
    setDraft((d) => ({ ...d, branding: { ...d.branding, ...patch } }));
    setDirty(true);
  };

  const addPhoto = (dataUrl: string) => setStudio({ photos: [...draft.photos, dataUrl] });
  const removePhoto = (i: number) => setStudio({ photos: draft.photos.filter((_, idx) => idx !== i) });

  const save = () => {
    updateStudio({ name: draft.name, studioType: draft.studioType, phone: draft.phone, email: draft.email, address: draft.address, photos: draft.photos });
    updateBranding(draft.branding);
    setDirty(false);
  };
  const discard = () => {
    setDraft(makeDraft());
    setDirty(false);
  };

  return (
    <>
      <PageHeader title="Configuración" subtitle="Datos de tu negocio, fotos y personalización White-label" />

      <InviteCard ceuCode={s.ceuCode} />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Datos del negocio */}
        <Card className="p-6 space-y-4">
          <h2 className="font-semibold text-ink">Datos del negocio</h2>
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
                        (b.logoShape ?? 'rounded') === opt.v
                          ? 'bg-brand text-cream-light'
                          : 'bg-cream-dark text-ink-soft hover:bg-cream'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-ink-faint">
                  Si tu logo es cuadrado, "redondeado" le suaviza las esquinas. Si es circular, elige "Círculo".
                </p>
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
            <select
              className="input"
              value={b.currencyCode ?? 'USD'}
              onChange={(e) => setBrand({ currencyCode: e.target.value })}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
          <div>
            <span className="mb-1 block text-sm font-medium text-ink-soft">Tipo de negocio</span>
            <div className="grid grid-cols-3 gap-2">
              {([
                { v: 'studio', t: 'Estudio', d: 'Clases con cupo' },
                { v: 'gym', t: 'Gimnasio', d: 'Acceso libre' },
                { v: 'mixed', t: 'Mixto', d: 'Clases + acceso' },
              ] as const).map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setStudio({ studioType: opt.v })}
                  className={`rounded-xl border px-2 py-2.5 text-center transition ${
                    draft.studioType === opt.v
                      ? 'border-brand bg-brand-soft text-brand'
                      : 'border-cream-dark bg-white text-ink-soft hover:border-brand-soft'
                  }`}
                >
                  <span className="block text-sm font-semibold">{opt.t}</span>
                  <span className="block text-[11px] leading-tight text-ink-faint">{opt.d}</span>
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-ink-faint">
              Define qué ve tu equipo y tus miembros. El <b>gimnasio</b> usará membresías y control de acceso (próximamente); el <b>mixto</b> combina clases y acceso.
            </p>
          </div>
        </Card>

        {/* Fotos */}
        <Card className="p-6">
          <h2 className="font-semibold text-ink mb-3">Fotos del estudio</h2>
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

        {/* White-label — función del plan Pro */}
        {can('whitelabel') ? (
          <>
            <Card className="p-6 space-y-4">
              <h2 className="font-semibold text-ink">White-label (branding)</h2>
              <ColorField label="Color primario" value={b.primaryColor} onChange={(v) => setBrand({ primaryColor: v })} />
              <ColorField label="Color secundario (fondo)" value={b.secondaryColor} onChange={(v) => setBrand({ secondaryColor: v })} />
              <ColorField label="Color de acento / texto" value={b.accentColor} onChange={(v) => setBrand({ accentColor: v })} />
              <Field label="Tipografía">
                <select className="input" value={b.fontFamily} onChange={(e) => setBrand({ fontFamily: e.target.value })}>
                  {fonts.map((f) => (
                    <option key={f} value={f} style={{ fontFamily: f }}>
                      {f}
                    </option>
                  ))}
                </select>
              </Field>
            </Card>

            {/* Vista previa White-label */}
            <Card className="p-6">
              <p className="text-xs uppercase text-ink-faint mb-3">Vista previa</p>
              <div className="rounded-2xl p-6 border" style={{ background: b.secondaryColor, borderColor: b.primaryColor }}>
                <p className="text-2xl font-black" style={{ color: b.primaryColor, fontFamily: b.fontFamily }}>{b.logoText}</p>
                <p className="mt-2" style={{ color: b.accentColor, fontFamily: b.fontFamily }}>Encuentra tu equilibrio. Reserva tu próxima clase.</p>
                <button className="mt-4 rounded-xl px-4 py-2 text-sm font-semibold" style={{ background: b.primaryColor, color: b.secondaryColor }}>Reservar clase</button>
              </div>
              <p className="mt-4 text-sm text-ink-faint">Los cambios se aplican a toda la interfaz cuando tocas <strong>Guardar cambios</strong>.</p>
            </Card>
          </>
        ) : (
          <LockedFeature
            title="White-label (tu marca y colores)"
            plan="Pro"
            desc="Personaliza los colores y la tipografía de toda la app con tu marca."
          />
        )}

        {/* Reservas y cancelación */}
        <Card className="p-6 lg:col-span-2 space-y-4">
          <div>
            <h2 className="font-semibold text-ink">Política de cancelación</h2>
            <p className="mt-1 mb-3 text-sm text-ink-faint">
              Este texto se muestra a tus alumnos en la pantalla de <strong>Reservar</strong>. Explica
              con cuánta anticipación pueden cancelar sin penalización.
            </p>
            <textarea
              className="input"
              rows={4}
              value={b.cancellationPolicy ?? ''}
              onChange={(e) => setBrand({ cancellationPolicy: e.target.value })}
              placeholder="Ej. Puedes cancelar tu reserva hasta 4 horas antes de la clase sin penalización. Después de ese tiempo, la clase se descuenta de tu paquete."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 border-t border-cream-dark pt-4">
            <div>
              <Field label="Candado de cancelación — horas de anticipación">
                <input
                  type="number"
                  min={0}
                  step={1}
                  className="input"
                  value={b.cancellationHours ?? 0}
                  onChange={(e) => setBrand({ cancellationHours: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                />
              </Field>
              <p className="mt-1 text-xs text-ink-faint">
                Con <strong>24</strong>, nadie puede cancelar si faltan menos de 24 h. Usa <strong>0</strong> para permitir cancelar siempre.
              </p>
            </div>

            <div>
              <Field label="Cierre de reservas — minutos antes de la clase">
                <input
                  type="number"
                  min={0}
                  step={5}
                  className="input"
                  value={b.bookingCutoffMinutes ?? 0}
                  onChange={(e) => setBrand({ bookingCutoffMinutes: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                />
              </Field>
              <p className="mt-1 text-xs text-ink-faint">
                Con <strong>30</strong>, aunque queden lugares, no se puede reservar si faltan menos de 30 min para la clase. Usa <strong>0</strong> para no poner límite.
              </p>
            </div>
          </div>

          <div className="border-t border-cream-dark pt-4">
            <Field label={`Penalización por no asistir — monto (${b.currencyCode ?? 'USD'})`}>
              <input
                type="number"
                min={0}
                step={1}
                className="input"
                value={b.noShowPenaltyUsd ?? 0}
                onChange={(e) => setBrand({ noShowPenaltyUsd: Math.max(0, Number(e.target.value) || 0) })}
              />
            </Field>
            <p className="mt-1 text-xs text-ink-faint">
              Si el alumno <strong>no cancela y no asiste</strong>, además de perder su clase se le genera un{' '}
              <strong>adeudo</strong> por este monto (lo cobras tú en el estudio o lo condonas desde <strong>Miembros</strong>).
              Usa <strong>0</strong> para no cobrar penalización.
            </p>
          </div>
        </Card>

        {/* Página informativa pública (opcional — la llena el estudio) — plan Pro */}
        {can('publicInfo') ? (
          <InfoPageEditor
            value={b.infoPage ?? {}}
            ceuCode={s.ceuCode}
            onChange={(patch: Partial<StudioInfoPage>) =>
              setBrand({ infoPage: { ...(b.infoPage ?? {}), ...patch } })
            }
          />
        ) : (
          <LockedFeature
            title="Página pública informativa"
            plan="Pro"
            desc="Publica una página con la info de tu estudio y su propio QR/link."
          />
        )}
      </div>

      {/* Barra de guardado (los cambios NO se aplican hasta tocar Guardar) */}
      <div className="sticky bottom-0 z-10 mt-6 -mx-4 border-t border-cream-dark bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <p className="text-sm text-ink-soft">
            {dirty ? '● Tienes cambios sin guardar' : '✓ Todo guardado'}
          </p>
          <div className="flex gap-2">
            {dirty && (
              <Button variant="ghost" onClick={discard}>Descartar</Button>
            )}
            <Button onClick={save} disabled={!dirty}>Guardar cambios</Button>
          </div>
        </div>
      </div>

      <style>{`.input{width:100%;border:1px solid #E8E3D6;border-radius:.75rem;padding:.6rem .8rem;background:#fff;outline:none}.input:focus{box-shadow:0 0 0 2px var(--brand-primary)}`}</style>
    </>
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

// Aviso compacto para una función que el plan actual no incluye.
function LockedFeature({ title, plan, desc }: { title: string; plan: string; desc: string }) {
  return (
    <Card className="p-6">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-100 text-lg">✦</div>
        <div>
          <p className="font-semibold text-ink">{title}</p>
          <p className="mt-1 text-sm text-ink-soft">{desc}</p>
          <p className="mt-2 text-sm">
            <span className="rounded-full bg-cream-dark/60 px-2 py-0.5 text-xs font-semibold text-ink-soft">
              Disponible en el plan {plan}
            </span>{' '}
            <a href="#/admin/subscription" className="font-medium text-brand">Ver planes ↗</a>
          </p>
        </div>
      </div>
    </Card>
  );
}
