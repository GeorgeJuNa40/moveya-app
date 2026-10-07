import { useEffect, useState } from 'react';
import { Card, Button, Badge } from '../../components/ui';
import { useStore } from '../../lib/store';
import { getMpConnectStatus, startMpOnboarding, disconnectMp } from '../../lib/payments';
import { notifySuccess } from '../../lib/notify';

// Tarjeta para que el estudio conecte su propia cuenta de Mercado Pago y reciba
// los pagos de sus alumnos directo en su cuenta de MP (la app no toca ese
// dinero; solo cobra su comisión vía marketplace_fee). Espejo de StripeConnectCard.
export default function MpConnectCard() {
  const { currentStudio } = useStore();
  const [connected, setConnected] = useState<boolean>(Boolean(currentStudio?.mpConnected));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Confirmamos con el servidor (por si cambió en otra sesión).
    getMpConnectStatus().then((s) => setConnected(s.connected));
  }, []);

  const connect = async () => {
    setBusy(true);
    const ok = await startMpOnboarding();
    if (!ok) setBusy(false); // si funciona, redirige a Mercado Pago
  };

  const refresh = async () => {
    setBusy(true);
    const s = await getMpConnectStatus();
    setConnected(s.connected);
    setBusy(false);
  };

  const disconnect = async () => {
    if (!confirm('¿Desconectar tu cuenta de Mercado Pago? Tus alumnos ya no podrán pagarte con MP.')) return;
    setBusy(true);
    const ok = await disconnectMp();
    if (ok) {
      setConnected(false);
      notifySuccess('Mercado Pago desconectado.');
    }
    setBusy(false);
  };

  return (
    <Card className="mb-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase text-ink-faint">Cobros con Mercado Pago</p>
          <h2 className="text-lg font-bold text-ink">Recibe pagos con Mercado Pago</h2>
        </div>
        {connected ? <Badge tone="success">Conectado</Badge> : <Badge tone="neutral">Sin conectar</Badge>}
      </div>

      {connected ? (
        <>
          <p className="mt-3 text-sm text-ink-soft">
            ✓ Tu cuenta de Mercado Pago está conectada. Los pagos de tus alumnos con MP llegan{' '}
            <strong>directo a tu cuenta</strong>. Move yA no gestiona ese dinero.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="ghost" disabled={busy} onClick={refresh}>
              Actualizar estado
            </Button>
            <button
              onClick={disconnect}
              disabled={busy}
              className="text-sm font-medium text-red-600 hover:underline disabled:opacity-60"
            >
              Desconectar
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-3 text-sm text-ink-soft">
            Conecta tu propia cuenta de Mercado Pago para que tus alumnos paguen en pesos (MXN). El
            dinero llega <strong>directo a tu cuenta de MP</strong>; tú autorizas el acceso una sola vez.
          </p>
          <div className="mt-4">
            <Button disabled={busy} onClick={connect}>
              {busy ? 'Abriendo…' : 'Conectar Mercado Pago'}
            </Button>
          </div>
        </>
      )}

      <p className="mt-4 text-xs text-ink-faint">
        🔒 La conexión la maneja Mercado Pago de forma segura (OAuth). Es opcional: puedes ofrecer
        Stripe, Mercado Pago, o ambos — tus alumnos eligen con cuál pagar.
      </p>
    </Card>
  );
}
