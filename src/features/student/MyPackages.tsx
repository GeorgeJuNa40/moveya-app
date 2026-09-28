import { useState } from 'react';
import { useStore } from '../../lib/store';
import { PageHeader, Card, Badge, Button } from '../../components/ui';
import { usd, daysUntil } from '../../lib/format';
import { startStripeCheckout } from '../../lib/payments';

// Alumno: paquetes activos + catálogo. La compra se hace en la página segura de
// Stripe (la app nunca recibe datos de tarjeta). El paquete se activa solo
// cuando Stripe confirma el pago (vía webhook).
export default function MyPackages() {
  const { db, currentUser, currentStudio, pendingPenalty } = useStore();
  const uid = currentUser!.id;
  const penalty = pendingPenalty(uid); // adeudo por no asistir (si el estudio lo cobra)
  // Muestra los paquetes vigentes y los que vencieron hace máximo 1 día; los
  // más viejos se ocultan de la vista del alumno para no acumular tarjetas
  // (el historial se conserva en la base para los reportes del estudio).
  const GRACE_MS = 24 * 60 * 60 * 1000;
  const myPackages = db.userPackages
    .filter((p) => p.userId === uid)
    .filter((p) => new Date(p.expiresAt).getTime() > Date.now() - GRACE_MS)
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  const catalog = db.packages.filter((p) => p.studioId === currentStudio!.id && p.active);
  const [buying, setBuying] = useState<string | null>(null);
  const studioType = currentStudio!.studioType ?? 'studio';
  const isGym = studioType === 'gym';

  const buy = async (packageId: string) => {
    setBuying(packageId);
    const ok = await startStripeCheckout({ kind: 'package', packageId });
    if (!ok) setBuying(null); // si falla, reactiva el botón (si funciona, ya redirige)
  };

  return (
    <>
      <PageHeader
        title={isGym ? 'Mi membresía' : 'Mis Paquetes'}
        subtitle={isGym ? 'Tu membresía activa y el catálogo del estudio' : 'Tus paquetes activos y el catálogo del estudio'}
      />

      {penalty > 0 && (
        <Card className="mb-6 p-4 border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-800">
            ⚠️ Tienes un <strong>cargo pendiente de {usd(penalty)}</strong> por reservar y no asistir sin cancelar a tiempo.
            Cúbrelo en tu estudio para seguir al día.
          </p>
        </Card>
      )}

      <h2 className="mb-3 font-semibold text-ink">Activos</h2>
      {myPackages.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-cream-dark p-8 text-center text-ink-faint mb-8">Aún no has comprado paquetes.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 mb-8">
          {myPackages.map((up) => {
            const pkg = db.packages.find((p) => p.id === up.packageId)!;
            const expired = daysUntil(up.expiresAt) <= 0;
            const daysLeft = Math.max(0, daysUntil(up.expiresAt));
            // Membresía de acceso libre: se muestra por vigencia, sin créditos.
            if (up.kind === 'access') {
              return (
                <Card key={up.id} className="p-5">
                  <div className="flex items-start justify-between">
                    <h3 className="font-semibold text-ink">{pkg?.name ?? 'Membresía'}</h3>
                    <Badge tone={expired ? 'danger' : 'success'}>{expired ? 'Vencida' : 'Activa'}</Badge>
                  </div>
                  <p className="mt-3 text-sm text-brand font-medium">🔓 Acceso libre</p>
                  <p className="mt-1 text-sm text-ink-faint">
                    {expired ? 'Tu membresía venció. Renueva para seguir entrando.' : `Vence en ${daysLeft} día(s).`}
                  </p>
                </Card>
              );
            }
            const left = Math.max(0, up.creditsTotal - up.creditsUsed);
            const pct = up.creditsTotal > 0
              ? Math.min(100, Math.max(0, (up.creditsUsed / up.creditsTotal) * 100))
              : 0;
            return (
              <Card key={up.id} className="p-5">
                <div className="flex items-start justify-between">
                  <h3 className="font-semibold text-ink">{pkg.name}</h3>
                  <Badge tone={expired ? 'danger' : left > 0 ? 'success' : 'warning'}>{expired ? 'Vencido' : `${left} clases`}</Badge>
                </div>
                <div className="mt-3 h-2.5 rounded-full bg-cream-dark overflow-hidden">
                  <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-2 flex justify-between text-sm text-ink-faint">
                  <span>{up.creditsUsed}/{up.creditsTotal} usadas</span>
                  <span>Vence en {daysLeft} días</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <h2 className="mb-3 font-semibold text-ink">Catálogo del estudio</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {catalog.map((p) => (
          <Card key={p.id} className="p-5 flex flex-col">
            <h3 className="font-semibold text-ink">{p.name}</h3>
            <p className="text-sm text-ink-faint mt-1 flex-1">{p.description}</p>
            <div className="mt-4 flex items-end gap-1"><span className="text-2xl font-black text-brand">{usd(p.priceUsd)}</span></div>
            <p className="text-sm text-ink-faint">
              {p.kind === 'access' ? `🔓 Acceso libre · vigencia ${p.validityDays} días` : `${p.classCredits} clases · vigencia ${p.validityDays} días`}
            </p>
            <Button className="mt-4" disabled={!!buying} onClick={() => buy(p.id)}>
              {buying === p.id ? 'Redirigiendo…' : 'Comprar'}
            </Button>
          </Card>
        ))}
      </div>

      <p className="mt-4 text-xs text-ink-faint">
        🔒 El pago se procesa en la página segura de Stripe. No capturamos datos de tu tarjeta.
      </p>
    </>
  );
}
