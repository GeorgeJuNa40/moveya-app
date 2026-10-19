import { useState } from 'react';
import { useStore } from '../../lib/store';
import { PageHeader, Card, Button } from '../../components/ui';
import ClassThumb from '../../components/ClassThumb';
import ImageUpload from '../../components/ImageUpload';
import SpotMap from '../../components/SpotMap';
import type { ClassTemplate } from '../../lib/types';

const emptyDraft = (studioId: string): ClassTemplate => ({
  id: 'new',
  studioId,
  name: '',
  durationMin: 50,
  colorHex: '#4A5D55',
  photoUrl: '',
});

// Gestión de tipos de clase, con foto que define cada tipo.
export default function ClassesManagement() {
  const { db, currentStudio, upsertClassTemplate, deleteClassTemplate } = useStore();
  const studioId = currentStudio!.id;
  const templates = db.classTemplates.filter((t) => t.studioId === studioId);
  const [draft, setDraft] = useState<ClassTemplate | null>(null);

  const save = () => {
    if (!draft || !draft.name.trim()) return;
    upsertClassTemplate({ ...draft, photoUrl: draft.photoUrl?.trim() || undefined });
    setDraft(null);
  };

  return (
    <>
      <PageHeader
        title="Clases"
        subtitle="Tipos de clase y su foto (aparece en calendario, reservas y paquetes)"
        action={<Button onClick={() => setDraft(emptyDraft(studioId))}>+ Nueva clase</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {templates.map((t) => {
          const sessions = db.classSessions.filter((s) => s.templateId === t.id).length;
          return (
            <Card key={t.id} className="overflow-hidden">
              <ClassThumb tpl={t} rounded="rounded-none" className="h-32 w-full text-3xl" />
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-ink">{t.name}</h3>
                  <span className="h-4 w-4 rounded-full" style={{ background: t.colorHex }} />
                </div>
                <p className="text-sm text-ink-faint mt-0.5">{t.durationMin} min · {sessions} sesiones</p>
                <div className="mt-3 flex gap-2">
                  <Button variant="secondary" className="flex-1" onClick={() => setDraft({ ...t, photoUrl: t.photoUrl ?? '' })}>Editar</Button>
                  <Button variant="danger" onClick={() => { if (confirm(`¿Eliminar "${t.name}"? Se quitarán sus sesiones.`)) deleteClassTemplate(t.id); }}>Eliminar</Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {draft && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4">
          <Card className="w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-ink mb-4">{draft.id === 'new' ? 'Nueva clase' : 'Editar clase'}</h2>
            <div className="space-y-4">
              <Field label="Nombre">
                <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Duración (min)">
                  <input type="number" className="input" value={draft.durationMin} onChange={(e) => setDraft({ ...draft, durationMin: +e.target.value })} />
                </Field>
                <Field label="Color">
                  <input type="color" className="h-11 w-full rounded-xl border border-cream-dark" value={draft.colorHex} onChange={(e) => setDraft({ ...draft, colorHex: e.target.value })} />
                </Field>
              </div>
              <Field label="Foto de la clase">
                <div className="flex items-center gap-3">
                  <ImageUpload label="Subir foto" onSelect={(url) => setDraft({ ...draft, photoUrl: url })} />
                  {draft.photoUrl && (
                    <button type="button" onClick={() => setDraft({ ...draft, photoUrl: '' })} className="text-sm text-red-600">Quitar</button>
                  )}
                </div>
              </Field>
              <div>
                <span className="mb-1 block text-sm font-medium text-ink-soft">Mapa de lugares (opcional)</span>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <input
                    className="input !w-40"
                    placeholder="Prefijo (ej. Reformer)"
                    id="spot-prefix"
                  />
                  <input className="input !w-20" type="number" min={1} max={40} placeholder="#" id="spot-count" />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      const pre = (document.getElementById('spot-prefix') as HTMLInputElement)?.value.trim() || 'Lugar';
                      const n = Math.max(0, Math.min(40, Number((document.getElementById('spot-count') as HTMLInputElement)?.value) || 0));
                      if (n <= 0) return;
                      // Genera los lugares acomodados en rejilla (el estudio los
                      // mueve luego a su gusto en el mapa).
                      const perRow = Math.ceil(Math.sqrt(n));
                      const spots = Array.from({ length: n }, (_, i) => {
                        const col = i % perRow;
                        const rowN = Math.floor(i / perRow);
                        const rows = Math.ceil(n / perRow);
                        return {
                          id: `sp_${i}`,
                          label: `${pre} ${i + 1}`,
                          x: Math.round((perRow === 1 ? 50 : 15 + (col * 70) / (perRow - 1))),
                          y: Math.round((rows === 1 ? 50 : 22 + (rowN * 60) / (rows - 1))),
                        };
                      });
                      setDraft({ ...draft, spots });
                    }}
                  >
                    Generar en rejilla
                  </Button>
                </div>
                <SpotMap
                  spots={draft.spots ?? []}
                  editable
                  accent={draft.colorHex}
                  onChange={(spots) => setDraft({ ...draft, spots })}
                />
                <span className="mt-2 block text-xs text-ink-faint">
                  Si defines lugares, el alumno elegirá el suyo al reservar (ves el mapa como está tu salón).
                  Déjalo vacío para no usar lugares. Procura que el cupo de la clase sea igual al número de lugares.
                </span>
              </div>
              <div>
                <span className="mb-1 block text-sm font-medium text-ink-soft">Vista previa</span>
                <ClassThumb tpl={{ ...draft, photoUrl: draft.photoUrl?.trim() || undefined }} className="h-28 w-full text-3xl" />
              </div>
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
