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
export default function StudentGate({ children }: { children: React.ReactNode }) {
  const { currentUser, membership } = useStore();
  if (!currentUser) return <Navigate to="/" replace />;
  const state = membership(currentUser.id).state;
  const hasPlan = state === 'active' || state === 'expiring';
  if (!hasPlan) {
    // Sin plan activo → lo mandamos a adquirir su membresía/paquete.
    return <Navigate to="/app/packages?necesitas_plan=1" replace />;
  }
  return <>{children}</>;
}
