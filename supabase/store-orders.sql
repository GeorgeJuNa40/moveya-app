-- ============================================================================
-- Move yA — Pedidos de tienda (Fase A: "apartar / pedir")
-- ----------------------------------------------------------------------------
-- El alumno/coach arma un carrito y "aparta" un pedido; al admin le llega en su
-- vista de Pedidos, lo cobra en mostrador y lo marca entregado (descuenta stock
-- vía pos_sell). El pago en línea de productos es Fase B.
-- Aditivo y seguro para estudios ya operando.
-- ============================================================================

create table if not exists public.store_orders (
  id text primary key default (gen_random_uuid())::text,
  studio_id text not null references public.studios(id) on delete cascade,
  user_id text not null,
  user_name text,
  items jsonb not null default '[]'::jsonb,   -- [{productId,name,qty,unitPrice}]
  total numeric not null default 0,
  status text not null default 'pending',     -- pending | fulfilled | canceled
  note text,
  created_at timestamptz not null default now(),
  fulfilled_at timestamptz
);

-- Fase B (pago en línea): proveedor y referencia del pago (idempotencia).
alter table public.store_orders add column if not exists provider text;
alter table public.store_orders add column if not exists paid_ref text;
-- status: 'pending' (apartado) | 'awaiting_payment' (pago en línea en curso) |
--         'fulfilled' (entregado/pagado) | 'canceled'.

create index if not exists idx_store_orders_studio on public.store_orders (studio_id, status, created_at desc);

alter table public.store_orders enable row level security;

-- El miembro crea su propio pedido dentro de su estudio.
drop policy if exists store_orders_insert on public.store_orders;
create policy store_orders_insert on public.store_orders
  for insert with check (studio_id = auth_studio_id() and user_id = (auth.uid())::text);

-- Cualquier usuario del estudio puede leer los pedidos de su estudio (el alumno
-- ve el suyo en la lista; el admin ve todos).
drop policy if exists store_orders_read on public.store_orders;
create policy store_orders_read on public.store_orders
  for select using (studio_id = auth_studio_id());

-- Solo el admin (o gerente, vía auth_role) cambia el estado del pedido.
drop policy if exists store_orders_admin on public.store_orders;
create policy store_orders_admin on public.store_orders
  for update using (studio_id = auth_studio_id() and auth_role() = 'STUDIO_ADMIN')
  with check (studio_id = auth_studio_id() and auth_role() = 'STUDIO_ADMIN');
