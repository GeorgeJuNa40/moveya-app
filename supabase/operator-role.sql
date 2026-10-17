-- ============================================================================
-- Move yA — Rol OPERADOR / RECEPCIÓN (empleado con acceso limitado)
-- ----------------------------------------------------------------------------
-- El operador opera el día a día del negocio (miembros, calendario, clases,
-- paquetes y tienda) pero NO ve reportes, configuración, suscripción ni datos
-- sensibles del negocio. El aislamiento de pantallas es a nivel de APP (igual que
-- el gerente de sucursal). A nivel de BD, auth_role() lo trata como STUDIO_ADMIN
-- para que las operaciones funcionen; la APP oculta/bloquea lo sensible.
--
-- Cómo usarlo: Supabase → SQL Editor → pega TODO → Run. Es seguro re-correrlo.
-- (El disparador handle_new_user vive en birthdate-setup.sql, ya actualizado con
-- la rama OPERATOR; re-córrelo también si aún no lo has hecho.)
-- ============================================================================

-- 1) Nuevo valor en el enum de roles.
alter type public.role add value if not exists 'OPERATOR';

-- 2) auth_role() mapea BRANCH_ADMIN y OPERATOR -> STUDIO_ADMIN para RLS.
create or replace function public.auth_role()
returns text
language sql
stable security definer
set search_path to 'public'
as $function$
  select case when role::text in ('BRANCH_ADMIN','OPERATOR') then 'STUDIO_ADMIN' else role::text end
  from public.users where id = auth.uid()::text
$function$;
-- ============================================================================
-- LISTO. El operador se invita desde la app (Configuración → Invitaciones →
-- "Invitar recepción / operador"). El link lleva ?role=operador.
-- ============================================================================
