import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../lib/store';
import { PageHeader, Card, Badge, Button } from '../../components/ui';
import { usd } from '../../lib/format';
import { fmtDay } from '../../lib/format';
import { fetchProducts, fetchStoreOrders, createStoreOrder } from '../../lib/products';
import { notifySuccess, notifyError } from '../../lib/notify';
import type { Product, StoreOrder } from '../../lib/types';

// Tienda para alumnos y coaches (Fase A: apartar / pedir).
// El miembro arma su carrito y "aparta" el pedido; al estudio le llega en su
// vista de Pedidos, lo cobra en mostrador y lo marca entregado. El pago en línea
// de productos llega en la Fase B.
export default function Store() {
  const { currentStudio, currentUser } = useStore();
  const studioId = currentStudio!.id;
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [sending, setSending] = useState(false);

  const load = async () => {
    const [prods, ords] = await Promise.all([
      fetchProducts(studioId),
      fetchStoreOrders(studioId, currentUser!.id),
    ]);
    setProducts(prods.filter((p) => p.active));
    setOrders(ords);
    setLoading(false);
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studioId]);

  const inStock = (p: Product) => p.stock - (cart[p.id] ?? 0);
  const add = (p: Product) => {
    if (inStock(p) <= 0) return;
    setCart((c) => ({ ...c, [p.id]: (c[p.id] ?? 0) + 1 }));
  };
  const sub = (p: Product) =>
    setCart((c) => {
      const q = (c[p.id] ?? 0) - 1;
      const next = { ...c };
      if (q <= 0) delete next[p.id];
      else next[p.id] = q;
      return next;
    });

  const items = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, qty]) => {
          const p = products.find((x) => x.id === id);
          return p ? { productId: id, name: p.name, qty, unitPrice: p.priceUsd } : null;
        })
        .filter((x): x is NonNullable<typeof x> => !!x),
    [cart, products],
  );
  const total = items.reduce((a, it) => a + it.unitPrice * it.qty, 0);
  const count = items.reduce((a, it) => a + it.qty, 0);

  const apartar = async () => {
    if (!items.length || sending) return;
    setSending(true);
    const res = await createStoreOrder({
      studioId,
      userId: currentUser!.id,
      userName: currentUser!.fullName,
      items,
    });
    setSending(false);
    if (!res.ok) {
      notifyError('apartar', res.error ?? 'No se pudo apartar el pedido.');
      return;
    }
    notifySuccess('¡Pedido apartado! Pásalo a recoger y pagar en recepción. 💚');
    setCart({});
    void load();
  };

  const statusMeta: Record<StoreOrder['status'], { label: string; tone: 'success' | 'warning' | 'neutral' }> = {
    pending: { label: 'Apartado', tone: 'warning' },
    fulfilled: { label: 'Entregado', tone: 'success' },
    canceled: { label: 'Cancelado', tone: 'neutral' },
  };

  return (
    <>
      <PageHeader title="Tienda" subtitle="Aparta tus productos y págalos en recepción" />

      {loading ? (
        <p className="text-ink-faint">Cargando…</p>
      ) : products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-cream-dark p-8 text-center text-ink-faint">
          Aún no hay productos en la tienda.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {products.map((p) => {
            const qty = cart[p.id] ?? 0;
            const left = inStock(p);
            return (
              <Card key={p.id} className="flex flex-col p-5">
                {p.photoUrl && (
                  <img src={p.photoUrl} alt="" className="mb-3 h-36 w-full rounded-xl object-cover" />
                )}
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-ink">{p.name}</h3>
                  {p.stock <= 0 && <Badge tone="neutral">Agotado</Badge>}
                </div>
                {p.description && <p className="mt-1 flex-1 text-sm text-ink-faint">{p.description}</p>}
                <p className="mt-3 text-2xl font-black text-brand">{usd(p.priceUsd)}</p>
                {qty === 0 ? (
                  <Button className="mt-3" disabled={p.stock <= 0} onClick={() => add(p)}>
                    {p.stock <= 0 ? 'Agotado' : 'Agregar'}
                  </Button>
                ) : (
                  <div className="mt-3 flex items-center justify-between rounded-full border border-cream-dark px-2 py-1">
                    <button onClick={() => sub(p)} className="grid h-8 w-8 place-items-center rounded-full text-lg text-brand">−</button>
                    <span className="font-semibold text-ink">{qty}</span>
                    <button onClick={() => add(p)} disabled={left <= 0} className="grid h-8 w-8 place-items-center rounded-full text-lg text-brand disabled:opacity-40">+</button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Mis pedidos */}
      {orders.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 font-semibold text-ink">Mis pedidos</h2>
          <div className="space-y-2">
            {orders.map((o) => (
              <Card key={o.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{o.items.map((it) => `${it.qty}× ${it.name}`).join(', ')}</p>
                  <p className="text-xs text-ink-faint">{fmtDay(o.createdAt)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <Badge tone={statusMeta[o.status].tone}>{statusMeta[o.status].label}</Badge>
                  <p className="mt-1 text-sm font-semibold text-brand">{usd(o.total)}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Barra de carrito fija */}
      {count > 0 && (
        <div className="fixed inset-x-0 bottom-20 z-30 px-4 sm:bottom-6">
          <div className="mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-3 text-cream shadow-zen">
            <span className="text-sm">{count} artículo(s) · <strong>{usd(total)}</strong></span>
            <Button variant="secondary" disabled={sending} onClick={apartar}>
              {sending ? 'Apartando…' : 'Apartar pedido'}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
