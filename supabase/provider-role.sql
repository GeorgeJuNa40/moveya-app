-- ============================================================================
-- Move yA — Rol PROVIDER (proveedor de servicio con login propio) · fase 1b
-- ----------------------------------------------------------------------------
-- El proveedor (nutriólogo/kinesiólogo/convenio) se registra con un link propio
-- ligado a UN servicio (?role=proveedor&service=<id>) y ve/gestiona SOLO las
-- citas de ese servicio. NO ve datos de miembros: políticas RESTRICTIVAS se lo
-- impiden. Las comisiones las maneja el estudio (el proveedor no las ve/toca).
--
-- Cómo usarlo: Supabase → SQL Editor → pega TODO → Run. Es seguro re-correrlo.
-- (El disparador handle_new_user vive en birthdate-setup.sql, ya con la rama
-- PROVIDER; re-córrelo también.)
-- ============================================================================

-- 1) Rol y columna que liga al proveedor con su servicio.
alter type public.role add value if not exists 'PROVIDER';
alter table public.users add column if not exists provider_service_id text;

-- 2) Servicio que atiende el proveedor (desde su propio registro).
create or replace function public.auth_provider_service()
returns text language sql stable security definer set search_path = public as $$
  select provider_service_id from public.users where id = auth.uid()::text
$$;

-- 3) El admin necesita UPDATE sobre las citas (agendar / comisión).
grant update on public.service_appointments to authenticated;

-- 4) El proveedor ve y gestiona SOLO las citas de SU servicio.
drop policy if exists svc_appts_provider_read on public.service_appointments;
create policy svc_appts_provider_read on public.service_appointments
  for select using (
    public.auth_real_role() = 'PROVIDER'
    and studio_id = public.auth_studio_id()
    and service_id = public.auth_provider_service()
  );
drop policy if exists svc_appts_provider_update on public.service_appointments;
create policy svc_appts_provider_update on public.service_appointments
  for update using (
    public.auth_real_role() = 'PROVIDER'
    and studio_id = public.auth_studio_id()
    and service_id = public.auth_provider_service()
  ) with check (
    public.auth_real_role() = 'PROVIDER'
    and studio_id = public.auth_studio_id()
    and service_id = public.auth_provider_service()
  );

-- 5) PRIVACIDAD: políticas RESTRICTIVAS que niegan al proveedor los datos de
--    miembros (no afectan a otros roles; solo se ve a sí mismo en users).
drop policy if exists users_block_provider on public.users;
create policy users_block_provider on public.users as restrictive for select
  using (coalesce(public.auth_real_role(),'') <> 'PROVIDER' or id = auth.uid()::text);
drop policy if exists up_block_provider on public.user_packages;
create policy up_block_provider on public.user_packages as restrictive for select
  using (coalesce(public.auth_real_role(),'') <> 'PROVIDER');
drop policy if exists bk_block_provider on public.bookings;
create policy bk_block_provider on public.bookings as restrictive for select
  using (coalesce(public.auth_real_role(),'') <> 'PROVIDER');
drop policy if exists pay_block_provider on public.payments;
create policy pay_block_provider on public.payments as restrictive for select
  using (coalesce(public.auth_real_role(),'') <> 'PROVIDER');
drop policy if exists star_block_provider on public.star_entries;
create policy star_block_provider on public.star_entries as restrictive for select
  using (coalesce(public.auth_real_role(),'') <> 'PROVIDER');
drop policy if exists goal_block_provider on public.goals;
create policy goal_block_provider on public.goals as restrictive for select
  using (coalesce(public.auth_real_role(),'') <> 'PROVIDER');
drop policy if exists cg_block_provider on public.class_guests;
create policy cg_block_provider on public.class_guests as restrictive for select
  using (coalesce(public.auth_real_role(),'') <> 'PROVIDER');
-- ============================================================================
-- LISTO. El proveedor se invita desde Servicios → cada servicio con "Permitir
-- agendar" muestra el enlace "Invitar al proveedor".
-- ============================================================================
