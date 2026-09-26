import { useState } from 'react';
import { useStore, botReply } from '../../lib/store';
import { PageHeader, Card, Button, Toggle } from '../../components/ui';
import type { WhatsappTemplate } from '../../lib/types';
import { launchWhatsAppSignup, connectWhatsApp, whatsappSignupAvailable } from '../../lib/whatsapp';
import { notifySuccess, notifyError } from '../../lib/notify';

// Agente de IA para WhatsApp: recordatorios de pago, avisos y respuestas del bot.
export default function WhatsappAgent() {
  const {
    currentStudio, updateWhatsapp, upsertWhatsappTemplate, deleteWhatsappTemplate,
    addKnowledge, addKnowledgeMany, removeKnowledge, studioAutoFacts,
  } = useStore();
  const wa = currentStudio!.whatsapp;

  const [tplDraft, setTplDraft] = useState<WhatsappTemplate | null>(null);
  const [newKnow, setNewKnow] = useState('');
  const [bulk, setBulk] = useState(''); // pegar mucha info de golpe
  const [showAuto, setShowAuto] = useState(false); // ver lo que el bot ya sabe
  const [chat, setChat] = useState<{ from: 'user' | 'bot'; text: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [manual, setManual] = useState(false); // mostrar el alta manual (Fase A)

  // Agrega varias líneas de golpe (una por renglón) a la base de conocimiento.
  const addBulk = (raw: string) => {
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length) {
      addKnowledgeMany(lines);
      notifySuccess(`Se agregaron ${lines.length} dato(s) al bot.`);
    }
    setBulk('');
  };

  // Lee un archivo de texto (.txt/.md) y lo agrega al conocimiento.
  const onFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 2_000_000) { notifyError('archivo', 'El archivo es muy grande (máx. 2 MB).'); return; }
    try {
      const text = await file.text();
      addBulk(text);
    } catch {
      notifyError('archivo', 'No pude leer el archivo. Copia y pega el texto en su lugar.');
    }
  };

  // Conecta el WhatsApp del estudio con el flujo oficial de Meta (Embedded Signup).
  const connect = async () => {
    setConnecting(true);
    try {
      const res = await launchWhatsAppSignup();
      const out = await connectWhatsApp(res);
      if (out.connected) {
        updateWhatsapp({
          connected: true,
          number: out.number ?? wa.number,
          verifiedName: out.verifiedName,
          phoneNumberId: out.phoneNumberId,
          wabaId: out.wabaId,
        });
        notifySuccess('¡WhatsApp conectado! Ya puedes enviar y recibir mensajes.');
      } else {
        notifyError('WhatsApp', 'No se pudo completar la conexión. Inténtalo de nuevo.');
      }
    } catch (e) {
      const m = (e as Error)?.message ?? 'Error';
      if (!/cancelad/i.test(m)) notifyError('WhatsApp', m);
    } finally {
      setConnecting(false);
    }
  };

  const sendChat = () => {
    if (!chatInput.trim()) return;
    const q = chatInput.trim();
    const reply = wa.botEnabled
      ? botReply(q, [...studioAutoFacts, ...wa.knowledge])
      : 'El bot está desactivado. Un miembro del estudio responderá pronto.';
    setChat((c) => [...c, { from: 'user', text: q }, { from: 'bot', text: reply }]);
    setChatInput('');
  };

  return (
    <>
      <PageHeader title="WhatsApp IA" subtitle="Recordatorios de pago, avisos del estudio y respuestas automáticas del bot" />

      {/* Estado del bot (lo controla la plataforma, no el estudio). */}
      {wa.aiActive ? (
        <div className="mb-6 rounded-2xl bg-brand-soft p-4 text-sm text-brand">
          ✨ <b>Bot con IA activo.</b> Responde a tus alumnos usando la base de conocimiento de tu estudio.
        </div>
      ) : (
        <div className="mb-6 rounded-2xl border border-cream-dark bg-cream-dark/30 p-4 text-sm text-ink-soft">
          Tu bot está en <b>modo básico</b> (respuestas guía, sin costo). Ya puedes configurar tu número,
          tus plantillas y tu base de conocimiento. El <b>bot con IA</b> se activa al contratar tu paquete.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Configuración */}
        <Card className="p-6">
          <h2 className="font-semibold text-ink mb-3">Tu número de WhatsApp</h2>

          {wa.connected ? (
            // --- Conectado por el flujo oficial de Meta ---
            <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
              <div className="flex items-center gap-2 text-green-800 font-semibold">
                <span>✅</span> WhatsApp conectado
              </div>
              <p className="mt-1 text-sm text-green-900/80">
                {wa.verifiedName ? <><b>{wa.verifiedName}</b> · </> : null}
                {wa.number ? `+${wa.number}` : 'Número vinculado'}
              </p>
              <button
                onClick={connect}
                disabled={connecting}
                className="mt-3 text-sm text-brand font-medium disabled:opacity-60"
              >
                {connecting ? 'Conectando…' : 'Reconectar / cambiar número'}
              </button>
            </div>
          ) : (
            // --- Sin conectar: botón oficial + alta manual como respaldo ---
            <div>
              <p className="text-sm text-ink-soft mb-3">
                Conecta el WhatsApp de tu estudio en un par de clics. Usamos el flujo
                oficial de Meta: tú autorizas tu número y listo.
              </p>
              <Button onClick={connect} disabled={connecting || !whatsappSignupAvailable()}>
                {connecting ? 'Conectando…' : 'Conectar mi WhatsApp'}
              </Button>
              {!whatsappSignupAvailable() && (
                <p className="mt-2 text-xs text-ink-faint">
                  La conexión con Meta aún se está habilitando. Mientras tanto puedes
                  registrar tu número manualmente.
                </p>
              )}

              <button
                onClick={() => setManual((v) => !v)}
                className="mt-4 block text-sm text-brand font-medium"
              >
                {manual ? 'Ocultar alta manual' : '¿Prefieres registrarlo manualmente?'}
              </button>
              {manual && (
                <label className="block mt-3">
                  <span className="mb-1 block text-sm font-medium text-ink-soft">Número de WhatsApp (formato internacional, sin +)</span>
                  <input
                    className="input"
                    placeholder="521234567890"
                    value={wa.number}
                    onChange={(e) => updateWhatsapp({ number: e.target.value.replace(/[^\d]/g, '') })}
                  />
                </label>
              )}
            </div>
          )}

          <div className="border-t border-cream-dark mt-4 pt-3">
            <Toggle
              label="Respuestas automáticas"
              description="Cuando está encendido, el bot contesta solo a tus alumnos. Apágalo si prefieres responder tú."
              checked={wa.botEnabled}
              onChange={(v) => updateWhatsapp({ botEnabled: v })}
            />
          </div>
          {wa.number && (
            <a
              href={`https://wa.me/${wa.number}`}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-sm text-brand font-medium"
            >
              Abrir chat de prueba: wa.me/{wa.number} ↗
            </a>
          )}
        </Card>

        {/* Base de conocimiento / retro */}
        <Card className="p-6">
          <h2 className="font-semibold text-ink mb-1">Retroalimentación del bot</h2>
          <p className="text-sm text-ink-faint mb-3">
            Agrega solo lo <b>extra</b> (preguntas frecuentes, promociones, indicaciones). El resto ya lo sabe solo.
          </p>

          {/* Lo que el bot ya sabe SOLO (auto-nutrición) */}
          <div className="mb-3 rounded-2xl bg-brand-soft p-3 text-sm text-brand">
            ✅ El bot ya conoce <b>tus paquetes, clases, horarios, dirección y política</b> automáticamente — no
            necesitas reescribirlos.
            <button onClick={() => setShowAuto((v) => !v)} className="ml-1 underline font-medium">
              {showAuto ? 'ocultar' : `ver (${studioAutoFacts.length})`}
            </button>
            {showAuto && (
              <ul className="mt-2 list-disc pl-5 text-ink-soft space-y-0.5">
                {studioAutoFacts.map((f, i) => <li key={i}>{f}</li>)}
                {studioAutoFacts.length === 0 && <li>Aún no hay datos. Carga tus paquetes y clases en la app.</li>}
              </ul>
            )}
          </div>

          {/* Lista de conocimiento extra agregado a mano */}
          <div className="space-y-2 max-h-40 overflow-y-auto mb-3">
            {wa.knowledge.map((k, i) => (
              <div key={i} className="flex items-start justify-between gap-2 rounded-lg bg-cream-dark/40 px-3 py-2 text-sm">
                <span className="text-ink-soft">{k}</span>
                <button onClick={() => removeKnowledge(i)} className="text-red-600 shrink-0">✕</button>
              </div>
            ))}
            {wa.knowledge.length === 0 && (
              <p className="text-xs text-ink-faint">Todavía no agregas info extra. Puedes pegar todo de golpe abajo. 👇</p>
            )}
          </div>

          {/* Agregar una línea */}
          <div className="flex gap-2 mb-4">
            <input className="input" placeholder="Ej. El estacionamiento es gratuito." value={newKnow} onChange={(e) => setNewKnow(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && newKnow.trim()) { addKnowledge(newKnow.trim()); setNewKnow(''); } }} />
            <Button onClick={() => { if (newKnow.trim()) { addKnowledge(newKnow.trim()); setNewKnow(''); } }}>Agregar</Button>
          </div>

          {/* Carga fácil: pegar mucho o subir archivo */}
          <div className="rounded-2xl border border-dashed border-cream-dark p-3">
            <p className="text-sm font-medium text-ink-soft mb-1">Carga rápida</p>
            <p className="text-xs text-ink-faint mb-2">Pega aquí toda tu info (una idea por renglón) o sube un archivo .txt.</p>
            <textarea
              className="input"
              rows={4}
              placeholder={"Ej.\nOfrecemos clase de prueba a $150.\nHay regaderas y lockers.\nAceptamos tarjeta y transferencia."}
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button onClick={() => addBulk(bulk)} disabled={!bulk.trim()}>Agregar todo</Button>
              <label className="cursor-pointer rounded-2xl border border-cream-dark px-3 py-2 text-sm font-medium text-ink-soft hover:bg-brand-soft">
                Subir archivo (.txt)
                <input type="file" accept=".txt,.md,text/plain" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              </label>
            </div>
            <p className="mt-2 text-[11px] text-ink-faint">💡 ¿Tienes un PDF? Ábrelo, copia el texto y pégalo aquí.</p>
          </div>
        </Card>

        {/* Plantillas de mensajes */}
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-ink">Mensajes editables</h2>
            <Button onClick={() => setTplDraft({ id: 'new', label: '', text: '' })}>+ Nueva plantilla</Button>
          </div>
          <p className="text-sm text-ink-faint mb-3">Variables disponibles: {'{nombre}'}, {'{plan}'}, {'{fecha}'}, {'{hora}'}, {'{clase}'}, {'{estudio}'}.</p>
          <div className="grid gap-3 md:grid-cols-2">
            {wa.templates.map((t) => (
              <div key={t.id} className="rounded-xl border border-cream-dark p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-ink">{t.label}</p>
                  <div className="flex gap-2 text-sm">
                    <button onClick={() => setTplDraft({ ...t })} className="text-brand font-medium">Editar</button>
                    <button onClick={() => deleteWhatsappTemplate(t.id)} className="text-red-600">✕</button>
                  </div>
                </div>
                <p className="mt-2 text-sm text-ink-soft whitespace-pre-wrap">{t.text}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Simulador del bot */}
        <Card className="p-6 lg:col-span-2">
          <h2 className="font-semibold text-ink mb-1">Prueba al bot</h2>
          <p className="text-xs text-ink-faint mb-3">
            Adelanto rápido (busca por palabras). El bot <b>real por WhatsApp</b> usa IA y entiende mucho mejor toda tu
            info. Prueba con: <i>"¿qué paquetes tienen?"</i> o <i>"¿dónde están?"</i>.
          </p>
          <div className="rounded-xl bg-[#e7ded0]/40 border border-cream-dark p-4 h-56 overflow-y-auto space-y-2">
            {chat.length === 0 && <p className="text-sm text-ink-faint text-center mt-16">Escribe un mensaje para ver cómo responde el bot.</p>}
            {chat.map((m, i) => (
              <div key={i} className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                <span className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.from === 'user' ? 'bg-brand text-cream' : 'bg-white text-ink border border-cream-dark'}`}>{m.text}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input className="input" placeholder="Escribe como si fueras un alumno…" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendChat()} />
            <Button onClick={sendChat}>Enviar</Button>
          </div>
        </Card>
      </div>

      {tplDraft && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4">
          <Card className="w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-ink mb-4">{tplDraft.id === 'new' ? 'Nueva plantilla' : 'Editar plantilla'}</h2>
            <label className="block mb-3">
              <span className="mb-1 block text-sm font-medium text-ink-soft">Nombre</span>
              <input className="input" value={tplDraft.label} onChange={(e) => setTplDraft({ ...tplDraft, label: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-soft">Mensaje</span>
              <textarea rows={4} className="input" value={tplDraft.text} onChange={(e) => setTplDraft({ ...tplDraft, text: e.target.value })} />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setTplDraft(null)}>Cancelar</Button>
              <Button onClick={() => { if (tplDraft.label.trim()) { upsertWhatsappTemplate(tplDraft); setTplDraft(null); } }}>Guardar</Button>
            </div>
          </Card>
        </div>
      )}
      <style>{`.input{width:100%;border:1px solid #E8E3D6;border-radius:.75rem;padding:.6rem .8rem;background:#fff;outline:none}.input:focus{box-shadow:0 0 0 2px var(--brand-primary)}`}</style>
    </>
  );
}
