import { lazy, Suspense, useEffect, type ComponentType } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useStore } from './lib/store';
import { isSupabaseConfigured } from './lib/supabase';
import { notifySuccess, triggerResync } from './lib/notify';
import type { Role } from './lib/types';
import AppShell from './components/layout/AppShell';
// Los "gates" (verificaciones de pago/estado) son ligeros y se cargan de una vez.
import SubscriptionGate from './features/admin/SubscriptionGate';
import PlanGate from './features/admin/PlanGate';
import CoachGate from './features/coach/CoachGate';

// Cada pantalla se carga bajo demanda (code-splitting) para aligerar la carga
// inicial: el navegador solo descarga el código de la sección que se abre.
//
// lazyWithReload: si un "chunk" quedó obsoleto tras un nuevo despliegue (su
// archivo con hash ya no existe en el servidor), la descarga falla y la pantalla
// quedaría en blanco. En ese caso recargamos la página UNA sola vez para obtener
// la versión nueva — el usuario ya no tiene que recargar a mano.
function lazyWithReload<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
) {
  const KEY = 'chunk-reload-once';
  return lazy(async () => {
    try {
      const mod = await factory();
      // Carga exitosa: limpiamos la bandera para futuros despliegues.
      sessionStorage.removeItem(KEY);
      return mod;
    } catch (err) {
      // Si aún no recargamos por este motivo, recargamos una vez.
      if (!sessionStorage.getItem(KEY)) {
        sessionStorage.setItem(KEY, '1');
        window.location.reload();
        // Devuelve una promesa que nunca resuelve: la recarga toma el control.
        return new Promise<{ default: T }>(() => {});
      }
      // Si ya recargamos y sigue fallando, es un error real: se propaga.
      throw err;
    }
  });
}

const OnboardingScreen = lazyWithReload(() => import('./features/onboarding/OnboardingScreen'));
// Pantalla para fijar nueva contraseña (llega desde el correo de recuperación).
const ResetPassword = lazyWithReload(() => import('./features/onboarding/ResetPassword'));
// Landing pública (cara comercial) que se muestra en el dominio sin sesión.
const Landing = lazyWithReload(() => import('./features/public/Landing'));
// Página pública informativa del estudio (sin login).
const StudioInfoPage = lazyWithReload(() => import('./features/public/StudioInfoPage'));
// Página pública de política de privacidad (sin login) — para publicar en Meta.
const PrivacyPolicy = lazyWithReload(() => import('./features/public/PrivacyPolicy'));
// Página pública de términos y condiciones (sin login).
const TermsOfService = lazyWithReload(() => import('./features/public/TermsOfService'));

const AdminDashboard = lazyWithReload(() => import('./features/admin/AdminDashboard'));
const MembersCRM = lazyWithReload(() => import('./features/admin/MembersCRM'));
const CalendarAdmin = lazyWithReload(() => import('./features/admin/CalendarAdmin'));
const ClassesManagement = lazyWithReload(() => import('./features/admin/ClassesManagement'));
const PackageManagement = lazyWithReload(() => import('./features/admin/PackageManagement'));
const CoachesAdmin = lazyWithReload(() => import('./features/admin/CoachesAdmin'));
const RewardsAdmin = lazyWithReload(() => import('./features/admin/RewardsAdmin'));
const ServicesConfig = lazyWithReload(() => import('./features/admin/ServicesConfig'));
const WhatsappAgent = lazyWithReload(() => import('./features/admin/WhatsappAgent'));
const Reports = lazyWithReload(() => import('./features/admin/Reports'));
const Reminders = lazyWithReload(() => import('./features/admin/Reminders'));
const SubscriptionScreen = lazyWithReload(() => import('./features/admin/SubscriptionScreen'));
const Settings = lazyWithReload(() => import('./features/admin/Settings'));

const CoachDashboard = lazyWithReload(() => import('./features/coach/CoachDashboard'));
const CoachCalendar = lazyWithReload(() => import('./features/coach/CoachCalendar'));
const CoachProfile = lazyWithReload(() => import('./features/coach/CoachProfile'));

const StudentDashboard = lazyWithReload(() => import('./features/student/StudentDashboard'));
const BookClasses = lazyWithReload(() => import('./features/student/BookClasses'));
const MyPackages = lazyWithReload(() => import('./features/student/MyPackages'));
const Rewards = lazyWithReload(() => import('./features/student/Rewards'));
const OptionalServices = lazyWithReload(() => import('./features/student/OptionalServices'));
const StudentCoaches = lazyWithReload(() => import('./features/student/StudentCoaches'));

// Pantalla de carga mientras se descarga el código de una sección.
function Splash() {
  return (
    <div className="min-h-screen grid place-items-center bg-cream">
      <div className="text-2xl font-black text-brand animate-pulse">Move yA</div>
    </div>
  );
}

// Guarda de rol: redirige al onboarding si no hay sesión o el rol no coincide.
function RequireRole({ role, children }: { role: Role; children: React.ReactNode }) {
  const { currentUser } = useStore();
  if (!currentUser) return <Navigate to="/" replace />;
  if (currentUser.role !== role) {
    const home =
      currentUser.role === 'STUDIO_ADMIN'
        ? '/admin'
        : currentUser.role === 'COACH'
          ? '/coach'
          : '/app';
    return <Navigate to={home} replace />;
  }
  return <AppShell>{children}</AppShell>;
}

export default function App() {
  const { currentUser, authLoading, recoveryMode } = useStore();

  // Al volver de Stripe (?pago=exito / ?suscripcion=exito): avisa y refresca los
  // datos (el webhook ya creó el registro en el servidor).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pago = params.get('pago');
    const susc = params.get('suscripcion');
    if (!pago && !susc) return;
    if (pago === 'exito') {
      notifySuccess('¡Pago recibido! Activando tu paquete…');
      // El webhook de Stripe crea el paquete en el servidor; puede tardar unos
      // segundos. Reintentamos el refresco varias veces para que aparezca solo,
      // sin que el alumno tenga que recargar.
      [1500, 4000, 8000, 14000].forEach((ms) => setTimeout(triggerResync, ms));
    } else if (susc === 'exito') {
      notifySuccess('¡Suscripción activada! Bienvenido a tu plan.');
      [1500, 4000, 8000, 14000].forEach((ms) => setTimeout(triggerResync, ms));
    }
    // Limpia el query para que el aviso no se repita al recargar (conserva el hash).
    window.history.replaceState({}, '', window.location.pathname + window.location.hash);
    // Si el navegador (algunos in-app de móvil) perdió el "#/ruta" al volver de
    // Stripe, caeríamos en la raíz (landing). Forzamos la ruta correcta — asignar
    // location.hash SÍ dispara la navegación del HashRouter.
    const h = window.location.hash;
    if (!h || h === '#' || h === '#/') {
      const target = pago === 'exito' ? '/app/packages' : susc === 'exito' ? '/admin/subscription' : '';
      if (target) window.location.hash = target;
    }
  }, []);

  // Si faltan las llaves de conexión, avisa claramente (en vez de "Failed to fetch").
  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen grid place-items-center bg-cream p-6 text-center">
        <div className="max-w-md">
          <h1 className="mb-3 text-2xl font-black text-brand">Move yA</h1>
          <p className="text-ink">Falta configurar las llaves de conexión en Vercel.</p>
          <p className="mt-3 text-sm text-ink-soft">
            En Vercel → <b>Settings → Environment Variables</b>, agrega{' '}
            <b>VITE_SUPABASE_URL</b> y <b>VITE_SUPABASE_ANON_KEY</b>, marca{' '}
            <b>Production</b>, y vuelve a publicar (<b>Redeploy</b>).
          </p>
        </div>
      </div>
    );
  }

  // Mientras se verifica la sesión, muestra una pantalla de carga simple.
  if (authLoading) {
    return <Splash />;
  }

  // Recuperación de contraseña: si el usuario llegó desde el correo de
  // "restablecer", mostramos SIEMPRE la pantalla para fijar la nueva contraseña
  // (tiene prioridad sobre el resto, aunque ya exista sesión de recuperación).
  if (recoveryMode) {
    return (
      <Suspense fallback={<Splash />}>
        <ResetPassword />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<Splash />}>
    <Routes>
      {/* Página informativa PÚBLICA del estudio (sin login). */}
      <Route path="/info/:ceu" element={<StudioInfoPage />} />
      {/* Política de privacidad PÚBLICA (sin login) — requerida para publicar en Meta. */}
      <Route path="/privacy" element={<PrivacyPolicy />} />
      {/* Términos y condiciones PÚBLICOS (sin login). */}
      <Route path="/terms" element={<TermsOfService />} />

      {/* Raíz del dominio. Con sesión → panel según rol. Sin sesión: si viene
          por link de invitación (?ceu=) va directo al registro; si no, muestra
          la landing comercial. */}
      <Route
        path="/"
        element={
          currentUser ? (
            <Navigate
              to={
                currentUser.role === 'STUDIO_ADMIN'
                  ? '/admin'
                  : currentUser.role === 'COACH'
                    ? '/coach'
                    : '/app'
              }
              replace
            />
          ) : new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('ceu') ? (
            <OnboardingScreen />
          ) : (
            <Landing />
          )
        }
      />

      {/* Pantalla de acceso (registro / inicio de sesión), enlazada desde la landing. */}
      <Route
        path="/entrar"
        element={
          currentUser ? (
            <Navigate
              to={
                currentUser.role === 'STUDIO_ADMIN'
                  ? '/admin'
                  : currentUser.role === 'COACH'
                    ? '/coach'
                    : '/app'
              }
              replace
            />
          ) : (
            <OnboardingScreen />
          )
        }
      />

      {/* ---- ESTUDIO (Admin) — protegido por verificación de pago ---- */}
      {/* Dashboard siempre visible: aunque no haya pago, el estudio puede entrar a su panel principal. */}
      <Route path="/admin" element={<RequireRole role="STUDIO_ADMIN"><SubscriptionGate allow><AdminDashboard /></SubscriptionGate></RequireRole>} />
      <Route path="/admin/members" element={<RequireRole role="STUDIO_ADMIN"><SubscriptionGate><MembersCRM /></SubscriptionGate></RequireRole>} />
      <Route path="/admin/calendar" element={<RequireRole role="STUDIO_ADMIN"><SubscriptionGate><CalendarAdmin /></SubscriptionGate></RequireRole>} />
      <Route path="/admin/classes" element={<RequireRole role="STUDIO_ADMIN"><SubscriptionGate><ClassesManagement /></SubscriptionGate></RequireRole>} />
      <Route path="/admin/packages" element={<RequireRole role="STUDIO_ADMIN"><SubscriptionGate><PackageManagement /></SubscriptionGate></RequireRole>} />
      <Route path="/admin/coaches" element={<RequireRole role="STUDIO_ADMIN"><SubscriptionGate><CoachesAdmin /></SubscriptionGate></RequireRole>} />
      <Route path="/admin/rewards" element={<RequireRole role="STUDIO_ADMIN"><SubscriptionGate><PlanGate capability="rewards"><RewardsAdmin /></PlanGate></SubscriptionGate></RequireRole>} />
      <Route path="/admin/services" element={<RequireRole role="STUDIO_ADMIN"><SubscriptionGate><PlanGate capability="services"><ServicesConfig /></PlanGate></SubscriptionGate></RequireRole>} />
      <Route path="/admin/whatsapp" element={<RequireRole role="STUDIO_ADMIN"><SubscriptionGate><PlanGate capability="whatsapp"><WhatsappAgent /></PlanGate></SubscriptionGate></RequireRole>} />
      <Route path="/admin/reports" element={<RequireRole role="STUDIO_ADMIN"><SubscriptionGate><PlanGate capability="reports"><Reports /></PlanGate></SubscriptionGate></RequireRole>} />
      <Route path="/admin/reminders" element={<RequireRole role="STUDIO_ADMIN"><SubscriptionGate><Reminders /></SubscriptionGate></RequireRole>} />
      {/* Suscripción siempre accesible (allow) para poder regularizar el pago. */}
      <Route path="/admin/subscription" element={<RequireRole role="STUDIO_ADMIN"><SubscriptionGate allow><SubscriptionScreen /></SubscriptionGate></RequireRole>} />
      <Route path="/admin/settings" element={<RequireRole role="STUDIO_ADMIN"><SubscriptionGate><Settings /></SubscriptionGate></RequireRole>} />

      {/* ---- COACH — protegido por estado de aprobación ---- */}
      <Route path="/coach" element={<RequireRole role="COACH"><CoachGate><CoachDashboard /></CoachGate></RequireRole>} />
      <Route path="/coach/calendar" element={<RequireRole role="COACH"><CoachGate><CoachCalendar /></CoachGate></RequireRole>} />
      <Route path="/coach/profile" element={<RequireRole role="COACH"><CoachGate><CoachProfile /></CoachGate></RequireRole>} />

      {/* ---- USUARIO (Alumno) ---- */}
      <Route path="/app" element={<RequireRole role="STUDENT"><StudentDashboard /></RequireRole>} />
      <Route path="/app/book" element={<RequireRole role="STUDENT"><BookClasses /></RequireRole>} />
      <Route path="/app/packages" element={<RequireRole role="STUDENT"><MyPackages /></RequireRole>} />
      <Route path="/app/rewards" element={<RequireRole role="STUDENT"><Rewards /></RequireRole>} />
      <Route path="/app/coaches" element={<RequireRole role="STUDENT"><StudentCoaches /></RequireRole>} />
      <Route path="/app/services" element={<RequireRole role="STUDENT"><OptionalServices /></RequireRole>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}
