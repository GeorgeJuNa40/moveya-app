-- Move yA — #5 Coaches externos (parte 1)
-- Tipo de coach (fijo/externo) y cómo el gym le cobra al externo.
alter table public.users add column if not exists coach_type text;          -- 'fijo' | 'externo'
alter table public.users add column if not exists external_fee_note text;    -- cómo el gym le cobra al externo (texto libre)
alter table public.users add column if not exists external_coach_id text;    -- alumno: coach externo al que pertenece (parte 2)
