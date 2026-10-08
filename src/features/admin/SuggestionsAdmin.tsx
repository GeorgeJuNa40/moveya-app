import { useEffect, useMemo, useState } from 'react';
import { PageHeader, Card, Button, Badge } from '../../components/ui';
import { notifySuccess } from '../../lib/notify';
import {
  fetchStudioSuggestions, replySuggestion, setSuggestionStatus, categoryLabel,
  type StudioSuggestion, type SuggestionStatus,
} from '../../lib/suggestions';

type Filter = 'todas' | 'nueva' | 'resuelta';

// Estudio: buzón de sugerencias de los alumnos. Puede responder (el alumno ve la
// respuesta en su app) y marcar el estado. Si la sugerencia es anónima, NO se
// muestra el nombre (el servidor ni siquiera lo envía).
export default function SuggestionsAdmin() {
  const [items, setItems] = useState<StudioSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('todas');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setItems(await fetchStudioSuggestions());
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, []);

  const shown = useMemo(
    () => items.filter((s) => (filter === 'todas' ? true : s.status === filter)),
    [items, filter],
  );
  const newCount = items.filter((s) => s.status === 'nueva').length;

  const send = async (id: string) => {
    const text = (drafts[id] ?? '').trim();
    if (!text) return;
    setBusy(id);
    const ok = await replySuggestion(id, text);
    setBusy(null);
    if (ok) {
      notifySuccess('Respuesta enviada al alumno 💬');
      setDrafts((d) => ({ ...d, [id]: '' }));
      void load();
    }
  };

  const changeStatus = async (id: string, status: SuggestionStatus) => {
    setBusy(id);
    const ok = await setSuggestionStatus(id, status);
    setBusy(null);
    if (ok) void load();
  };

  const statusBadge = (s: SuggestionStatus) =>
    s === 'resuelta'
      ? <Badge tone="success">Resuelta</Badge>
      : s === 'leida'
        ? <Badge tone="warning">Vista</Badge>
        : <Badge tone="danger">Nueva</Badge>;

  const FilterBtn = ({ id, label }: { id: Filter; label: string }) => (
    <button
      type="button"
      onClick={() => setFilter(id)}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
        filter === id ? 'bg-brand text-cream-light shadow-soft' : 'text-ink-faint hover:bg-brand-soft'
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      <PageHeader
        title="Buzón de sugerencias"
        subtitle={newCount > 0 ? `Tienes ${newCount} sugerencia(s) nueva(s)` : 'Lo que tus alumnos proponen'}
      />

      <div className="mb-4 inline-flex gap-1 rounded-full border border-cream-dark bg-cream-dark/20 p-1">
        <FilterBtn id="todas" label="Todas" />
        <FilterBtn id="nueva" label="Nuevas" />
        <FilterBtn id="resuelta" label="Resueltas" />
      </div>

      {loading ? (
        <div className="rounded-2xl border border-dashed border-cream-dark p-8 text-center text-ink-faint">Cargando…</div>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-cream-dark p-8 text-center text-ink-faint">
          No hay sugerencias {filter !== 'todas' ? 'en este filtro' : 'todavía'}.
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((s) => (
            <Card key={s.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">{categoryLabel(s.category)}</Badge>
                  <span className="text-sm font-medium text-ink">
                    {s.anonymous ? '🕶️ Anónima' : (s.senderName || 'Alumno')}
                  </span>
                </div>
                {statusBadge(s.status)}
              </div>

              <p className="mt-2 text-sm text-ink-soft">{s.message}</p>
              <p className="mt-1 text-xs text-ink-faint">{new Date(s.createdAt).toLocaleString('es-MX')}</p>

              {s.reply ? (
                <div className="mt-3 rounded-xl border-l-4 border-mint bg-cream px-3 py-2">
                  <p className="text-xs font-semibold text-brand">Tu respuesta 💬</p>
                  <p className="mt-0.5 text-sm text-ink-soft">{s.reply}</p>
                </div>
              ) : (
                <div className="mt-3">
                  <textarea
                    className="w-full rounded-xl border border-cream-dark bg-white px-3 py-2 text-sm outline-none focus:ring-2 ring-brand"
                    rows={2}
                    placeholder="Escribe una respuesta para el alumno…"
                    value={drafts[s.id] ?? ''}
                    onChange={(e) => setDrafts((d) => ({ ...d, [s.id]: e.target.value }))}
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button disabled={busy === s.id || !(drafts[s.id] ?? '').trim()} onClick={() => send(s.id)}>
                      {busy === s.id ? 'Enviando…' : 'Responder'}
                    </Button>
                    {s.status === 'nueva' && (
                      <Button variant="ghost" disabled={busy === s.id} onClick={() => changeStatus(s.id, 'leida')}>
                        Marcar como vista
                      </Button>
                    )}
                    <Button variant="ghost" disabled={busy === s.id} onClick={() => changeStatus(s.id, 'resuelta')}>
                      Marcar resuelta sin responder
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
