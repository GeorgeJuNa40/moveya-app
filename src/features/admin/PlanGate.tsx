import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../../lib/store';
import { PLAN_CAPABILITIES, type PlanCapability } from '../../lib/plans';
import { Card, Button } from '../../components/ui';

// Nombre del plan mínimo que incluye cada capacidad (para el mensaje de mejora).
function minPlanFor(cap: PlanCapability): 'Pro' | 'Premium' {
  if (PLAN_CAPABILITIES.pro.includes(cap)) return 'Pro';
  return 'Premium';
}

const CAP_LABEL: Record<PlanCapability, string> = {
  whitelabel: 'White label (marca y colores propios)',
  rewards: 'Gamificación y recompensas',
  services: 'Servicios opcionales',
  reports: 'Reportes de ingresos y asistencia',
  reportsAdvanced: 'Reportes avanzados',
  whatsapp: 'Agente de WhatsApp con IA',
  multiBranch: 'Multi-sucursal',
  publicInfo: 'Página pública informativa',
};

// Bloquea una sección si el plan del estudio NO incluye la capacidad indicada,
// mostrando un aviso para mejorar de plan. Si la incluye, muestra el contenido.
export default function PlanGate({
  capability,
  children,
}: {
  capability: PlanCapability;
  children: ReactNode;
}) {
  const { can } = useStore();
  if (can(capability)) return <>{children}</>;

  const need = minPlanFor(capability);

  return (
    <div className="grid min-h-[60vh] place-items-center">
      <Card className="max-w-md p-8 text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-amber-100 text-2xl">
          ✦
        </div>
        <h2 className="text-xl font-bold text-ink">Función del plan {need}</h2>
        <p className="mt-2 text-ink-soft">
          <strong>{CAP_LABEL[capability]}</strong> está disponible a partir del plan{' '}
          <strong>{need}</strong>. Mejora tu plan para activarla.
        </p>
        <Link to="/admin/subscription" className="mt-6 inline-block">
          <Button>Ver planes</Button>
        </Link>
      </Card>
    </div>
  );
}
