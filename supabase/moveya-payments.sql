-- ============================================================================
-- Move yA — Transacciones del SaaS (ingreso de la plataforma)
-- ----------------------------------------------------------------------------
-- Registra cada cobro de SUSCRIPCIÓN que los estudios le pagan a Move yA
-- (alta, renovación mensual/anual, prueba de $1). La escriben los webhooks
-- (service role); el dueño las lee desde el panel (Pagos → Transacciones).
-- Idempotente por `ref` (id de sesión / factura / pago).
--
-- Depende de is_platform_owner() (moveya-products-admin.sql).
-- Deploy: pégalo en Supabase → SQL Editor. Aditivo y seguro.
-- ============================================================================

create table if not exists public.moveya_payments (
  id          text primary key default (gen_random_uuid())::text,
  studio_id   text references public.studios(id) on delete set null,
  studio_name text,                              -- snapshot (sobrevive si se borra el estudio)
  amount      numeric not null default 0,
  currency    text not null default 'USD',       -- USD (Stripe) | MXN (Mercado Pago)
  concept     text,                              -- 'Suscripción Pro', 'Fundador', 'Prueba $1', 'Renovación Premium'...
  provider    text,                              -- stripe | mercadopago
  ref         text unique,                       -- idempotencia (session/invoice/payment id)
  paid_at     timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists idx_moveya_payments_paid on public.moveya_payments (paid_at desc);

alter table public.moveya_payments enable row level security;
-- Sin políticas: solo service role (webhooks) escribe; el dueño lee por RPC.

-- Transacciones recientes — solo el dueño.
create or replace function public.moveya_payments_recent(p_limit int default 100)
returns setof public.moveya_payments
language sql security definer set search_path = public stable as $$
  select * from public.moveya_payments
  where public.is_platform_owner()
  order by paid_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

revoke execute on function public.moveya_payments_recent(int) from public, anon;
grant  execute on function public.moveya_payments_recent(int) to authenticated;
