-- ============================================================================
-- Move yA — Conexión de WhatsApp por estudio (Embedded Signup)
-- ----------------------------------------------------------------------------
-- Guarda el token de acceso de la cuenta de WhatsApp de CADA estudio en una
-- tabla PROTEGIDA: RLS activado y SIN políticas => nadie puede leerla desde el
-- cliente. Solo la service role (las Edge Functions whatsapp-connect y
-- whatsapp-webhook) puede leer/escribir. Así el token nunca llega al navegador.
--
-- Cómo usarlo: Supabase → SQL Editor → pega TODO → Run. Seguro re-ejecutarlo.
-- ============================================================================

create table if not exists public.whatsapp_accounts (
  studio_id       text primary key references public.studios(id) on delete cascade,
  waba_id         text,
  phone_number_id text unique,
  access_token    text not null,
  display_number  text,
  verified_name   text,
  connected_at    timestamptz not null default now()
);

-- RLS ON y sin políticas: bloquea todo acceso con anon/authenticated.
-- La service role IGNORA RLS, así que las Edge Functions siguen funcionando.
alter table public.whatsapp_accounts enable row level security;

-- Índice para buscar rápido por el id del número (lo usa el webhook entrante).
create index if not exists whatsapp_accounts_phone_idx
  on public.whatsapp_accounts (phone_number_id);

-- Verifica (debe listar la tabla con rls habilitado y 0 políticas):
--   select tablename, rowsecurity from pg_tables where tablename='whatsapp_accounts';
--   select count(*) from pg_policies where tablename='whatsapp_accounts';  -- => 0
-- ============================================================================
