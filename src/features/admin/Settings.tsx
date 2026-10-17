import { useEffect, useState } from 'react';
import { useStore } from '../../lib/store';
import { PageHeader, Card, Button } from '../../components/ui';
import ImageUpload from '../../components/ImageUpload';
import StudioLogo from '../../components/StudioLogo';
import InviteCard from './InviteCard';
import InfoPageEditor from './InfoPageEditor';
import StripeConnectCard from './StripeConnectCard';
import MpConnectCard from './MpConnectCard';
import { CURRENCIES } from '../../lib/countries';
import { broadcastAnnouncement, fetchAnnouncements, type Announcement } from '../../lib/announcements';
import { notifySuccess } from '../../lib/notify';
import { BRANCH_EXTRA_MXN, BRANCH_EXTRA_USD, branchAddonMxn, branchAddonUsd, branchExtraCount } from '../../lib/plans';
import type { Branding, StudioInfoPage } from '../../lib/types';

// Configuración: datos del negocio, fotos y White-label (branding).
// Los cambios se guardan SOLO al tocar "Guardar cambios" (no en automático).
export default function Settings() {
  const { currentStudio, updateStudioSettings, can } = useStore();
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
    // Una sola escritura (datos + branding juntos): así el white-label se guarda
    // siempre, sin que dos guardados compitan y se revierta.
    updateStudioSettings(
      { name: draft.name, studioType: draft.studioType, phone: draft.phone, email: draft.email, address: draft.address, photos: draft.photos },
      draft.branding,
    );
    setDirty(false);
  };
  const discard = () => {
    setDraft(makeDraft());
    setDirty(false);
  };

  return (
    <>
      <PageHeader title="Configuración" subtitle="Personaliza tu negocio y tu app" />

      <div className="mx-auto max-w-3xl space-y-6">
        {/* Avisos a tus alumnos (notificación masiva push) */}
        <BroadcastCard />

        {/* 1 · Datos del negocio (el tipo de negocio se eligió al registrarse) */}
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
        </Card>

        {/* 2 · White-label (branding) con vista previa — plan Pro */}
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
                <ColorField label="Color de acento / texto" value={b.accentColor} onChange={(v) => setBrand({ accentColor: v })} />
                <Field label="Tipografía">
                  <select className="input" value={b.fontFamily} onChange={(e) => setBrand({ fontFamily: e.target.value })}>
                    {fonts.map((f) => (
                      <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
                    ))}
                  </select>
                </Field>
              </div>
              {/* Vista previa */}
              <div>
                <p className="text-xs uppercase text-ink-faint mb-2">Vista previa</p>
                <div className="rounded-2xl p-6 border" style={{ background: b.secondaryColor, borderColor: b.primaryColor }}>
                  <p className="text-2xl font-black" style={{ color: b.primaryColor, fontFamily: b.fontFamily }}>{b.logoText}</p>
                  <p className="mt-2" style={{ color: b.accentColor, fontFamily: b.fontFamily }}>Encuentra tu equilibrio. Reserva tu próxima clase.</p>
                  <button className="mt-4 rounded-xl px-4 py-2 text-sm font-semibold" style={{ background: b.primaryColor, color: b.secondaryColor }}>Reservar clase</button>
                </div>
              </div>
            </div>
          </Card>
        ) : (
          <LockedFeature
            title="2 · White-label (tu marca y colores)"
            plan="Pro"
            desc="Personaliza los colores y la tipografía de toda la app con tu marca."
          />
        )}

        {/* 3 · Fotos del estudio */}
        <Card className="p-6">
          <h2 className="font-semibold text-ink mb-3">3 · Fotos del estudio</h2>
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

        {/* 4 · Invitaciones */}
        <div>
          <h2 className="mb-2 font-semibold text-ink">4 · Invitaciones</h2>
          <InviteCard ceuCode={s.ceuCode} />
        </div>

        {/* 5 · Recibe tus pagos (pasarela) */}
        <div>
          <h2 className="mb-2 font-semibold text-ink">5 · Recibe tus pagos</h2>
          <p className="mb-3 text-sm text-ink-faint">
            Conecta tu cuenta para recibir los pagos de tus alumnos directo en tu banco. La app no toca ese dinero.
          </p>
          <StripeConnectCard />
          <MpConnectCard />
        </div>

        {/* 6 · Políticas de cancelación y reglas (unificado) */}
        <Card className="p-6 space-y-4">
          <h2 className="font-semibold text-ink">6 · Políticas de cancelación y reglas</h2>

          <div>
            <Field label="Política de cancelación (la ven tus alumnos al reservar)">
              <textarea
                className="input"
                rows={3}
                value={b.cancellationPolicy ?? ''}
                onChange={(e) => setBrand({ cancellationPolicy: e.target.value })}
                placeholder="Ej. Puedes cancelar tu reserva hasta 4 horas antes de la clase sin penalización. Después de ese tiempo, la clase se descuenta de tu paquete."
              />
            </Field>
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

          <div className="border-t border-cream-dark pt-4">
            <Field label="Reglas y políticas del negocio (las ven tus alumnos en su panel)">
              <textarea
                className="input"
                rows={6}
                value={b.studioPolicies ?? ''}
                onChange={(e) => setBrand({ studioPolicies: e.target.value })}
                placeholder={'Ej:\n• Llega 10 min antes de tu clase.\n• Trae tu propia toalla y botella de agua.\n• Limpia el equipo después de usarlo.\n• Respeta los horarios de acceso.'}
              />
            </Field>
          </div>
        </Card>

        {/* 7 · Multi-sucursal — plan Premium */}
        <div>
          <h2 className="mb-2 font-semibold text-ink">7 · Multisucursales</h2>
          {can('multiBranch') ? (
            <BranchesCard currency={b.currencyCode ?? 'USD'} />
          ) : (
            <LockedFeature
              title="Multi-sucursal"
              plan="Premium"
              desc="Administra varias sedes bajo una sola cuenta. 1ª sede incluida; cada sede extra suma al plan."
            />
          )}
        </div>

        {/* 8 · Tienda para alumnos y coaches */}
        {can('store') && (
          <Card className="p-6 space-y-3">
            <div>
              <h2 className="font-semibold text-ink">8 · Tienda para alumnos y coaches</h2>
              <p className="mt-1 text-sm text-ink-faint">
                Si lo activas, tus alumnos y coaches ven tu catálogo de productos y pueden
                <strong> apartar</strong> lo que quieran; a ti te llega el pedido en <strong>Tienda / Pedidos</strong>
                para cobrarlo en mostrador y entregarlo. (El pago en línea de productos llega muy pronto.)
              </p>
            </div>
            <button
              type="button"
              onClick={() => setBrand({ storeForMembers: !(b.storeForMembers !== false) })}
              className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${b.storeForMembers !== false ? 'border-brand bg-brand-soft' : 'border-cream-dark bg-white'}`}
            >
              <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${b.storeForMembers !== false ? 'bg-brand border-brand text-cream' : 'border-cream-dark'}`}>
                {b.storeForMembers !== false ? '✓' : ''}
              </span>
              <span className="text-sm font-medium text-ink">Mostrar la tienda a alumnos y coaches</span>
            </button>

            <div className="border-t border-cream-dark pt-3">
              <span className="mb-1 block text-sm font-medium text-ink-soft">¿Cómo compran tus miembros?</span>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { v: 'request', t: 'Apartar', d: 'Cobras en mostrador' },
                  { v: 'online', t: 'En línea', d: 'Pagan con tarjeta/MP' },
                  { v: 'both', t: 'Ambos', d: 'El miembro elige' },
                ] as const).map((opt) => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setBrand({ storeCheckout: opt.v })}
                    className={`rounded-xl border px-2 py-2.5 text-center transition ${
                      (b.storeCheckout ?? 'request') === opt.v
                        ? 'border-brand bg-brand-soft text-brand'
                        : 'border-cream-dark bg-white text-ink-soft'
                    }`}
                  >
                    <span className="block text-sm font-semibold">{opt.t}</span>
                    <span className="block text-[11px] leading-tight text-ink-faint">{opt.d}</span>
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-ink-faint">
                El pago en línea usa tu pasarela conectada (sección 5). Si eliges “En línea” y no tienes pasarela,
                el miembro podrá apartar como respaldo.
              </p>
            </div>
          </Card>
        )}

        {/* Programa de aliados "Recomendados Move yA" — aceptación permanente */}
        <MoveyaPicksCard />

        {/* 9 · Página informativa pública — plan Pro */}
        <div>
          <h2 className="mb-2 font-semibold text-ink">9 · Página informativa</h2>
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

// Avisos a los alumnos: el estudio escribe un mensaje relevante (clima, cierre,
// promoción…) y lo envía por notificación push a TODOS sus alumnos de un clic.
// Programa de aliados "Recomendados Move yA". El estudio DECIDE unirse (gana una
// comisión por lo que compren sus alumnos). Al unirse queda activo de forma
// permanente. Redactado para que el beneficio pese más que el candado.
function MoveyaPicksCard() {
  const { currentStudio, acceptMoveyaPicks } = useStore();
  const active = currentStudio?.moveyaPicks === true;
  const join = async () => {
    const ok = window.confirm(
      'Vas a unirte al programa Recomendados Move yA.\n\n' +
        '• Ganas una comisión por las compras que hagan tus alumnos en esa sección.\n' +
        '• Queda activo de forma permanente en tu app (no requiere mantenimiento de tu parte).\n\n' +
        '¿Activar el programa?',
    );
    if (ok) await acceptMoveyaPicks();
  };
  return (
    <Card className="p-6 space-y-3">
      <div>
        <h2 className="font-semibold text-ink">Gana con Recomendados Move yA 💸</h2>
        <p className="mt-1 text-sm text-ink-faint">
          Súmate al programa de aliados: tus alumnos ven una sección de productos recomendados
          (suplementos, accesorios) y <strong>tú ganas una comisión</strong> por lo que compren ahí. Es
          una sección aparte, no te quita trabajo ni toca tu propia tienda. Un ingreso extra para tu
          negocio, sin costo.
        </p>
      </div>
      {active ? (
        <div className="flex items-center gap-2 rounded-xl border border-brand bg-brand-soft p-3">
          <span className="grid h-5 w-5 place-items-center rounded-md bg-brand text-cream">✓</span>
          <span className="text-sm font-medium text-ink">Estás dentro del programa. ¡A ganar! 🎉</span>
        </div>
      ) : (
        <Button onClick={join}>Unirme y empezar a ganar</Button>
      )}
    </Card>
  );
}

function BroadcastCard() {
  const { currentStudio } = useStore();
  const studioId = currentStudio!.id;
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<Announcement[]>([]);

  const load = () => { void fetchAnnouncements(studioId).then(setHistory); };
  useEffect(load, [studioId]);

  const send = async () => {
    if (!title.trim() || !body.trim() || sending) return;
    if (!window.confirm('¿Enviar este aviso a TODOS tus alumnos?')) return;
    setSending(true);
    const res = await broadcastAnnouncement(title.trim(), body.trim());
    setSending(false);
    if (res.ok) {
      notifySuccess(`Aviso enviado a ${res.recipients ?? 0} alumno(s) con notificaciones activas.`);
      setTitle(''); setBody(''); load();
    }
  };

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h2 className="font-semibold text-ink">📣 Avisos a tus alumnos</h2>
        <p className="mt-1 text-sm text-ink-faint">
          Manda un aviso importante (clase cancelada por clima, cierre temprano, promoción…) por
          notificación a <strong>todos tus alumnos</strong> de un clic. Les llega a quienes tengan las
          notificaciones activadas.
        </p>
      </div>
      <Field label="Título">
        <input className="input" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Hoy cerramos a las 6 pm" />
      </Field>
      <Field label="Mensaje">
        <textarea className="input" rows={3} value={body} maxLength={300} onChange={(e) => setBody(e.target.value)} placeholder="Ej. Por el clima, la clase de las 7 pm se cancela. ¡Nos vemos mañana!" />
      </Field>
      <div className="flex justify-end">
        <Button disabled={!title.trim() || !body.trim() || sending} onClick={send}>
          {sending ? 'Enviando…' : 'Enviar a todos'}
        </Button>
      </div>

      {history.length > 0 && (
        <div className="border-t border-cream-dark pt-4">
          <p className="mb-2 text-sm font-medium text-ink-soft">Enviados recientemente</p>
          <div className="space-y-2">
            {history.slice(0, 5).map((a) => (
              <div key={a.id} className="rounded-xl bg-cream-dark/40 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">{a.title}</p>
                  <span className="shrink-0 text-xs text-ink-faint">{new Date(a.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })} · {a.recipients} enviados</span>
                </div>
                <p className="text-xs text-ink-soft">{a.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// Administración de sucursales (multi-sucursal, plan Premium). Las altas/bajas
// se guardan al instante; el cobro mensual refleja las sedes dadas de alta.
function BranchesCard({ currency }: { currency: string }) {
  const { currentStudio, addBranch, updateBranch, removeBranch } = useStore();
  const branches = currentStudio!.branches ?? [];
  const ceu = currentStudio!.ceuCode;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const total = Math.max(1, branches.length); // la sede principal cuenta como 1
  const extra = branchExtraCount(total);
  const [copied, setCopied] = useState<string | null>(null);

  // Link para invitar al gerente de una sucursal (se registra ligado a esa sede).
  const managerLink = (branchId: string) => `${origin}/#/entrar?ceu=${encodeURIComponent(ceu)}&branch=${encodeURIComponent(branchId)}&role=branchadmin`;
  const copyManager = async (branchId: string) => {
    try { await navigator.clipboard.writeText(managerLink(branchId)); setCopied(branchId); setTimeout(() => setCopied(null), 2000); }
    catch { /* el navegador puede bloquear; el link igual se muestra */ }
  };
  const isMxn = currency === 'MXN';
  const addonLabel = isMxn
    ? `$${branchAddonMxn(total).toLocaleString('es-MX')} MXN`
    : `$${branchAddonUsd(total)} USD`;
  const perExtra = isMxn ? `$${BRANCH_EXTRA_MXN} MXN` : `$${BRANCH_EXTRA_USD} USD`;

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');

  const add = () => {
    if (!name.trim()) return;
    // Verificación: confirma el costo cuando la sede suma al cobro mensual.
    const willCost = branches.length >= 1; // la 1ª sede va incluida; de la 2ª en adelante suma
    if (willCost) {
      const ok = window.confirm(
        `Agregar “${name.trim()}” suma ${perExtra}/mes a tu plan (quedarás en ${branches.length + 1} sedes). ¿Confirmas?`,
      );
      if (!ok) return;
    }
    addBranch(name.trim(), address.trim() || undefined);
    setName('');
    setAddress('');
  };

  return (
    <Card className="p-6 lg:col-span-2 space-y-4">
      <div>
        <h2 className="font-semibold text-ink">Sucursales (multi-sucursal)</h2>
        <p className="mt-1 text-sm text-ink-faint">
          Administra todas tus sedes desde una cuenta. La <strong>1ª sede va incluida</strong> en tu plan;
          cada sede adicional suma <strong>{perExtra}</strong> al mes.
        </p>
      </div>

      <div className="rounded-xl bg-mint-soft/30 px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-ink-soft">
            Sedes dadas de alta: <strong className="text-ink">{total}</strong>
            {extra > 0 && <> · {extra} adicional{extra > 1 ? 'es' : ''}</>}
          </span>
          <span className="font-semibold text-ink">
            {extra > 0 ? <>Extra mensual: {addonLabel}</> : 'Sin costo adicional'}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {branches.length === 0 && (
          <p className="text-sm text-ink-faint">
            Aún no agregas sucursales. Tu sede principal ya está incluida; agrega otra solo si operas en más de un lugar.
          </p>
        )}
        {branches.map((br) => (
          <div key={br.id} className="rounded-xl border border-cream-dark px-3 py-2 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="input flex-1 min-w-[8rem]"
                value={br.name}
                onChange={(e) => updateBranch(br.id, { name: e.target.value })}
                placeholder="Nombre de la sucursal"
              />
              <input
                className="input flex-1 min-w-[8rem]"
                value={br.address ?? ''}
                onChange={(e) => updateBranch(br.id, { address: e.target.value })}
                placeholder="Dirección (opcional)"
              />
              <button
                type="button"
                onClick={() => updateBranch(br.id, { active: !br.active })}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${br.active ? 'bg-green-100 text-green-700' : 'bg-cream-dark/60 text-ink-faint'}`}
              >
                {br.active ? 'Activa' : 'Inactiva'}
              </button>
              <button type="button" onClick={() => removeBranch(br.id)} className="text-sm font-medium text-red-600">Eliminar</button>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-ink-faint">👤 Gerente:</span>
              <button type="button" onClick={() => copyManager(br.id)} className="font-semibold text-brand">
                {copied === br.id ? '¡Link copiado!' : 'Copiar link de invitación'}
              </button>
              <span className="truncate text-ink-faint">· el gerente solo verá esta sucursal</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2 border-t border-cream-dark pt-4">
        <label className="flex-1 min-w-[8rem]">
          <span className="mb-1 block text-sm font-medium text-ink-soft">Nueva sucursal</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Sucursal Centro" />
        </label>
        <label className="flex-1 min-w-[8rem]">
          <span className="mb-1 block text-sm font-medium text-ink-soft">Dirección (opcional)</span>
          <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Calle, número, colonia" />
        </label>
        <Button onClick={add} disabled={!name.trim()}>+ Agregar sede</Button>
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
