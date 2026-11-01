-- ============================================================================
-- Move yA — Email marketing (registro de envíos) · Fase 2
-- ----------------------------------------------------------------------------
-- Guarda cada correo que Move yA envía a sus leads (vía Resend). Lo escribe la
-- Edge Function send-email (service role); el dueño lo lee desde el panel.
--
-- Depende de is_platform_owner(). Deploy: pégalo en Supabase → SQL Editor.
-- ============================================================================

create table if not exists public.moveya_emails (
  id          text primary key default (gen_random_uuid())::text,
  to_email    text not null,
  to_name     text,
  subject     text,
  status      text not null default 'sent',   -- sent | error
  provider_id text,                            -- id del envío en Resend
  error       text,
  sent_at     timestamptz not null default now()
);
create index if not exists idx_moveya_emails_sent on public.moveya_emails (sent_at desc);

alter table public.moveya_emails enable row level security;
-- Sin políticas: solo service role escribe; el dueño lee por RPC.

create or replace function public.moveya_emails_recent(p_limit int default 50)
returns setof public.moveya_emails
language sql security definer set search_path = public stable as $$
  select * from public.moveya_emails
  where public.is_platform_owner()
  order by sent_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 300));
$$;

revoke execute on function public.moveya_emails_recent(int) from public, anon;
grant  execute on function public.moveya_emails_recent(int) to authenticated;
