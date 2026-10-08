import { useEffect, useState } from 'react';
import { useStore } from '../../lib/store';
import { PageHeader, Card, Button, Badge } from '../../components/ui';
import { notifySuccess } from '../../lib/notify';
import {
  submitSuggestion, fetchMySuggestions, SUGGESTION_CATEGORIES, categoryLabel,
  type MySuggestion,
} from '../../lib/suggestions';

// Alumno: buzón de sugerencias. Escribe una sugerencia (categoría + mensaje) y
// elige si la envía ANÓNIMA o con su nombre. Abajo ve sus sugerencias y la
// respuesta del estudio.
export default function Suggestions() {
  const { currentUser, currentStudio } = useStore();
  const uid = currentUser!.id;
  const studioId = currentStudio!.id;

  const [category, setCategory] = useState<string>('clases');
  const [message, setMessage] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [sending, setSending] = useState(false);
  const [mine, setMine] = useState<MySuggestion[]>([]);

  const load = async () => setMine(await fetchMySuggestions(uid));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const send = async () => {
    if (!message.trim()) return;
    setSending(true);
    const ok = await submitSuggestion({ studioId, userId: uid, category, message: message.trim(), anonymous });
    setSending(false);
    if (ok) {
      notifySuccess(anonymous ? '¡Sugerencia enviada de forma anónima! 🙌' : '¡Sugerencia enviada! 🙌');
      setMessage('');
      setAnonymous(false);
      void load();
    }
  };

  const statusBadge = (s: MySuggestion['status']) =>
    s === 'resuelta'
      ? <Badge tone="success">Respondida</Badge>
      : s === 'leida'
        ? <Badge tone="warning">Vista</Badge>
        : <Badge tone="neutral">Enviada</Badge>;

  return (
    <>
      <PageHeader title="Buzón de sugerencias" subtitle="Cuéntale al estudio cómo mejorar. Tú decides si es anónima." />

      {/* Formulario */}
      <Card className="mb-6 p-5">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-soft">Tema</span>
          <select
            className="w-full rounded-xl border border-cream-dark bg-white px-3 py-2 outline-none focus:ring-2 ring-brand"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {SUGGESTION_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </label>

        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-medium text-ink-soft">Tu sugerencia</span>
          <textarea
            className="w-full rounded-xl border border-cream-dark bg-white px-3 py-2 outline-none focus:ring-2 ring-brand"
            rows={4}
            placeholder="Ej. Me encantaría una clase de reformer los sábados por la mañana…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </label>

        {/* Anónimo / con nombre */}
        <div className="mt-3 flex items-center justify-between rounded-xl bg-cream-dark/30 px-3 py-2.5">
          <div className="min-w-0 pr-3">
            <p className="text-sm font-medium text-ink">Enviar de forma anónima</p>
            <p className="text-xs text-ink-faint">
              {anonymous
                ? 'El estudio NO verá tu nombre. Aun así podrás leer su respuesta aquí.'
                : 'El estudio verá tu nombre junto a la sugerencia.'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={anonymous}
            onClick={() => setAnonymous((v) => !v)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition ${anonymous ? 'bg-brand' : 'bg-cream-dark'}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${anonymous ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>

        <Button className="mt-4 w-full" disabled={sending || !message.trim()} onClick={send}>
          {sending ? 'Enviando…' : anonymous ? 'Enviar anónima' : 'Enviar sugerencia'}
        </Button>
      </Card>

      {/* Mis sugerencias */}
      <h2 className="mb-3 font-semibold text-ink">Mis sugerencias</h2>
      {mine.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-cream-dark p-8 text-center text-ink-faint">
          Aún no has enviado sugerencias. ¡Tu opinión ayuda a mejorar tu estudio! 💚
        </div>
      ) : (
        <div className="space-y-3">
          {mine.map((s) => (
            <Card key={s.id} className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">{categoryLabel(s.category)}</Badge>
                  {s.anonymous && <span className="text-xs text-ink-faint">🕶️ Anónima</span>}
                </div>
                {statusBadge(s.status)}
              </div>
              <p className="mt-2 text-sm text-ink-soft">{s.message}</p>
              <p className="mt-1 text-xs text-ink-faint">{new Date(s.createdAt).toLocaleDateString('es-MX')}</p>
              {s.reply && (
                <div className="mt-3 rounded-xl border-l-4 border-mint bg-cream px-3 py-2">
                  <p className="text-xs font-semibold text-brand">Respuesta del estudio 💬</p>
                  <p className="mt-0.5 text-sm text-ink-soft">{s.reply}</p>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
