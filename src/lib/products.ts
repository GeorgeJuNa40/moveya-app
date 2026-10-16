// ============================================================================
// Move yA — Punto de venta (POS) + inventario · capa de datos
// ----------------------------------------------------------------------------
// Productos físicos del estudio/gym y sus ventas. La venta va por el RPC
// pos_sell (atómico: valida stock, descuenta y registra). Admin-facing.
// ============================================================================
import { supabase } from './supabase';
import type { Product, ProductSale, StoreOrder, StoreOrderItem } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapProduct = (r: any): Product => ({
  id: r.id,
  studioId: r.studio_id,
  name: r.name,
  description: r.description ?? '',
  priceUsd: Number(r.price_usd ?? 0),
  stock: Number(r.stock ?? 0),
  lowStock: Number(r.low_stock ?? 3),
  photoUrl: r.photo_url ?? undefined,
  active: r.active ?? true,
  createdAt: r.created_at,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapSale = (r: any): ProductSale => ({
  id: r.id,
  studioId: r.studio_id,
  productId: r.product_id ?? undefined,
  productName: r.product_name,
  userId: r.user_id ?? undefined,
  qty: Number(r.qty ?? 1),
  unitPrice: Number(r.unit_price ?? 0),
  total: Number(r.total ?? 0),
  method: r.method ?? 'cash',
  soldBy: r.sold_by ?? undefined,
  soldAt: r.sold_at,
});

export async function fetchProducts(studioId: string): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('studio_id', studioId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []).map(mapProduct);
}

export async function fetchSales(studioId: string): Promise<ProductSale[]> {
  const { data, error } = await supabase
    .from('product_sales')
    .select('*')
    .eq('studio_id', studioId)
    .order('sold_at', { ascending: false })
    .limit(200);
  if (error) return [];
  return (data ?? []).map(mapSale);
}

export async function saveProduct(p: {
  id?: string;
  studioId: string;
  name: string;
  description?: string;
  priceUsd: number;
  stock: number;
  lowStock: number;
  photoUrl?: string;
  active?: boolean;
}): Promise<void> {
  const row = {
    studio_id: p.studioId,
    name: p.name,
    description: p.description ?? '',
    price_usd: p.priceUsd,
    stock: p.stock,
    low_stock: p.lowStock,
    photo_url: p.photoUrl ?? null,
    active: p.active ?? true,
  };
  if (p.id) {
    await supabase.from('products').update(row).eq('id', p.id);
  } else {
    await supabase.from('products').insert(row);
  }
}

export async function deleteProduct(id: string): Promise<void> {
  await supabase.from('products').delete().eq('id', id);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapOrder = (r: any): StoreOrder => ({
  id: r.id,
  studioId: r.studio_id,
  userId: r.user_id,
  userName: r.user_name ?? undefined,
  items: (r.items ?? []) as StoreOrderItem[],
  total: Number(r.total ?? 0),
  status: (r.status ?? 'pending') as StoreOrder['status'],
  note: r.note ?? undefined,
  createdAt: r.created_at,
  fulfilledAt: r.fulfilled_at ?? undefined,
});

// El miembro crea un pedido (carrito). status:
//  - 'pending' (def.): lo "aparta" y lo cobra el estudio en mostrador.
//  - 'awaiting_payment': va a pagar en línea; el webhook lo marca 'fulfilled'.
// Devuelve el id del pedido creado (para iniciar el pago en línea).
export async function createStoreOrder(input: {
  studioId: string;
  userId: string;
  userName?: string;
  items: StoreOrderItem[];
  note?: string;
  status?: 'pending' | 'awaiting_payment';
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const total = input.items.reduce((a, it) => a + it.unitPrice * it.qty, 0);
  const { data, error } = await supabase
    .from('store_orders')
    .insert({
      studio_id: input.studioId,
      user_id: input.userId,
      user_name: input.userName ?? null,
      items: input.items,
      total,
      note: input.note ?? null,
      status: input.status ?? 'pending',
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data?.id as string | undefined };
}

export async function fetchStoreOrders(studioId: string, onlyUser?: string): Promise<StoreOrder[]> {
  let q = supabase.from('store_orders').select('*').eq('studio_id', studioId);
  if (onlyUser) q = q.eq('user_id', onlyUser);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(200);
  if (error) return [];
  return (data ?? []).map(mapOrder);
}

export async function updateOrderStatus(
  id: string,
  status: StoreOrder['status'],
): Promise<void> {
  await supabase
    .from('store_orders')
    .update({ status, fulfilled_at: status === 'fulfilled' ? new Date().toISOString() : null })
    .eq('id', id);
}

// Registra una venta: descuenta stock y guarda el movimiento (RPC atómico).
export async function sellProduct(
  productId: string,
  qty: number,
  userId?: string,
  method = 'cash',
): Promise<{ ok: boolean; total?: number; stockLeft?: number; name?: string; error?: string }> {
  const { data, error } = await supabase.rpc('pos_sell', {
    p_product_id: productId,
    p_qty: qty,
    p_user_id: userId ?? null,
    p_method: method,
  });
  if (error) return { ok: false, error: error.message };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = (data ?? {}) as any;
  return { ok: !!d.ok, total: d.total, stockLeft: d.stock_left, name: d.name };
}
