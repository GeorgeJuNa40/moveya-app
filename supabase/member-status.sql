-- ============================================================================
-- Move yA — Baja / vetar / eliminar miembros del CRM
-- member_status: 'active' (def.) | 'inactive' (dado de baja) | 'banned' (vetado)
-- Los no-activos se ocultan de activos y no pueden usar la app.
-- Eliminar: la app borra el usuario (RLS admin); las tablas hijas con
-- ON DELETE CASCADE (pagos, paquetes, reservas, estrellas, metas, sugerencias,
-- push) se limpian solas.
-- ============================================================================
alter table public.users add column if not exists member_status text not null default 'active';
