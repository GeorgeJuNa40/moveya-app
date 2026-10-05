-- ============================================================================
-- Move yA — Mercado Pago: tablas y columnas (además de Stripe)
-- ----------------------------------------------------------------------------
-- Modelo marketplace (espejo de Stripe Connect):
--   * Cada estudio conecta su cuenta MP por OAuth -> guardamos su access_token
--     en `mp_accounts` (SOLO service role; como whatsapp_accounts).
--   * Los pagos del alumno van a la cuenta del estudio; Move yA cobra su
--     comisión con `marketplace_fee` (misma config que Stripe: PLATFORM_FEE_*).
--   * La suscripción SaaS del estudio (estudio -> Move yA) usa la cuenta MP de
--     la plataforma (preapproval); se guarda en studios.subscription (jsonb).
--
-- Cómo usarlo: Supabase -> SQL Editor -> pega TODO -> Run. Es seguro re-correrlo.
-- ============================================================================

-- 1. Conexión MP de cada estudio (marketplace). Solo el service role (las Edge
--    Functions) la lee/escribe. RLS activado SIN políticas = acceso denegado a
--    anon/authenticated (igual que whatsapp_accounts).
create table if not exists public.mp_accounts (
  studio_id        text primary key references public.studios(id) on delete cascade,
  mp_user_id       text,                 -- id del vendedor en MP
  access_token     text,                 -- token del estudio (SECRETO)
  refresh_token    text,                 -- para renovar el token
  public_key       text,
  connected        boolean not null default false,
  token_expires_at timestamptz,
  updated_at       timestamptz not null default now()
);
alter table public.mp_accounts enable row level security;
-- (sin políticas a propósito: solo service role)

-- 2. payments: de qué proveedor vino el pago + id de pago de MP.
alter table public.payments add column if not exists provider      text not null default 'stripe';
alter table public.payments add column if not exists mp_payment_id text;

-- 3. user_packages: membresías recurrentes por MP (domiciliación con preapproval).
alter table public.user_packages add column if not exists provider          text;
alter table public.user_packages add column if not exists mp_preapproval_id text;

-- 4. Índices útiles para que el webhook encuentre rápido por id de MP.
create index if not exists idx_user_packages_mp_preapproval
  on public.user_packages (mp_preapproval_id);
create index if not exists idx_payments_mp_payment
  on public.payments (mp_payment_id);

-- NOTA (sin DDL): el proveedor de cobro que acepta el estudio y el preapproval
-- de la suscripción SaaS se guardan en jsonb existentes:
--   * studios.branding.paymentProviders  -> ['stripe','mercadopago'] (lo que acepta)
--   * studios.subscription.mpPreapprovalId / .provider -> suscripción SaaS por MP

-- ============================================================================
-- Verificación:
--   select table_name from information_schema.tables
--   where table_name = 'mp_accounts';
-- ============================================================================
