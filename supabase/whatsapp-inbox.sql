-- ============================================================================
-- Move yA — Bandeja de entrada de WhatsApp + Handoff a humano (Nivel 2)
-- ----------------------------------------------------------------------------
-- Guarda las conversaciones de WhatsApp de cada estudio y sus mensajes, para
-- que el estudio pueda: ver los chats, tomar el control ("modo humano") cuando
-- un alumno quiere hablar con una persona, responder desde la app, y devolver
-- la conversación al bot cuando termina.
--
-- Cómo funciona el handoff:
--   - Cada conversación tiene un "modo": 'bot' (responde el asistente) o
--     'human' (el bot se calla y contesta una persona del estudio).
--   - El webhook (whatsapp-webhook) detecta cuando el alumno pide un humano,
--     pone la conversación en 'human', avisa al estudio y deja de responder.
--   - El estudio responde desde la Bandeja (Edge Function whatsapp-send).
--
-- Los mensajes los ESCRIBE el servidor (service role) desde las Edge Functions;
-- el estudio solo LEE (y puede cambiar el modo / marcar leído). RLS protege que
-- cada estudio vea únicamente sus propias conversaciones.
--
-- Cómo usarlo: Supabase → SQL Editor → pega TODO → Run. Seguro re-ejecutarlo.
-- ============================================================================

-- 1) Conversaciones (una por estudio + número de contacto).
create table if not exists public.wa_conversations (
  id text primary key,
  studio_id text not null references public.studios(id) on delete cascade,
  contact_phone text not null,                 -- número del alumno (con lada, sin +)
  contact_name text,                           -- nombre de perfil de WhatsApp, si llega
  phone_number_id text,                        -- id del número del estudio (para responder)
  mode text not null default 'bot',            -- 'bot' | 'human'
  last_message_at timestamptz,
  last_message_text text,
  last_direction text,                         -- 'in' | 'out'
  unread int not null default 0,               -- mensajes del alumno sin leer por el estudio
  last_notified_at timestamptz,                -- para no spamear notificaciones push
  created_at timestamptz not null default now(),
  unique (studio_id, contact_phone)
);
alter table public.wa_conversations enable row level security;

-- El personal del estudio (admin/coach) LEE y ACTUALIZA (modo, marcar leído).
drop policy if exists wa_conversations_staff on public.wa_conversations;
create policy wa_conversations_staff on public.wa_conversations
  for select
  using (public.auth_role() in ('STUDIO_ADMIN','COACH') and public.auth_studio_id() = studio_id);

drop policy if exists wa_conversations_staff_upd on public.wa_conversations;
create policy wa_conversations_staff_upd on public.wa_conversations
  for update
  using (public.auth_role() in ('STUDIO_ADMIN','COACH') and public.auth_studio_id() = studio_id)
  with check (public.auth_role() in ('STUDIO_ADMIN','COACH') and public.auth_studio_id() = studio_id);

create index if not exists wa_conversations_studio_idx
  on public.wa_conversations(studio_id, last_message_at desc);

-- 2) Mensajes de cada conversación.
create table if not exists public.wa_messages (
  id text primary key,
  conversation_id text not null references public.wa_conversations(id) on delete cascade,
  studio_id text not null references public.studios(id) on delete cascade,
  direction text not null,                     -- 'in' (entrante) | 'out' (saliente)
  sender text not null,                        -- 'contact' | 'bot' | 'human'
  body text,
  wa_message_id text,                          -- id del mensaje en WhatsApp (para deduplicar)
  created_at timestamptz not null default now()
);
alter table public.wa_messages enable row level security;

-- El personal del estudio solo LEE sus mensajes (las escrituras van por servidor).
drop policy if exists wa_messages_staff on public.wa_messages;
create policy wa_messages_staff on public.wa_messages
  for select
  using (public.auth_role() in ('STUDIO_ADMIN','COACH') and public.auth_studio_id() = studio_id);

create index if not exists wa_messages_conv_idx
  on public.wa_messages(conversation_id, created_at asc);

-- 3) Realtime: la Bandeja se actualiza en vivo (mensajes nuevos, cambios de modo).
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='wa_conversations') then
    alter publication supabase_realtime add table public.wa_conversations;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='wa_messages') then
    alter publication supabase_realtime add table public.wa_messages;
  end if;
end $$;
alter table public.wa_conversations replica identity full;
alter table public.wa_messages replica identity full;
-- ============================================================================
