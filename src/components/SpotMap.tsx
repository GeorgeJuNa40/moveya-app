import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Spot } from '../lib/types';

// Mapa visual de lugares (camas de Reformer, bicis, colchonetas…). Se usa en dos
// modos:
//  • Editor (estudio): arrastra los círculos para acomodarlos como su salón,
//    renombra y agrega/quita lugares.
//  • Selector (alumno): toca un lugar libre para elegirlo; los ocupados salen
//    tachados y deshabilitados.
// Las posiciones x/y son porcentajes (0–100) sobre el mapa, así se ve igual en
// cualquier tamaño de pantalla.

interface SpotMapProps {
  spots: Spot[];
  editable?: boolean;
  onChange?: (spots: Spot[]) => void;
  // Modo selector (alumno)
  takenLabels?: Set<string>;
  selected?: string;
  onSelect?: (label: string) => void;
  accent?: string; // color de marca para el lugar seleccionado
}

const DEFAULT_ACCENT = '#4A5D55';

export default function SpotMap({
  spots,
  editable = false,
  onChange,
  takenLabels,
  selected,
  onSelect,
  accent = DEFAULT_ACCENT,
}: SpotMapProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  // Lugar en edición (su etiqueta se muestra en el campo de abajo).
  const [editId, setEditId] = useState<string | null>(null);
  // Control de arrastre: distingue "tocar" (seleccionar/editar) de "arrastrar".
  const drag = useRef<{ id: string; moved: boolean } | null>(null);

  const clamp = (n: number) => Math.max(5, Math.min(95, n));

  const updateSpot = (id: string, patch: Partial<Spot>) => {
    onChange?.(spots.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const addSpot = () => {
    const n = spots.length + 1;
    // Escalona la posición inicial para que no se encimen.
    const x = clamp(20 + ((n - 1) % 5) * 15);
    const y = clamp(25 + Math.floor((n - 1) / 5) * 20);
    const id = `sp_${Date.now().toString(36)}_${n}`;
    const next = [...spots, { id, label: `Lugar ${n}`, x, y }];
    onChange?.(next);
    setEditId(id);
  };

  const removeSpot = (id: string) => {
    onChange?.(spots.filter((s) => s.id !== id));
    if (editId === id) setEditId(null);
  };

  const posFromEvent = (e: ReactPointerEvent) => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: clamp(((e.clientX - rect.left) / rect.width) * 100),
      y: clamp(((e.clientY - rect.top) / rect.height) * 100),
    };
  };

  const onPointerDown = (e: ReactPointerEvent, spot: Spot) => {
    if (!editable) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { id: spot.id, moved: false };
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!editable || !drag.current) return;
    const p = posFromEvent(e);
    if (!p) return;
    drag.current.moved = true;
    updateSpot(drag.current.id, p);
  };
  const onPointerUp = (_e: ReactPointerEvent, spot: Spot) => {
    if (!editable) return;
    const d = drag.current;
    drag.current = null;
    // Si casi no se movió, fue un toque → abrir edición de ese lugar.
    if (d && !d.moved) setEditId((cur) => (cur === spot.id ? null : spot.id));
  };

  const editing = spots.find((s) => s.id === editId) ?? null;

  return (
    <div>
      <div
        ref={boardRef}
        className="relative w-full overflow-hidden rounded-2xl border-2 border-dashed border-cream-dark bg-cream-dark/20"
        style={{ aspectRatio: '16 / 10', touchAction: editable ? 'none' : 'auto' }}
      >
        {/* Guía "FRENTE / espejo" para orientar al estudio al acomodar. */}
        <span className="pointer-events-none absolute inset-x-0 top-1 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
          Frente
        </span>

        {spots.length === 0 && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center text-sm text-ink-faint">
            {editable ? 'Agrega lugares y arrástralos para acomodar tu salón.' : 'Sin lugares.'}
          </span>
        )}

        {spots.map((s) => {
          const taken = takenLabels?.has(s.label) ?? false;
          const isSel = selected === s.label;
          const isEditingThis = editId === s.id;
          const base =
            'absolute grid place-items-center rounded-full text-[11px] font-bold leading-tight select-none shadow-soft transition';
          const style: React.CSSProperties = {
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: 46,
            height: 46,
            transform: 'translate(-50%, -50%)',
            cursor: editable ? 'grab' : taken ? 'not-allowed' : 'pointer',
            padding: 2,
            overflow: 'hidden',
          };
          if (isSel) {
            style.background = accent;
            style.color = '#fff';
          }
          return (
            <button
              key={s.id}
              type="button"
              style={style}
              className={`${base} ${
                taken
                  ? 'bg-cream-dark/70 text-ink-faint line-through'
                  : isSel
                    ? ''
                    : isEditingThis
                      ? 'bg-white text-ink ring-2 ring-brand'
                      : 'bg-white text-ink-soft ring-1 ring-cream-dark hover:ring-brand'
              }`}
              disabled={!editable && taken}
              onPointerDown={editable ? (e) => onPointerDown(e, s) : undefined}
              onPointerMove={editable ? onPointerMove : undefined}
              onPointerUp={editable ? (e) => onPointerUp(e, s) : undefined}
              onClick={!editable && !taken ? () => onSelect?.(s.label) : undefined}
              title={s.label}
            >
              <span className="w-full truncate px-0.5 text-center">{s.label}</span>
            </button>
          );
        })}
      </div>

      {/* Barra de edición (solo estudio) */}
      {editable && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={addSpot}
              className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-cream-light shadow-soft"
            >
              + Agregar lugar
            </button>
            {spots.length > 0 && (
              <button
                type="button"
                onClick={() => onChange?.([])}
                className="rounded-full border border-cream-dark px-4 py-2 text-sm font-medium text-ink-soft"
              >
                Quitar todos
              </button>
            )}
            <span className="text-xs text-ink-faint">
              {spots.length} lugar{spots.length === 1 ? '' : 'es'} · toca uno para renombrar o borrar
            </span>
          </div>

          {editing && (
            <div className="flex flex-wrap items-end gap-2 rounded-xl bg-cream-dark/30 p-3">
              <label className="flex-1 min-w-[10rem]">
                <span className="mb-1 block text-xs font-medium text-ink-soft">Nombre del lugar</span>
                <input
                  autoFocus
                  className="w-full rounded-lg border border-cream-dark bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand"
                  value={editing.label}
                  maxLength={18}
                  onChange={(e) => updateSpot(editing.id, { label: e.target.value })}
                  placeholder="Ej. Reformer 1"
                />
              </label>
              <button
                type="button"
                onClick={() => removeSpot(editing.id)}
                className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-600"
              >
                Borrar
              </button>
              <button
                type="button"
                onClick={() => setEditId(null)}
                className="rounded-lg border border-cream-dark px-3 py-2 text-sm font-medium text-ink-soft"
              >
                Listo
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
