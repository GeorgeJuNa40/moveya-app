import { useMemo, useState } from 'react';
import { requestDemo } from '../../lib/platform';

// Página PÚBLICA de agenda de demos (embudo Move yA). El prospecto elige día y
// hora, deja sus datos y se crea un lead en el CRM en la etapa 'demo' con la
// fecha/hora en demo_at. Acepta ?src=<origen> en la URL (ej. .../#/demo?src=ig).
const inp = 'w-full rounded-xl border border-cream-dark bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 ring-brand';

function srcFromHash(): string {
  try {
    const q = window.location.hash.split('?')[1] ?? '';
    return new URLSearchParams(q).get('src') ?? 'agenda-demo';
  } catch { return 'agenda-demo'; }
}

// Horarios disponibles (hora local del prospecto). Ajustables.
const SLOTS = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'];
const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// Próximos ~12 días hábiles (excluye domingos), a partir de mañana.
function nextDays(count = 12): Date[] {
  const out: Date[] = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  while (out.length < count) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0) out.push(new Date(d)); // salta domingos
  }
  return out;
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function MoveyaDemo() {
  const days = useMemo(() => nextDays(12), []);
  const [day, setDay] = useState<Date | null>(null);
  const [slot, setSlot] = useState<string>('');
  const [f, setF] = useState({ name: '', ownerName: '', phone: '', email: '', city: '', note: '' });
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!day || !slot) { setError('Elige un día y una hora para tu demo.'); return; }
    if (!f.name.trim()) { setError('Escribe el nombre de tu estudio o gym.'); return; }
    setError(''); setSending(true);
    // Construye la fecha/hora local elegida en formato ISO.
    const [h, m] = slot.split(':').map(Number);
    const when = new Date(day);
    when.setHours(h, m, 0, 0);
    const ok = await requestDemo({ ...f, source: srcFromHash(), demoAt: when.toISOString() });
    setSending(false);
    if (ok) setDone(true);
    else setError('No se pudo agendar. Intenta de nuevo en un momento.');
  };

  const prettyWhen = day && slot
    ? `${DAY_NAMES[day.getDay()]} ${day.getDate()} ${MONTHS[day.getMonth()]} · ${slot} h`
    : '';

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg, #4A5D55 0%, #2f3b36 100%)' }}>
      <div className="mx-auto flex max-w-xl flex-col px-4 py-10">
        <div className="mb-6 text-center text-cream">
          <p className="text-sm font-semibold tracking-wide text-mint">Move yA</p>
          <h1 className="mt-2 text-2xl font-bold leading-tight">Agenda tu demo gratis</h1>
          <p className="mt-2 text-sm text-cream/80">15 minutos en video. Te muestro Move yA en vivo con el caso de tu estudio y resolvemos tus dudas. Sin compromiso.</p>
        </div>

        {done ? (
          <div className="rounded-2xl bg-white p-8 text-center shadow-lg">
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-green-100 text-3xl">📅</div>
            <h2 className="text-lg font-bold text-ink">¡Demo agendada!</h2>
            <p className="mt-2 text-sm text-ink-soft">Te esperamos el <strong className="text-ink">{prettyWhen}</strong>. Te contactaremos para confirmar y enviarte el enlace de la videollamada.</p>
            <a href="#/" className="mt-5 inline-block rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-cream">Conocer más de Move yA</a>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5 rounded-2xl bg-white p-6 shadow-lg">
            {/* Paso 1: día */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">1 · Elige el día</p>
              <div className="flex flex-wrap gap-2">
                {days.map((d) => {
                  const active = day && ymd(d) === ymd(day);
                  return (
                    <button
                      type="button"
                      key={ymd(d)}
                      onClick={() => setDay(d)}
                      className={`flex min-w-[60px] flex-col items-center rounded-xl border px-3 py-2 text-center transition ${active ? 'border-brand bg-brand text-cream' : 'border-cream-dark bg-cream text-ink hover:border-brand'}`}
                    >
                      <span className="text-[11px] font-medium opacity-80">{DAY_NAMES[d.getDay()]}</span>
                      <span className="text-base font-bold leading-tight">{d.getDate()}</span>
                      <span className="text-[11px] opacity-80">{MONTHS[d.getMonth()]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Paso 2: hora */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">2 · Elige la hora</p>
              <div className="flex flex-wrap gap-2">
                {SLOTS.map((s) => {
                  const active = slot === s;
                  return (
                    <button
                      type="button"
                      key={s}
                      onClick={() => setSlot(s)}
                      className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${active ? 'border-brand bg-brand text-cream' : 'border-cream-dark bg-cream text-ink hover:border-brand'}`}
                    >
                      {s} h
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-[11px] text-ink-faint">Horario de tu zona. Confirmamos por WhatsApp o correo.</p>
            </div>

            {/* Paso 3: datos */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">3 · Tus datos</p>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink-soft">Nombre de tu estudio o gym *</span>
                <input className={inp} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Estudio Pilates Sur" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink-soft">Tu nombre</span>
                <input className={inp} value={f.ownerName} onChange={(e) => setF({ ...f, ownerName: e.target.value })} placeholder="Ana López" />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-ink-soft">WhatsApp</span>
                  <input className={inp} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+52..." />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-ink-soft">Correo</span>
                  <input className={inp} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="correo@..." />
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink-soft">¿Qué te gustaría resolver? (opcional)</span>
                <textarea className={`${inp} min-h-16`} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Ej. quiero ordenar reservas y cobros…" />
              </label>
            </div>

            {prettyWhen && (
              <div className="rounded-xl bg-cream px-4 py-3 text-sm text-ink">
                📅 Tu demo: <strong>{prettyWhen}</strong>
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button type="submit" disabled={sending} className="w-full rounded-full bg-brand px-5 py-3 text-sm font-semibold text-cream hover:opacity-90 disabled:opacity-60">
              {sending ? 'Agendando…' : 'Agendar mi demo'}
            </button>
            <p className="text-center text-[11px] text-ink-faint">Sin compromiso. Usamos tus datos solo para contactarte sobre Move yA.</p>
          </form>
        )}
      </div>
    </div>
  );
}
