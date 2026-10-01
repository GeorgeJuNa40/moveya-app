import { useState } from 'react';
import { useStore } from '../../lib/store';
import { PageHeader, Card, Badge, Button, Modal } from '../../components/ui';
import { usd } from '../../lib/format';
import type { Package } from '../../lib/types';

const emptyDraft = (studioId: string, kind: Package['kind'] = 'credits'): Package => ({
  id: 'new',
  studioId,
  name: '',
  description: '',
  kind,
  recurring: false,
  priceUsd: 0,
  classCredits: 1,
  validityDays: 30,
  active: true,
  eligibleClassIds: [],
});

// Pantalla clave: Gestión de Paquetes.
// El estudio define precios, vigencia y clases participantes.
export default function PackageManagement() {
  const { db, currentStudio, upsertPackage, togglePackageActive } = useStore();
  const studioId = currentStudio!.id;
  const currency = currentStudio!.branding.currencyCode ?? 'USD';
  const studioType = currentStudio!.studioType ?? 'studio';
  const isGym = studioType === 'gym';
  const isMixed = studioType === 'mixed';
  const packages = db.packages.filter((p) => p.studioId === studioId);
  const templates = db.classTemplates.filter((t) => t.studioId === studioId);

  // Título/etiquetas según el tipo de negocio.
  const pageTitle = isGym ? 'Membresías' : isMixed ? 'Paquetes y Membresías' : 'Gestión de Paquetes';

  const [draft, setDraft] = useState<Package | null>(null);
  const isAccess = draft?.kind === 'access';

  // Un gimnasio arranca creando membresías de acceso; estudio/mixto, paquetes.
  const startNew = () => setDraft(emptyDraft(studioId, isGym ? 'access' : 'credits'));
  const startEdit = (p: Package) => setDraft({ ...p, kind: p.kind ?? 'credits' });

  const save = () => {
    if (!draft || !draft.name.trim()) return;
    const access = draft.kind === 'access';
    const clean: Package = {
      ...draft,
      priceUsd: Math.max(0, draft.priceUsd || 0),
      // La membresía de acceso no usa créditos por clase.
      classCredits: access ? 0 : Math.max(1, Math.floor(draft.classCredits || 1)),
      // Domiciliación: solo en membresías de acceso; si está activa, ciclo mensual.
      recurring: access ? !!draft.recurring : false,
      validityDays: access && draft.recurring ? 30 : Math.max(1, Math.floor(draft.validityDays || 1)),
      // El acceso libre vale para todas las clases: no restringe por tipo.
      eligibleClassIds: access ? [] : draft.eligibleClassIds,
    };
    upsertPackage(clean);
    setDraft(null);
  };

  const toggleClass = (id: string) => {
    if (!draft) return;
    const has = draft.eligibleClassIds.includes(id);
    setDraft({
      ...draft,
      eligibleClassIds: has
        ? draft.eligibleClassIds.filter((c) => c !== id)
        : [...draft.eligibleClassIds, id],
    });
  };

  return (
    <>
      <PageHeader
        title={pageTitle}
        subtitle={isGym
          ? 'Define tus membresías de acceso: precio y vigencia'
          : 'Define precios, vigencia y clases participantes'}
        action={<Button onClick={startNew}>+ Nuevo</Button>}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {packages.map((p) => {
          const usedCount = db.userPackages.filter((up) => up.packageId === p.id).length;
          return (
            <Card key={p.id} className="p-5 flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-ink">{p.name}</h3>
                  <p className="text-sm text-ink-faint mt-0.5">{p.description}</p>
                </div>
                <Badge tone={p.active ? 'success' : 'neutral'}>
                  {p.active ? 'Activo' : 'Inactivo'}
                </Badge>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <Metric label="Precio" value={usd(p.priceUsd)} />
                {p.kind === 'access'
                  ? <Metric label="Tipo" value="Acceso" />
                  : <Metric label="Clases" value={`${p.classCredits}`} />}
                <Metric label="Vigencia" value={`${p.validityDays}d`} />
              </div>
              {p.kind === 'access' && (
                <p className="mt-2 text-center text-xs font-medium text-brand">
                  🔓 Acceso libre {p.recurring ? '· 🔁 cobro mensual automático' : 'durante la vigencia'}
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-1">
                {p.eligibleClassIds.map((cid) => {
                  const t = templates.find((x) => x.id === cid);
                  return t ? <Badge key={cid} tone="brand">{t.name}</Badge> : null;
                })}
              </div>

              <p className="mt-3 text-xs text-ink-faint">{usedCount} alumno(s) lo han comprado</p>

              <div className="mt-4 flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => startEdit(p)}>
                  Editar
                </Button>
                <Button variant="ghost" onClick={() => togglePackageActive(p.id)}>
                  {p.active ? 'Desactivar' : 'Activar'}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Editor modal */}
      {draft && (
        <Modal onClose={() => setDraft(null)} className="w-full max-w-lg">
          <Card className="p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-ink mb-4">
              {draft.id === 'new'
                ? isAccess ? 'Nueva membresía' : 'Nuevo paquete'
                : isAccess ? 'Editar membresía' : 'Editar paquete'}
            </h2>
            <div className="space-y-4">
              <Field label="Nombre">
                <input
                  className="input"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </Field>
              <Field label="Descripción">
                <textarea
                  className="input"
                  rows={2}
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </Field>

              {/* Tipo de plan: solo estudios que son gimnasio/mixto pueden crear
                  membresías de acceso. Un estudio de clases usa siempre créditos. */}
              {studioType !== 'studio' && (
                <div>
                  <span className="mb-1 block text-sm font-medium text-ink-soft">Tipo de plan</span>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { v: 'credits', t: 'Paquete por clases', d: 'Descuenta 1 por reserva' },
                      { v: 'access', t: 'Membresía de acceso', d: 'Acceso libre por vigencia' },
                    ] as const).map((opt) => (
                      <button
                        key={opt.v}
                        type="button"
                        onClick={() => setDraft({ ...draft, kind: opt.v })}
                        className={`rounded-xl border px-2 py-2.5 text-center transition ${
                          (draft.kind ?? 'credits') === opt.v
                            ? 'border-brand bg-brand-soft text-brand'
                            : 'border-cream-dark bg-white text-ink-soft'
                        }`}
                      >
                        <span className="block text-sm font-semibold">{opt.t}</span>
                        <span className="block text-[11px] leading-tight text-ink-faint">{opt.d}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className={`grid gap-3 ${isAccess ? 'grid-cols-2' : 'grid-cols-3'}`}>
                <Field label={`Precio (${currency})`}>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="input"
                    value={draft.priceUsd}
                    onChange={(e) => setDraft({ ...draft, priceUsd: +e.target.value })}
                  />
                </Field>
                {!isAccess && (
                  <Field label="Clases">
                    <input
                      type="number"
                      min="1"
                      className="input"
                      value={draft.classCredits}
                      onChange={(e) => setDraft({ ...draft, classCredits: +e.target.value })}
                    />
                  </Field>
                )}
                <Field label="Vigencia (días)">
                  <input
                    type="number"
                    min="1"
                    className="input"
                    value={draft.validityDays}
                    onChange={(e) => setDraft({ ...draft, validityDays: +e.target.value })}
                  />
                </Field>
              </div>

              {isAccess ? (
                <div className="space-y-3">
                  {/* Domiciliación: cobro mensual automático */}
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, recurring: !draft.recurring })}
                    className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${
                      draft.recurring ? 'border-brand bg-brand-soft' : 'border-cream-dark bg-white'
                    }`}
                  >
                    <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border ${draft.recurring ? 'bg-brand border-brand text-cream' : 'border-cream-dark'}`}>
                      {draft.recurring ? '✓' : ''}
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-ink">Cobro mensual automático (domiciliación)</span>
                      <span className="block text-xs text-ink-faint">Se le cobra al miembro cada mes con su tarjeta, sin que tenga que volver a pagar. Requiere tu cuenta de Stripe conectada.</span>
                    </span>
                  </button>

                  {!draft.recurring && (
                    <div>
                      <span className="mb-1 block text-sm font-medium text-ink-soft">Vigencia rápida</span>
                      <div className="flex flex-wrap gap-2">
                        {([
                          { d: 30, t: 'Mensual' },
                          { d: 15, t: 'Quincenal' },
                          { d: 7, t: 'Semanal' },
                          { d: 1, t: 'Visita' },
                        ] as const).map((opt) => (
                          <button
                            key={opt.d}
                            type="button"
                            onClick={() => setDraft({ ...draft, validityDays: opt.d })}
                            className={`rounded-full px-3 py-1.5 text-sm border transition ${
                              draft.validityDays === opt.d
                                ? 'bg-brand text-cream border-brand'
                                : 'bg-white text-ink-soft border-cream-dark'
                            }`}
                          >
                            {opt.t}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-ink-faint">
                    {draft.recurring
                      ? '🔁 Se renueva y cobra cada mes automáticamente hasta que el miembro (o tú) la cancele.'
                      : 'El miembro tendrá acceso libre durante la vigencia (no se descuentan clases). Ideal para gimnasio.'}
                  </p>
                </div>
              ) : (
                <Field label="Clases participantes">
                  <div className="flex flex-wrap gap-2">
                    {templates.map((t) => {
                      const on = draft.eligibleClassIds.includes(t.id);
                      return (
                        <button
                          key={t.id}
                          onClick={() => toggleClass(t.id)}
                          className={`rounded-full px-3 py-1.5 text-sm border transition ${
                            on
                              ? 'bg-brand text-cream border-brand'
                              : 'bg-white text-ink-soft border-cream-dark'
                          }`}
                        >
                          {t.name}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Cancelar
              </Button>
              <Button onClick={save}>Guardar</Button>
            </div>
          </Card>
        </Modal>
      )}

      <style>{`
        .input { width:100%; border:1px solid #E8E3D6; border-radius:0.75rem; padding:0.6rem 0.8rem; outline:none; background:#fff; }
        .input:focus { box-shadow:0 0 0 2px var(--brand-primary); }
      `}</style>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-cream-dark/40 py-2">
      <p className="text-xs text-ink-faint">{label}</p>
      <p className="font-semibold text-ink text-sm">{value}</p>
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
