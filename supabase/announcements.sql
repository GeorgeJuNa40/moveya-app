-- ============================================================================
-- Move yA — Avisos del estudio (notificación masiva push a los alumnos)
-- La Edge Function broadcast-push envía el aviso y registra aquí el historial.
-- ============================================================================
create table if not exists public.announcements (
  id text primary key default (gen_random_uuid())::text,
  studio_id text not null references public.studios(id) on delete cascade,
  title text not null,
  body text not null,
  sent_by text,
  recipients integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_announcements_studio on public.announcements (studio_id, created_at desc);
alter table public.announcements enable row level security;
create policy announcements_read on public.announcements for select using (studio_id = auth_studio_id());
create policy announcements_admin on public.announcements for all
  using (studio_id = auth_studio_id() and auth_role() = 'STUDIO_ADMIN')
  with check (studio_id = auth_studio_id() and auth_role() = 'STUDIO_ADMIN');

-- ============================================================================
-- Tienda: enlaces de afiliado (e-commerce sin inventario). Columnas en products.
-- ============================================================================
alter table public.products add column if not exists kind text not null default 'physical'; -- 'physical' | 'affiliate'
alter table public.products add column if not exists url text; -- solo 'affiliate'
