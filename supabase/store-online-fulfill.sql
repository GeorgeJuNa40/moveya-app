-- ============================================================================
-- Move yA — Entrega de pedidos de tienda pagados EN LÍNEA (Stripe / Mercado Pago)
-- ----------------------------------------------------------------------------
-- Antes, al pagar productos en línea, el webhook solo marcaba el pedido como
-- "entregado" e insertaba el pago, pero NO descontaba stock ni registraba la
-- venta en product_sales (el inventario quedaba mal y un producto podía
-- sobre-venderse). Esta RPC centraliza la entrega en línea de forma ATÓMICA e
-- IDEMPOTENTE, igual que pos_sell hace para el mostrador:
--   1) marca el pedido como entregado/pagado,
--   2) descuenta stock de cada producto (piso en 0, no deja negativos),
--   3) registra cada renglón en product_sales (sold_by = 'online').
--
-- La llaman SOLO los webhooks (service role). Se revoca a public/anon.
-- Idempotente: si el pedido ya está 'fulfilled', no repite nada.
--
-- Deploy: pégalo en Supabase → SQL Editor. Es aditivo y seguro.
-- ============================================================================

create or replace function public.fulfill_store_order(
  p_order_id text,
  p_provider text,
  p_paid_ref text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.store_orders;
  v_item  jsonb;
  v_pid   text;
  v_qty   int;
  v_price numeric;
  v_name  text;
begin
  -- Bloquea el pedido para evitar carreras (doble entrega).
  select * into v_order from public.store_orders where id = p_order_id for update;
  if not found then
    return json_build_object('ok', false, 'error', 'order not found');
  end if;

  -- Idempotencia: si ya se entregó, no vuelvas a descontar stock ni duplicar ventas.
  if v_order.status = 'fulfilled' then
    return json_build_object('ok', true, 'already', true);
  end if;

  -- 1) Marca entregado / pagado.
  update public.store_orders
     set status       = 'fulfilled',
         provider     = p_provider,
         paid_ref     = p_paid_ref,
         fulfilled_at = now()
   where id = v_order.id;

  -- 2) + 3) Descuenta stock y registra cada venta.
  for v_item in
    select * from jsonb_array_elements(coalesce(v_order.items, '[]'::jsonb))
  loop
    v_pid   := v_item->>'productId';
    v_qty   := coalesce((v_item->>'qty')::int, 1);
    v_price := coalesce((v_item->>'unitPrice')::numeric, 0);
    v_name  := coalesce(v_item->>'name', 'Producto');

    if v_pid is not null then
      update public.products
         set stock = greatest(stock - v_qty, 0)
       where id = v_pid and studio_id = v_order.studio_id;
    end if;

    insert into public.product_sales(
      id, studio_id, product_id, product_name, user_id,
      qty, unit_price, total, method, sold_by
    )
    values (
      (gen_random_uuid())::text, v_order.studio_id, v_pid, v_name, v_order.user_id,
      v_qty, v_price, v_price * v_qty, 'card', 'online'
    );
  end loop;

  return json_build_object('ok', true);
end;
$$;

-- Solo los webhooks (service role) la ejecutan. Nadie más: si 'authenticated'
-- pudiera llamarla, un alumno marcaría su pedido como pagado SIN pagar.
revoke execute on function public.fulfill_store_order(text, text, text) from public, anon, authenticated;
grant  execute on function public.fulfill_store_order(text, text, text) to service_role;
