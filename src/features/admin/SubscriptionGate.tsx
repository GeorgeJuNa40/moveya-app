import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useStore, isSubscriptionActive } from '../../lib/store';

// Verificación de pago (pagar-primero): si la suscripción del estudio NO está
// vigente, lo mandamos directo a la pantalla de Suscripción para que pague. Así
// no hay acceso a ninguna función hasta confirmar el pago en la pasarela.
// La ruta de Suscripción se monta con allow=true (nunca se bloquea a sí misma).
export default function SubscriptionGate({
  children,
  allow = false,
}: {
  children: ReactNode;
  allow?: boolean;
}) {
  const { currentStudio } = useStore();
  const active = isSubscriptionActive(currentStudio);

  if (active || allow) return <>{children}</>;

  return <Navigate to="/admin/subscription" replace />;
}
