// ============================================================================
// Move yA — Bandeja de WhatsApp (Nivel 2: handoff a humano)
// ----------------------------------------------------------------------------
// El estudio ve aquí todas sus conversaciones de WhatsApp, toma el control
// cuando un alumno quiere hablar con una persona (modo humano) y responde en
// vivo. Puede devolver la conversación al bot cuando termina.
// ============================================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../../lib/store';
import type { WaConversation, WaMessage } from '../../lib/types';
import {
  fetchConversations,
  fetchMessages,
  markConversationRead,
  sendReply,
  setConversationMode,
  subscribeInbox,
} from '../../lib/inbox';

function fmtTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('es', { day: '2-digit', month: 'short' });
}

const prettyPhone = (p: string) => (p ? `+${p}` : '');

export default function Inbox() {
  const { currentStudio } = useStore();
  const [convos, setConvos] = useState<WaConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const active = convos.find((c) => c.id === activeId) ?? null;

  const reloadConvos = useCallback(async () => {
    const list = await fetchConversations();
    setConvos(list);
    setLoading(false);
  }, []);

  // Carga inicial + suscripción en vivo.
  useEffect(() => {
    void reloadConvos();
    const unsub = subscribeInbox(
      () => void reloadConvos(),
      (m) => {
        // Mensaje nuevo: si es de la conversación abierta, lo agregamos.
        if (m.conversationId === activeIdRef.current) {
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        }
        void reloadConvos();
      },
    );
    return unsub;
  }, [reloadConvos]);

  // Al abrir una conversación: carga sus mensajes y la marca como leída.
  const openConversation = useCallback(async (id: string) => {
    setActiveId(id);
    setMessages(await fetchMessages(id));
    await markConversationRead(id);
    setConvos((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
  }, []);

  // Auto-scroll al último mensaje.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeId]);

  const toggleMode = async () => {
    if (!active) return;
    const next = active.mode === 'human' ? 'bot' : 'human';
    setConvos((prev) => prev.map((c) => (c.id === active.id ? { ...c, mode: next } : c)));
    await setConversationMode(active.id, next);
  };

  const handleSend = async () => {
    const body = text.trim();
    if (!body || !active || sending) return;
    setSending(true);
    const ok = await sendReply(active.id, body);
    if (ok) {
      setText('');
      setMessages(await fetchMessages(active.id));
      void reloadConvos();
    }
    setSending(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-ink">Bandeja de WhatsApp</h1>
        <p className="text-sm text-ink-soft mt-1">
          Chats de tus alumnos. Cuando alguien pide hablar con una persona, el bot se calla y tú tomas el control aquí.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        {/* Lista de conversaciones */}
        <aside
          className={`rounded-2xl border border-cream-dark bg-white overflow-hidden ${
            active ? 'hidden lg:block' : 'block'
          }`}
        >
          <div className="max-h-[70vh] overflow-y-auto divide-y divide-cream-dark">
            {loading && <p className="p-4 text-sm text-ink-faint">Cargando…</p>}
            {!loading && convos.length === 0 && (
              <div className="p-6 text-center">
                <p className="text-sm text-ink-soft">Aún no hay conversaciones.</p>
                <p className="text-xs text-ink-faint mt-1">
                  Aquí aparecerán los chats cuando tus alumnos escriban a tu WhatsApp.
                </p>
              </div>
            )}
            {convos.map((c) => (
              <button
                key={c.id}
                onClick={() => void openConversation(c.id)}
                className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-brand-soft ${
                  c.id === activeId ? 'bg-brand-soft' : ''
                }`}
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-mint/30 text-sm font-semibold text-brand">
                  {(c.contactName || prettyPhone(c.contactPhone)).slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-ink">
                      {c.contactName || prettyPhone(c.contactPhone)}
                    </p>
                    <span className="shrink-0 text-[11px] text-ink-faint">{fmtTime(c.lastMessageAt)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="truncate text-xs text-ink-soft flex-1">
                      {c.lastDirection === 'out' ? '↩ ' : ''}
                      {c.lastMessageText || '—'}
                    </p>
                    {c.mode === 'human' && (
                      <span className="shrink-0 rounded-full bg-mint/50 px-1.5 py-0.5 text-[10px] font-semibold text-ink">
                        Humano
                      </span>
                    )}
                    {c.unread > 0 && (
                      <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-brand px-1 text-[11px] font-bold text-cream-light">
                        {c.unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* Conversación activa */}
        <section
          className={`rounded-2xl border border-cream-dark bg-white flex flex-col ${
            active ? 'block' : 'hidden lg:flex'
          } min-h-[60vh]`}
        >
          {!active ? (
            <div className="flex flex-1 items-center justify-center p-10 text-center">
              <p className="text-sm text-ink-faint">Elige una conversación para verla aquí.</p>
            </div>
          ) : (
            <>
              {/* Encabezado */}
              <div className="flex items-center gap-3 border-b border-cream-dark p-3">
                <button
                  onClick={() => setActiveId(null)}
                  className="grid h-9 w-9 place-items-center rounded-full text-ink-soft hover:bg-brand-soft lg:hidden"
                  aria-label="Volver"
                >
                  ‹
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">
                    {active.contactName || prettyPhone(active.contactPhone)}
                  </p>
                  <p className="text-xs text-ink-faint">
                    {prettyPhone(active.contactPhone)} ·{' '}
                    {active.mode === 'human' ? 'Atendido por una persona' : 'Responde el asistente'}
                  </p>
                </div>
                <button
                  onClick={() => void toggleMode()}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    active.mode === 'human'
                      ? 'bg-brand text-cream-light hover:opacity-90'
                      : 'bg-cream text-ink-soft hover:bg-brand-soft'
                  }`}
                >
                  {active.mode === 'human' ? '↩ Devolver al bot' : '🙋 Tomar control'}
                </button>
              </div>

              {/* Mensajes */}
              <div className="flex-1 space-y-2 overflow-y-auto bg-cream-light/40 p-4 max-h-[52vh]">
                {messages.length === 0 && <p className="text-center text-xs text-ink-faint">Sin mensajes.</p>}
                {messages.map((m) => {
                  const mine = m.direction === 'out';
                  return (
                    <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-soft ${
                          mine ? 'bg-brand text-cream-light' : 'bg-white text-ink border border-cream-dark'
                        }`}
                      >
                        {mine && (
                          <p className="mb-0.5 text-[10px] font-semibold opacity-70">
                            {m.sender === 'human' ? '👤 Tú' : '🤖 Bot'}
                          </p>
                        )}
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        <p className={`mt-0.5 text-[10px] ${mine ? 'text-cream-light/70' : 'text-ink-faint'}`}>
                          {fmtTime(m.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              {/* Redactar */}
              <div className="border-t border-cream-dark p-3">
                {active.mode !== 'human' && (
                  <p className="mb-2 text-[11px] text-ink-faint">
                    💡 Esta conversación la responde el bot. Al enviar un mensaje, tú tomas el control.
                  </p>
                )}
                <div className="flex items-end gap-2">
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={onKeyDown}
                    rows={1}
                    placeholder="Escribe tu respuesta…"
                    className="flex-1 resize-none rounded-2xl border border-cream-dark px-3 py-2 text-sm outline-none focus:border-brand"
                  />
                  <button
                    onClick={() => void handleSend()}
                    disabled={sending || !text.trim()}
                    className="shrink-0 rounded-2xl bg-brand px-4 py-2 text-sm font-semibold text-cream-light transition hover:opacity-90 disabled:opacity-40"
                  >
                    {sending ? '…' : 'Enviar'}
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {currentStudio && !currentStudio.whatsapp?.number && !currentStudio.whatsapp?.connected && (
        <p className="mt-4 text-xs text-ink-faint">
          Aún no tienes un número de WhatsApp conectado. Conéctalo en la sección <b>WhatsApp IA</b> para poder responder
          desde aquí.
        </p>
      )}
    </div>
  );
}
