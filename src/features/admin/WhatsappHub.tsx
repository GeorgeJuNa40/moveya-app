import { useState } from 'react';
import { PageHeader } from '../../components/ui';
import Inbox from './Inbox';
import WhatsappAgent from './WhatsappAgent';

// Hub de WhatsApp: reúne en una sola sección la Bandeja (chats en vivo) y la
// Configuración IA (bot, recordatorios y conocimiento), separadas por pestañas.
type Tab = 'inbox' | 'config';

export default function WhatsappHub() {
  const [tab, setTab] = useState<Tab>('inbox');

  return (
    <>
      <PageHeader title="WhatsApp" subtitle="Tus chats y la configuración del bot, en un solo lugar" />

      <div className="mb-5 flex gap-2">
        {([
          { id: 'inbox' as Tab, label: 'Bandeja' },
          { id: 'config' as Tab, label: 'Configuración IA' },
        ]).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              tab === t.id ? 'bg-brand text-cream-light shadow-soft' : 'bg-cream-dark/50 text-ink-soft hover:bg-cream-dark'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Se montan ambas una vez elegidas; la Bandeja mantiene su suscripción
          en vivo mientras esté visible. */}
      {tab === 'inbox' ? <Inbox embedded /> : <WhatsappAgent embedded />}
    </>
  );
}
