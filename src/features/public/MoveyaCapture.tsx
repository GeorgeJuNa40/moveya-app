import { useState } from 'react';
import { captureLead } from '../../lib/platform';

// Página PÚBLICA de captura de leads (embudo Move yA). Un prospecto deja sus
// datos y se crea un lead en el CRM. Acepta ?src=<origen> en la URL para marcar
// de dónde llegó (ej. .../#/captura?src=instagram).
const inp = 'w-full rounded-xl border border-cream-dark bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 ring-brand';

function srcFromHash(): string {
  try {
    const q = window.location.hash.split('?')[1] ?? '';
    return new URLSearchParams(q).get('src') ?? 'formulario';
  } catch { return 'formulario'; }
}

export default function MoveyaCapture() {
  const [f, setF] = useState({ name: '', ownerName: '', phone: '', email: '', city: '', note: '' });
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) { setError('Escribe el nombre de tu estudio o gym.'); return; }
    setError(''); setSending(true);
    const ok = await captureLead({ ...f, source: srcFromHash() });
    setSending(false);
    if (ok) setDone(true);
    else setError('No se pudo enviar. Intenta de nuevo en un momento.');
  };

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg, #4A5D55 0%, #2f3b36 100%)' }}>
      <div className="mx-auto flex max-w-lg flex-col px-4 py-10">
        <div className="mb-6 text-center text-cream">
          <p className="text-sm font-semibold tracking-wide text-mint">MOVE yA</p>
          <h1 className="mt-2 text-2xl font-bold leading-tight">Lleva tu estudio o gym al siguiente nivel</h1>
          <p className="mt-2 text-sm text-cream/80">Reservas, pagos, membresías, coaches y WhatsApp — todo en un solo lugar. Déjanos tus datos y te mostramos cómo, sin compromiso.</p>
        </div>

        {done ? (
          <div className="rounded-2xl bg-white p-8 text-center shadow-lg">
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-green-100 text-3xl">✅</div>
            <h2 className="text-lg font-bold text-ink">¡Gracias! Recibimos tus datos.</h2>
            <p className="mt-2 text-sm text-ink-soft">Muy pronto te contactamos para mostrarte Move yA y ayudarte a arrancar con la prueba.</p>
            <a href="https://moveyaapp.app" className="mt-5 inline-block rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-cream">Conocer más</a>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3 rounded-2xl bg-white p-6 shadow-lg">
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
              <span className="mb-1 block text-xs font-medium text-ink-soft">Ciudad</span>
              <input className={inp} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} placeholder="CDMX, Guadalajara…" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-soft">¿Qué te gustaría resolver? (opcional)</span>
              <textarea className={`${inp} min-h-20`} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Ej. quiero ordenar reservas y cobros…" />
            </label>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button type="submit" disabled={sending} className="w-full rounded-full bg-brand px-5 py-3 text-sm font-semibold text-cream hover:opacity-90 disabled:opacity-60">
              {sending ? 'Enviando…' : 'Quiero una demo gratis'}
            </button>
            <p className="text-center text-[11px] text-ink-faint">Sin compromiso. Usamos tus datos solo para contactarte sobre Move yA.</p>
          </form>
        )}
      </div>
    </div>
  );
}
