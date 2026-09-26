import { useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useStore } from '../../lib/store';
import type { Role } from '../../lib/types';
import type { PlanCapability } from '../../lib/plans';
import Avatar from '../Avatar';
import ImageUpload from '../ImageUpload';
import InstallAppButton from '../InstallAppButton';
import NotificationsButton from '../NotificationsButton';
import NotificationsPrompt from '../NotificationsPrompt';
import StudioLogo from '../StudioLogo';

interface NavItem {
  to: string;
  label: string;
  short?: string; // etiqueta corta para la barra inferior (móvil)
  cap?: PlanCapability; // si se define, solo se muestra si el plan la incluye
}

// Rutas de navegación principales por rol.
const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  STUDIO_ADMIN: [
    { to: '/admin', label: 'Dashboard', short: 'Inicio' },
    { to: '/admin/members', label: 'Miembros (CRM)', short: 'Miembros' },
    { to: '/admin/calendar', label: 'Calendario', short: 'Agenda' },
    { to: '/admin/reminders', label: 'Recordatorios' },
    { to: '/admin/classes', label: 'Clases' },
    { to: '/admin/packages', label: 'Paquetes' },
    { to: '/admin/coaches', label: 'Coaches' },
    { to: '/admin/rewards', label: 'Recompensas', cap: 'rewards' },
    { to: '/admin/services', label: 'Servicios', cap: 'services' },
    { to: '/admin/whatsapp', label: 'WhatsApp IA', cap: 'whatsapp' },
    { to: '/admin/inbox', label: 'Bandeja WhatsApp', short: 'Bandeja', cap: 'whatsapp' },
    { to: '/admin/reports', label: 'Reportes', cap: 'reports' },
    { to: '/admin/subscription', label: 'Suscripción' },
    { to: '/admin/settings', label: 'Configuración' },
  ],
  COACH: [
    { to: '/coach', label: 'Inicio' },
    { to: '/coach/calendar', label: 'Mi Calendario', short: 'Agenda' },
    { to: '/coach/profile', label: 'Mi Perfil', short: 'Perfil' },
  ],
  STUDENT: [
    { to: '/app', label: 'Inicio' },
    { to: '/app/book', label: 'Reservar' },
    { to: '/app/packages', label: 'Mis Paquetes', short: 'Paquetes' },
    { to: '/app/coaches', label: 'Coaches' },
    { to: '/app/rewards', label: 'Recompensas', short: 'Premios' },
    { to: '/app/services', label: 'Servicios' },
  ],
};

const ROLE_LABEL: Record<Role, string> = {
  STUDIO_ADMIN: 'Estudio',
  COACH: 'Coach',
  STUDENT: 'Alumno',
};

const isRoot = (to: string) => to === '/admin' || to === '/coach' || to === '/app';

// Íconos lineales (outline) uniformes, misma familia para toda la app.
function iconPaths(to: string): ReactNode {
  if (isRoot(to))
    return (
      <>
        <path d="M3 10.5 12 4l9 6.5" />
        <path d="M5 9.2V20h14V9.2" />
      </>
    );
  if (to.includes('members') || to.includes('coaches'))
    return (
      <>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3.5 20c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
        <path d="M16 5.2a3 3 0 0 1 0 5.6" />
        <path d="M20.5 20c0-2.4-1.6-4.2-3.8-4.8" />
      </>
    );
  if (to.includes('calendar') || to.includes('book'))
    return (
      <>
        <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
        <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
      </>
    );
  if (to.includes('packages'))
    return (
      <>
        <path d="M12 3 4 7v10l8 4 8-4V7z" />
        <path d="M4 7l8 4 8-4M12 11v10" />
      </>
    );
  if (to.includes('rewards'))
    return <path d="M12 3.5l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8z" />;
  if (to.includes('services'))
    return (
      <>
        <path d="M11 4v6M8 7h6" />
        <path d="M17.5 13l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" />
      </>
    );
  if (to.includes('reminders'))
    return (
      <>
        <path d="M6.5 9.5a5.5 5.5 0 0 1 11 0c0 4.5 2 5.5 2 5.5H4.5s2-1 2-5.5z" />
        <path d="M10 19a2 2 0 0 0 4 0" />
      </>
    );
  if (to.includes('classes')) return <path d="M3 12h3l2.5-6 4 12L17 9h4" />;
  if (to.includes('inbox'))
    return (
      <>
        <path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h10a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 15 13H8l-4 3v-3H5" />
        <path d="M17 9h2a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 19 17h-1v3l-4-3" />
      </>
    );
  if (to.includes('whatsapp'))
    return (
      <>
        <path d="M4 5.5h16v10H8.5L4 19z" />
        <path d="M8.5 10.5h7M8.5 13h4" />
      </>
    );
  if (to.includes('reports'))
    return (
      <>
        <path d="M4 20V4M4 20h16" />
        <path d="M8 17v-4M12 17V8M16 17v-6" />
      </>
    );
  if (to.includes('subscription'))
    return <path d="M12 3.5l2 5 5 .7-3.6 3.5.9 5-4.3-2.4L7.4 17.7l.9-5L4.7 9.2l5-.7z" />;
  if (to.includes('settings'))
    return (
      <>
        <path d="M4 8h9M17 8h3M4 16h3M11 16h9" />
        <circle cx="15" cy="8" r="2.1" />
        <circle cx="8" cy="16" r="2.1" />
      </>
    );
  if (to.includes('profile'))
    return (
      <>
        <circle cx="12" cy="8" r="3.6" />
        <path d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6" />
      </>
    );
  return <circle cx="12" cy="12" r="7.5" />;
}

function NavIcon({ to, className = 'h-6 w-6' }: { to: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {iconPaths(to)}
    </svg>
  );
}

function MoreIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <circle cx="5" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="19" cy="12" r="1.7" />
    </svg>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const { currentUser, currentStudio, logout, updateUserAvatar, can } = useStore();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!currentUser || !currentStudio) return null;
  // Oculta del menú las funciones que el plan del estudio no incluye.
  const nav = NAV_BY_ROLE[currentUser.role].filter((item) => !item.cap || can(item.cap));

  // Barra inferior (móvil): mostramos hasta 4 secciones + el botón "Más".
  // "Más" SIEMPRE aparece: abre el cajón con la cuenta (foto, notificaciones y
  // Cerrar sesión), así que ningún rol se queda sin poder cerrar sesión.
  const primary = nav.length <= 4 ? nav : nav.slice(0, 4);
  const hasMore = true;

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // Contenido del menú lateral (escritorio) y del cajón "Más" (móvil).
  const SidebarContent = (
    <div className="flex h-full flex-col">
      <div className="px-5 py-6 border-b border-cream-dark">
        <StudioLogo
          branding={currentStudio.branding}
          imgClass="h-9 max-w-[120px]"
          textClass="text-base font-bold text-brand"
          showName
        />
        <p className="text-xs text-ink-faint mt-1.5">
          powered by <span className="font-semibold">Move yA</span>
        </p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={isRoot(item.to)}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition ${
                isActive
                  ? 'bg-brand text-cream-light shadow-soft'
                  : 'text-ink-soft hover:bg-brand-soft'
              }`
            }
          >
            <NavIcon to={item.to} className="h-5 w-5 shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-cream-dark p-4">
        <div className="flex items-center gap-3 mb-3">
          <Avatar url={currentUser.avatarUrl} initials={currentUser.avatarInitials} className="h-9 w-9 text-sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{currentUser.fullName}</p>
            <p className="text-xs text-ink-faint">{ROLE_LABEL[currentUser.role]}</p>
          </div>
        </div>
        <ImageUpload
          label="Cambiar foto"
          className="w-full mb-2"
          onSelect={(url) => updateUserAvatar(currentUser.id, url)}
        />
        <InstallAppButton className="mb-2" />
        <NotificationsButton className="mb-2" />
        <button
          onClick={handleLogout}
          className="w-full rounded-2xl px-3 py-2 text-sm text-ink-soft hover:bg-brand-soft text-left"
        >
          ⟲ Cerrar sesión
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-cream-light">
      {/* Sidebar escritorio */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 bg-white border-r border-cream-dark lg:block">
        {SidebarContent}
      </aside>

      {/* Topbar móvil (delgado): logo + avatar */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-cream-dark bg-cream-light/90 px-4 py-3 backdrop-blur lg:hidden">
        <StudioLogo branding={currentStudio.branding} imgClass="h-8 max-w-[130px]" textClass="font-bold text-brand" />
        <Avatar url={currentUser.avatarUrl} initials={currentUser.avatarInitials} className="h-8 w-8 text-xs" />
      </header>

      {/* Cajón "Más" (móvil) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85%] bg-white">{SidebarContent}</aside>
        </div>
      )}

      <main className="lg:pl-64">
        <div className="mx-auto max-w-6xl px-4 py-6 pb-28 sm:px-6 lg:px-8 lg:pb-10">{children}</div>
      </main>

      {/* Barra inferior de navegación (móvil) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t border-cream-dark bg-white/95 px-1 shadow-nav backdrop-blur lg:hidden">
        {primary.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={isRoot(item.to)}
            className="flex flex-1 flex-col items-center gap-1 py-1.5"
          >
            {({ isActive }) => (
              <>
                <span
                  className={`grid h-9 w-9 place-items-center rounded-full transition-colors ${
                    isActive ? 'bg-brand-soft text-brand' : 'text-ink-faint'
                  }`}
                >
                  <NavIcon to={item.to} className="h-[22px] w-[22px]" />
                </span>
                <span
                  className={`text-[11px] font-semibold ${isActive ? 'text-brand' : 'text-ink-faint'}`}
                >
                  {item.short ?? item.label}
                </span>
              </>
            )}
          </NavLink>
        ))}
        {hasMore && (
          <button
            onClick={() => setMobileOpen(true)}
            className="flex flex-1 flex-col items-center gap-1 py-1.5 text-ink-faint"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full">
              <MoreIcon className="h-[22px] w-[22px]" />
            </span>
            <span className="text-[11px] font-semibold">Más</span>
          </button>
        )}
        {/* respeta el "safe area" de iPhone */}
        <div className="pointer-events-none absolute inset-x-0 top-full h-[env(safe-area-inset-bottom)] bg-white/95" />
      </nav>

      {/* Aviso automático para activar notificaciones (una sola vez). */}
      <NotificationsPrompt />
    </div>
  );
}
