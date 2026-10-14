-- ============================================================================
-- Move yA — Gerente de sucursal (BRANCH_ADMIN) · multi-sucursal "pro"
-- ----------------------------------------------------------------------------
-- 1) Agrega el rol BRANCH_ADMIN al enum de roles.
-- 2) auth_role() mapea BRANCH_ADMIN -> STUDIO_ADMIN para efectos de RLS, así el
--    gerente puede administrar su estudio a nivel de BD; la APP filtra la vista
--    a SU sucursal (por branch_id). El trigger handle_new_user (en
--    birthdate-setup.sql) crea al gerente ligado a su sucursal.
-- Nota: el aislamiento por sucursal es a nivel de app (Opción A). Endurecer con
-- RLS por branch_id queda como mejora futura.
-- ============================================================================

alter type public.role add value if not exists 'BRANCH_ADMIN';

create or replace function public.auth_role()
returns text
language sql
stable security definer
set search_path to 'public'
as $function$
  select case when role::text = 'BRANCH_ADMIN' then 'STUDIO_ADMIN' else role::text end
  from public.users where id = auth.uid()::text
$function$;
