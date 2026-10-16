-- ============================================================================
-- Move yA — Egresos / gastos del negocio (para el reporte contable PDF)
-- ============================================================================
create table if not exists public.expenses (
  id text primary key default (gen_random_uuid())::text,
  studio_id text not null references public.studios(id) on delete cascade,
  concept text not null,
  category text,
  amount_usd numeric not null default 0,
  spent_at timestamptz not null default now(),
  note text,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists idx_expenses_studio on public.expenses (studio_id, spent_at desc);
alter table public.expenses enable row level security;
create policy expenses_admin on public.expenses for all
  using (studio_id = auth_studio_id() and auth_role() = 'STUDIO_ADMIN')
  with check (studio_id = auth_studio_id() and auth_role() = 'STUDIO_ADMIN');
