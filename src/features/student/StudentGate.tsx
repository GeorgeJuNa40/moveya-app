import { Navigate } from 'react-router-dom';
import { useStore } from '../../lib/store';

// Candado "pagar antes de usar" para el alumno/cliente.
// ----------------------------------------------------------------------------
// Al registrarse, el alumno SÍ entra a su panel (Dashboard) y a Paquetes/
// Membresías, pero NO puede reservar clase ni usar el resto de la app hasta que
// adquiera un plan/membresía activo. En cuanto tiene uno vigente, se desbloquea
// todo. Aplica a estudio, gimnasio y mixto.
//
// Dashboard (/app) y Paquetes (/app/packages) NO usan este candado: son la
// puerta de entrada para que el alumno vea su estado y compre su plan.
// Los miembros que YA existían al activar este candado conservan su acceso
// (no los bloqueamos de golpe). El candado aplica solo a quienes se registran
// desde esta fecha en adelante — que es justo la intención: "al registrarse un
// alumno nuevo, mándalo a adquirir su plan".
const GATE_SINCE = Date.parse('2026-10-17T06:00:00Z'); // 17-oct-2026, 00:00 CDMX

export default function StudentGate({ children }: { children: React.ReactNode }) {
  const { currentUser, currentStudio, membership } = useStore();
  if (!currentUser) return <Navigate to="/" replace />;
  // Por default respetamos a los miembros que ya existían (solo se exige plan a
  // los nuevos). Si el estudio activa "exigir plan a todos", el candado aplica a
  // TODOS sus miembros sin importar cuándo se registraron.
  const enforceAll = currentStudio?.branding.requirePlanAll === true;
  if (!enforceAll) {
    const created = Date.parse(currentUser.createdAt);
    if (!Number.isNaN(created) && created < GATE_SINCE) return <>{children}</>;
  }
  const state = membership(currentUser.id).state;
  const hasPlan = state === 'active' || state === 'expiring';
  if (!hasPlan) {
    // Sin plan activo → lo mandamos a adquirir su membresía/paquete.
    return <Navigate to="/app/packages?necesitas_plan=1" replace />;
  }
  return <>{children}</>;
}
