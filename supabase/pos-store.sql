-- ============================================================================
-- Move yA — Punto de venta (POS) + inventario de productos físicos · Fase 1
-- ----------------------------------------------------------------------------
-- Catálogo de productos con stock y la venta que descuenta inventario. La venta
-- se hace por un RPC SECURITY DEFINER (pos_sell) para que sea atómica y segura.
-- Admin del estudio gestiona; no requiere acceso del alumno.
-- ============================================================================

create table if not exists public.products (
  id text primary key default (gen_random_uuid())::text,
  studio_id text not null references public.studios(id) on delete cascade,
  name text not null,
  description text default '',
  price_usd numeric not null default 0,
  stock int not null default 0,
  low_stock int not null default 3,   -- umbral de alerta de stock bajo
  photo_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.product_sales (
  id text primary key default (gen_random_uuid())::text,
  studio_id text not null references public.studios(id) on delete cascade,
  product_id text references public.products(id) on delete set null,
  product_name text not null,         -- snapshot por si se borra el producto
  user_id text,                       -- alumno (opcional; null = venta de mostrador)
  qty int not null default 1,
  unit_price numeric not null default 0,
  total numeric not null default 0,
  method text not null default 'cash',
  sold_by text,
  sold_at timestamptz not null default now()
);

alter table public.products enable row level security;
alter table public.product_sales enable row level security;

create policy products_read  on public.products      for select using (studio_id = auth_studio_id());
create policy products_admin on public.products      for all    using (studio_id = auth_studio_id() and auth_role() = 'STUDIO_ADMIN') with check (studio_id = auth_studio_id() and auth_role() = 'STUDIO_ADMIN');
create policy product_sales_read  on public.product_sales for select using (studio_id = auth_studio_id());
create policy product_sales_admin on public.product_sales for all    using (studio_id = auth_studio_id() and auth_role() = 'STUDIO_ADMIN') with check (studio_id = auth_studio_id() and auth_role() = 'STUDIO_ADMIN');

-- Venta atómica: valida stock, descuenta y registra la venta.
create or replace function public.pos_sell(p_product_id text, p_qty int, p_user_id text default null, p_method text default 'cash')
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prod public.products;
  v_sid text := auth_studio_id();
  v_total numeric;
  v_sale_id text;
begin
  if auth_role() <> 'STUDIO_ADMIN' then
    raise exception 'no autorizado';
  end if;
  if p_qty is null or p_qty < 1 then
    raise exception 'cantidad inválida';
  end if;
  select * into v_prod from public.products where id = p_product_id and studio_id = v_sid for update;
  if not found then
    raise exception 'producto no encontrado';
  end if;
  if v_prod.stock < p_qty then
    raise exception 'stock insuficiente';
  end if;
  v_total := v_prod.price_usd * p_qty;
  update public.products set stock = stock - p_qty where id = p_product_id;
  v_sale_id := (gen_random_uuid())::text;
  insert into public.product_sales(id, studio_id, product_id, product_name, user_id, qty, unit_price, total, method, sold_by)
  values (v_sale_id, v_sid, v_prod.id, v_prod.name, p_user_id, p_qty, v_prod.price_usd, v_total, p_method, auth.uid()::text);
  return json_build_object('ok', true, 'sale_id', v_sale_id, 'total', v_total, 'stock_left', v_prod.stock - p_qty, 'name', v_prod.name);
end;
$$;
