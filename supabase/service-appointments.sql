-- ============================================================================
-- Move yA — Citas/consultas de servicios opcionales (con comisión del estudio)
-- ----------------------------------------------------------------------------
-- Casos: nutriólogo, kinesiólogo, convenios, etc. El alumno SOLICITA una cita;
-- el estudio (admin) la AGENDA, la marca REALIZADA y registra la COMISIÓN que
-- cobra. El alumno paga DIRECTO al proveedor; el estudio solo lleva el control y
-- su comisión. (Fase 1a: sin login del proveedor. Fase 1b lo agregará después.)
--
-- Cómo usarlo: Supabase → SQL Editor → pega TODO → Run. Es seguro re-correrlo.
-- ============================================================================
create table if not exists public.service_appointments (
  id            text primary key default (gen_random_uuid())::text,
  studio_id     text not null references public.studios(id) on delete cascade,
  service_id    text not null,
  service_name  text not null,
  user_id       text not null references public.users(id) on delete cascade,
  user_name     text,
  preferred_at  timestamptz,                 -- fecha sugerida por el alumno
  scheduled_for timestamptz,                 -- fecha confirmada por el admin
  status        text not null default 'requested', -- requested|scheduled|done|cancelled
  commission_usd  numeric not null default 0, -- comisión que cobra el estudio
  commission_paid boolean not null default false,
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_svc_appts_studio on public.service_appointments (studio_id, created_at desc);
create index if not exists idx_svc_appts_user   on public.service_appointments (user_id, created_at desc);

alter table public.service_appointments enable row level security;
grant select, insert on public.service_appointments to authenticated;

-- El alumno ve SOLO sus propias citas.
drop policy if exists svc_appts_read_own on public.service_appointments;
create policy svc_appts_read_own on public.service_appointments
  for select using ( user_id = auth.uid()::text );

-- El alumno crea su propia solicitud (status 'requested', sin comisión ni fecha).
drop policy if exists svc_appts_insert_own on public.service_appointments;
create policy svc_appts_insert_own on public.service_appointments
  for insert with check (
    user_id = auth.uid()::text
    and studio_id = public.auth_studio_id()
    and public.auth_role() = 'STUDENT'
    and status = 'requested'
    and commission_usd = 0
    and commission_paid = false
    and scheduled_for is null
  );

-- El estudio (admin) ve, agenda, completa y cobra comisión: acceso total.
drop policy if exists svc_appts_admin on public.service_appointments;
create policy svc_appts_admin on public.service_appointments
  for all
  using      (studio_id = public.auth_studio_id() and public.auth_role() = 'STUDIO_ADMIN')
  with check (studio_id = public.auth_studio_id() and public.auth_role() = 'STUDIO_ADMIN');
-- ----------------------------------------------------------------------------
-- Auto-agenda (fase B): el alumno elige un hueco libre y la cita queda AGENDADA.
-- Política ADICIONAL (OR) a la de solicitud sin fecha.
drop policy if exists svc_appts_insert_self_slot on public.service_appointments;
create policy svc_appts_insert_self_slot on public.service_appointments
  for insert with check (
    user_id = auth.uid()::text
    and studio_id = public.auth_studio_id()
    and public.auth_role() = 'STUDENT'
    and status = 'scheduled'
    and commission_usd = 0
    and commission_paid = false
    and scheduled_for is not null
  );

-- Horarios OCUPADOS de un servicio (solo timestamps; no expone a ningún miembro),
-- para que el alumno calcule los huecos libres.
create or replace function public.service_taken_slots(p_service_id text)
returns setof timestamptz
language sql stable security definer set search_path = public as $$
  select scheduled_for from public.service_appointments
  where service_id = p_service_id
    and studio_id = public.auth_studio_id()
    and status in ('requested','scheduled')
    and scheduled_for is not null
$$;
revoke all on function public.service_taken_slots(text) from anon;
grant execute on function public.service_taken_slots(text) to authenticated;
-- ============================================================================
-- LISTO. Verifica:  select * from public.service_appointments;
-- ============================================================================
