import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../lib/store';
import { PageHeader, Card, Badge, Button, StatCard, EmptyState } from '../../components/ui';
import ImageUpload from '../../components/ImageUpload';
import { usd } from '../../lib/format';
import { fetchProducts, fetchSales, saveProduct, deleteProduct, sellProduct } from '../../lib/products';
import type { Product, ProductSale, PaymentMethod, User } from '../../lib/types';

const METHOD_LABEL: Record<string, string> = {
  cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', paypal: 'PayPal',
};

type Draft = {
  id?: string; name: string; description: string; priceUsd: number;
  stock: number; lowStock: number; photoUrl?: string; active: boolean;
};

const emptyDraft = (): Draft => ({ name: '', description: '', priceUsd: 0, stock: 0, lowStock: 3, active: true });

// Punto de venta (POS) + inventario · Fase 1.
export default function StoreAdmin() {
  const { currentStudio, studioUsers } = useStore();
  const studioId = currentStudio!.id;
  const students = studioUsers('STUDENT');

  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<ProductSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sellFor, setSellFor] = useState<Product | null>(null);
  const [toast, setToast] = useState('');

  const load = () => {
    setLoading(true);
    void Promise.all([fetchProducts(studioId), fetchSales(studioId)]).then(([p, s]) => {
      setProducts(p);
      setSales(s);
      setLoading(false);
    });
  };
  useEffect(load, [studioId]);

  const lowStock = useMemo(() => products.filter((p) => p.active && p.stock <= p.lowStock), [products]);
  const todayIncome = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    return sales.filter((s) => new Date(s.soldAt) >= start).reduce((a, s) => a + s.total, 0);
  }, [sales]);
  const inventoryValue = useMemo(
    () => products.reduce((a, p) => a + p.priceUsd * p.stock, 0),
    [products],
  );

  const saveDraft = async () => {
    if (!draft || !draft.name.trim()) return;
    await saveProduct({ ...draft, studioId, name: draft.name.trim() });
    setDraft(null);
    load();
  };

  const confirmSell = async (product: Product, qty: number, userId: string | undefined, method: string) => {
    const res = await sellProduct(product.id, qty, userId, method);
    if (res.ok) {
      setToast(`Venta registrada: ${qty}× ${res.name} · ${usd(res.total ?? 0)}`);
      setSellFor(null);
      load();
      setTimeout(() => setToast(''), 3500);
    } else {
      setToast(res.error === 'stock insuficiente' ? 'No hay stock suficiente.' : `No se pudo vender: ${res.error ?? 'error'}`);
      setTimeout(() => setToast(''), 3500);
    }
  };

  return (
    <>
      <PageHeader
        title="Tienda / Punto de venta"
        subtitle="Vende productos y controla tu inventario"
        action={<Button onClick={() => setDraft(emptyDraft())}>+ Nuevo producto</Button>}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Productos" value={products.length} icon="❏" />
        <StatCard label="Ventas de hoy" value={usd(todayIncome)} icon="$" />
        <StatCard label="Valor de inventario" value={usd(inventoryValue)} icon="▦" />
        <StatCard label="Stock bajo" value={lowStock.length} icon="⚠" />
      </div>

      {lowStock.length > 0 && (
        <Card className="mb-6 border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800">⚠ Stock bajo</p>
          <p className="mt-1 text-sm text-amber-700">
            {lowStock.map((p) => `${p.name} (${p.stock})`).join(' · ')}
          </p>
        </Card>
      )}

      {loading ? (
        <p className="text-sm text-ink-faint">Cargando…</p>
      ) : products.length === 0 ? (
        <EmptyState>
          Aún no tienes productos. Usa <b>“+ Nuevo producto”</b> para agregar lo que vendes en mostrador
          (agua, proteína, ropa, etc.).
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => {
            const low = p.stock <= p.lowStock;
            return (
              <Card key={p.id} className="overflow-hidden p-0">
                {p.photoUrl ? (
                  <img src={p.photoUrl} alt="" className="h-36 w-full object-cover" />
                ) : (
                  <div className="grid h-36 w-full place-items-center bg-cream-dark/40 text-4xl">🛍️</div>
                )}
                <div className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-ink">{p.name}</h3>
                      {p.description && <p className="text-xs text-ink-faint">{p.description}</p>}
                    </div>
                    {!p.active && <Badge tone="neutral">Inactivo</Badge>}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-black text-ink">{usd(p.priceUsd)}</span>
                    <Badge tone={low ? 'warning' : 'success'}>{p.stock} en stock</Badge>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button className="flex-1" disabled={p.stock < 1 || !p.active} onClick={() => setSellFor(p)}>Vender</Button>
                    <Button variant="secondary" onClick={() => setDraft({
                      id: p.id, name: p.name, description: p.description ?? '', priceUsd: p.priceUsd,
                      stock: p.stock, lowStock: p.lowStock, photoUrl: p.photoUrl, active: p.active,
                    })}>Editar</Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Ventas recientes */}
      {sales.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 font-semibold text-ink">Ventas recientes</h2>
          <Card className="divide-y divide-cream-dark">
            {sales.slice(0, 15).map((s) => {
              const buyer = s.userId ? students.find((u) => u.id === s.userId)?.fullName : null;
              return (
                <div key={s.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <div>
                    <p className="text-ink">{s.qty}× {s.productName}</p>
                    <p className="text-xs text-ink-faint">
                      {new Date(s.soldAt).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      {' · '}{METHOD_LABEL[s.method] ?? s.method}{buyer ? ` · ${buyer}` : ' · mostrador'}
                    </p>
                  </div>
                  <span className="font-semibold text-brand">{usd(s.total)}</span>
                </div>
              );
            })}
          </Card>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      {draft && (
        <ProductModal
          draft={draft}
          setDraft={setDraft}
          onClose={() => setDraft(null)}
          onSave={saveDraft}
          onDelete={draft.id ? async () => { await deleteProduct(draft.id!); setDraft(null); load(); } : undefined}
        />
      )}

      {sellFor && (
        <SellModal product={sellFor} students={students} onClose={() => setSellFor(null)} onConfirm={confirmSell} />
      )}

      <style>{`.input{width:100%;border:1px solid #E8E3D6;border-radius:.75rem;padding:.6rem .8rem;background:#fff;outline:none}.input:focus{box-shadow:0 0 0 2px var(--brand-primary)}`}</style>
    </>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <Card className="w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <div onClick={(e) => e.stopPropagation()}>{children}</div>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

function ProductModal({
  draft, setDraft, onClose, onSave, onDelete,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete?: () => void;
}) {
  return (
    <Modal onClose={onClose}>
      <h2 className="mb-4 text-lg font-bold text-ink">{draft.id ? 'Editar producto' : 'Nuevo producto'}</h2>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          {draft.photoUrl ? (
            <img src={draft.photoUrl} alt="" className="h-16 w-16 rounded-xl object-cover" />
          ) : (
            <div className="grid h-16 w-16 place-items-center rounded-xl bg-cream-dark/40 text-2xl">🛍️</div>
          )}
          <ImageUpload label="Subir foto" onSelect={(url) => setDraft({ ...draft, photoUrl: url })} />
          {draft.photoUrl && <button type="button" onClick={() => setDraft({ ...draft, photoUrl: undefined })} className="text-sm text-red-600">Quitar</button>}
        </div>
        <Field label="Nombre"><input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
        <Field label="Descripción (opcional)"><input className="input" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Precio"><input type="number" min="0" step="0.01" className="input" value={draft.priceUsd} onChange={(e) => setDraft({ ...draft, priceUsd: Math.max(0, Number(e.target.value) || 0) })} /></Field>
          <Field label="Stock"><input type="number" min="0" step="1" className="input" value={draft.stock} onChange={(e) => setDraft({ ...draft, stock: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} /></Field>
          <Field label="Alerta ≤"><input type="number" min="0" step="1" className="input" value={draft.lowStock} onChange={(e) => setDraft({ ...draft, lowStock: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
          Producto activo (disponible para vender)
        </label>
      </div>
      <div className="mt-6 flex items-center justify-between">
        {onDelete ? <Button variant="ghost" onClick={onDelete}>Eliminar</Button> : <span />}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button disabled={!draft.name.trim()} onClick={onSave}>Guardar</Button>
        </div>
      </div>
    </Modal>
  );
}

function SellModal({
  product, students, onClose, onConfirm,
}: {
  product: Product;
  students: User[];
  onClose: () => void;
  onConfirm: (product: Product, qty: number, userId: string | undefined, method: string) => void;
}) {
  const [qty, setQty] = useState(1);
  const [userId, setUserId] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const q = Math.min(product.stock, Math.max(1, qty));

  return (
    <Modal onClose={onClose}>
      <h2 className="mb-1 text-lg font-bold text-ink">Vender · {product.name}</h2>
      <p className="mb-4 text-sm text-ink-faint">{usd(product.priceUsd)} c/u · {product.stock} en stock</p>
      <div className="space-y-4">
        <Field label="Cantidad">
          <input type="number" min="1" max={product.stock} className="input" value={qty} onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))} />
        </Field>
        <Field label="Alumno (opcional — vacío = venta de mostrador)">
          <select className="input" value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">— Venta de mostrador —</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
          </select>
        </Field>
        <Field label="Forma de pago">
          <div className="flex flex-wrap gap-2">
            {(['cash', 'card', 'transfer', 'paypal'] as PaymentMethod[]).map((m) => (
              <button key={m} onClick={() => setMethod(m)} className={`rounded-full border px-3 py-1.5 text-sm transition ${method === m ? 'border-brand bg-brand text-cream' : 'border-cream-dark bg-white text-ink-soft'}`}>
                {METHOD_LABEL[m]}
              </button>
            ))}
          </div>
        </Field>
      </div>
      <div className="mt-6 flex items-center justify-between">
        <span className="text-lg font-bold text-brand">{usd(product.priceUsd * q)}</span>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onConfirm(product, q, userId || undefined, method)}>Registrar venta</Button>
        </div>
      </div>
    </Modal>
  );
}
