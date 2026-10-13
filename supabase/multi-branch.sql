-- Move yA — #6 Multi-sucursal + reglas del negocio
-- (reglas del negocio viven en studios.branding JSON, no requieren columna)
alter table public.studios add column if not exists branches jsonb not null default '[]'::jsonb;
alter table public.users   add column if not exists branch_id text;  -- sucursal del miembro/coach
