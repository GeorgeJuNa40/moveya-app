import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type {
  Booking,
  Branding,
  ClassSession,
  ClassTemplate,
  Database,
  Goal,
  MembershipState,
  OptionalService,
  Package,
  Payment,
  PaymentMethod,
  PlanId,
  Reward,
  StarEntry,
  Studio,
  User,
  UserPackage,
  WhatsappConfig,
  WhatsappTemplate,
} from './types';
import { getPlan, planHas, type PlanCapability } from './plans';
import { setActiveCurrency } from './format';
import { notifyError, setResyncHandler } from './notify';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import {
  loadDatabase,
  emptyDatabase,
  persistStudio,
  dbInsert,
  dbUpsert,
  dbUpdate,
  dbDelete,
  dbDeleteWhere,
  rowBooking,
  rowUserPackage,
  rowPayment,
  rowStar,
  rowPackage,
  rowClassTemplate,
  rowClassSession,
  rowReward,
  rowGoal,
  rowUser,
} from './repo';

// Datos que se envían al registrarse.
export interface SignUpInput {
  fullName: string;
  email: string;
  password: string;
  ceuCode?: string; // para unirse a un estudio existente
  studioName?: string; // para crear un estudio nuevo (ADMIN)
  role?: 'COACH' | 'STUDENT'; // rol al unirse por CEU (por defecto STUDENT)
  phone?: string; // teléfono con lada (ej. +52 55 1234 5678)
  birthDate?: string; // fecha de nacimiento (YYYY-MM-DD)
  country?: string; // ISO del país (ej. MX)
  currency?: string; // moneda local derivada del país (ej. MXN)
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

export interface MembershipInfo {
  state: MembershipState;
  planName: string | null;
  creditsLeft: number;
  expiresAt: string | null;
  daysLeft: number;
}

interface StoreValue {
  db: Database;
  currentUser: User | null;
  currentStudio: Studio | null;
  // Auth
  authLoading: boolean;
  signUp: (input: SignUpInput) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  // Recuperación de contraseña
  recoveryMode: boolean; // true cuando el usuario llegó desde el correo de "restablecer"
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  // Selectors
  seatsLeft: (sessionId: string) => number;
  studioUsers: (role: User['role']) => User[];
  starBalance: (userId: string) => number;
  isNewStudent: (userId: string) => boolean; // aún no ha tenido su primer check-in
  membership: (userId: string) => MembershipInfo;
  availableCredits: (userId: string) => number; // créditos usables (activos, con vigencia)
  // Alumno
  bookSession: (sessionId: string) => void;
  cancelBooking: (bookingId: string) => void;
  markAttendance: (bookingId: string, attended: boolean) => void; // el coach marca asistencia
  // Penalizaciones (adeudos) por no asistir sin cancelar
  pendingPenalty: (userId: string) => number; // total de adeudos sin pagar del alumno
  settlePenalty: (bookingId: string, paid: boolean) => void; // el estudio marca el adeudo como pagado/pendiente
  waivePenalty: (bookingId: string) => void; // el estudio condona (quita) el adeudo
  buyPackageOnline: (packageId: string, method: PaymentMethod) => void;
  redeemReward: (rewardId: string) => void;
  // Metas del alumno (las crea el propio alumno; avance por asistencia)
  createGoal: (title: string, target: number, periodEnd: string) => void;
  deleteGoal: (goalId: string) => void;
  goalProgress: (goal: Goal) => number; // clases asistidas dentro de la ventana
  awardGoal: (goalId: string) => void; // valida y da estrellas si ya cumplió
  // Estudio — pagos y planes
  registerManualPlan: (userId: string, packageId: string, method: PaymentMethod) => void;
  // Estudio — paquetes
  upsertPackage: (pkg: Package) => void;
  togglePackageActive: (packageId: string) => void;
  // Estudio — clases (tipos) y sesiones (calendario)
  upsertClassTemplate: (tpl: ClassTemplate) => void;
  deleteClassTemplate: (id: string) => void;
  upsertSession: (s: ClassSession) => void;
  deleteSession: (id: string) => void;
  // Estudio — coaches
  setCoachStatus: (userId: string, status: User['coachStatus']) => void;
  upsertCoach: (coach: User) => void;
  // Perfil — foto de cualquier usuario (admin, coach, alumno)
  updateUserAvatar: (userId: string, avatarUrl: string) => void;
  // Perfil propio — el usuario edita sus datos (coach: bio, especialidades, etc.)
  updateMyProfile: (patch: {
    fullName?: string;
    phone?: string;
    bio?: string;
    specialties?: string[];
    yearsExp?: number;
  }) => void;
  // Estudio — servicios
  addService: (name: string, description: string, whatsapp?: string) => void;
  updateService: (id: string, patch: Partial<OptionalService>) => void;
  removeService: (id: string) => void;
  // Estudio — recompensas
  upsertReward: (reward: Reward) => void;
  deleteReward: (id: string) => void;
  // Estudio — negocio / branding / whatsapp
  updateStudio: (patch: Partial<Studio>) => void;
  updateBranding: (patch: Partial<Branding>) => void;
  updateWhatsapp: (patch: Partial<WhatsappConfig>) => void;
  upsertWhatsappTemplate: (t: WhatsappTemplate) => void;
  deleteWhatsappTemplate: (id: string) => void;
  addKnowledge: (text: string) => void;
  removeKnowledge: (index: number) => void;
  // Suscripción SaaS
  activatePromo: () => void;
  subscribeToPlan: (plan: PlanId) => void;
  markSubscriptionPaid: () => void;
  setSubscriptionPastDue: () => void;
  // Plan actual del estudio y control de funciones por plan.
  plan: PlanId;
  can: (cap: PlanCapability) => boolean;
}

const StoreContext = createContext<StoreValue | null>(null);

// IDs reales (UUID) para que coincidan con la base de datos.
const newId = () => crypto.randomUUID();

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Database>(emptyDatabase);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState(false);

  // Escucha la sesión de Supabase (inicio/cierre) y la mantiene al recargar.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setAuthLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      // Si el usuario llegó desde el correo de "restablecer contraseña", Supabase
      // abre una sesión temporal de recuperación: mostramos la pantalla para
      // fijar la nueva contraseña (App.tsx la prioriza sobre todo lo demás).
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const currentUserId = session?.user?.id ?? null;

  // Cuando hay sesión, carga los datos del estudio desde Supabase.
  useEffect(() => {
    let cancelled = false;
    if (currentUserId) {
      setAuthLoading(true);
      loadDatabase()
        .then((data) => {
          if (!cancelled) setDb(data);
        })
        .finally(() => {
          if (!cancelled) setAuthLoading(false);
        });
    } else {
      setDb(emptyDatabase());
      setAuthLoading(false);
    }
    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  const currentUser = useMemo(
    () => db.users.find((u) => u.id === currentUserId) ?? null,
    [db.users, currentUserId],
  );
  const currentStudio = useMemo(
    () => db.studios.find((s) => s.id === currentUser?.studioId) ?? null,
    [db.studios, currentUser],
  );

  // White-label: aplica el branding del estudio en vivo. Si aún no hay estudio
  // (pantalla de registro/login), usa la paleta por defecto de Move yA.
  useEffect(() => {
    const b = currentStudio?.branding;
    const root = document.documentElement;
    root.style.setProperty('--brand-primary', b?.primaryColor ?? '#2D5A4C');
    root.style.setProperty('--brand-secondary', b?.secondaryColor ?? '#F4F1EA');
    root.style.setProperty('--brand-accent', b?.accentColor ?? '#333333');
    root.style.setProperty('--brand-font', `'${b?.fontFamily ?? 'Inter'}', system-ui, sans-serif`);
  }, [currentStudio]);

  // Helper: modifica el estudio actual (local) y lo guarda en Supabase.
  const patchStudio = (fn: (s: Studio) => Studio) => {
    if (!currentStudio) return;
    const next = fn(currentStudio);
    setDb((prev) => ({
      ...prev,
      studios: prev.studios.map((s) => (s.id === next.id ? next : s)),
    }));
    void persistStudio(next);
  };

  // Moneda local del estudio: se aplica a los precios en toda la app.
  setActiveCurrency(currentStudio?.branding.currencyCode);

  // Re-sincronización: si un guardado en la nube falla, volvemos a cargar los
  // datos del servidor para que el estado local no quede desfasado (P3).
  useEffect(() => {
    if (!currentUserId) return;
    setResyncHandler(() => {
      loadDatabase()
        .then((data) => setDb(data))
        .catch(() => {});
    });
    return () => setResyncHandler(null);
  }, [currentUserId]);

  // Tiempo real (en vivo): nos suscribimos a los cambios de la base y, ante
  // cualquiera, recargamos los datos del estudio. Así las pantallas abiertas
  // reflejan al instante reservas, compras, créditos, estrellas, clases, etc.
  // sin recargar. RLS asegura que solo llegan los cambios que el usuario puede
  // ver (su estudio / lo suyo). El debounce agrupa ráfagas de cambios.
  useEffect(() => {
    if (!currentUserId) return;
    const token = session?.access_token;
    if (token) supabase.realtime.setAuth(token);

    let timer: ReturnType<typeof setTimeout> | undefined;
    const scheduleReload = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        loadDatabase()
          .then((data) => setDb(data))
          .catch(() => {});
      }, 400);
    };

    const channel = supabase
      .channel('moveya-live')
      .on('postgres_changes', { event: '*', schema: 'public' }, scheduleReload)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [currentUserId, session?.access_token]);

  // Hidratación desde el registro: el teléfono (con lada) y la moneda quedan en
  // los metadatos de la cuenta. La primera vez que se carga la sesión, los
  // guardamos en la base (teléfono del usuario, moneda del estudio si es admin).
  useEffect(() => {
    const meta = session?.user?.user_metadata as
      | { phone?: string; country?: string; currency?: string }
      | undefined;
    if (!meta || !currentUser) return;

    if (meta.phone && !currentUser.phone) {
      const phone = String(meta.phone);
      setDb((prev) => ({
        ...prev,
        users: prev.users.map((u) => (u.id === currentUser.id ? { ...u, phone } : u)),
      }));
      void dbUpdate('users', currentUser.id, { phone });
    }

    if (
      currentUser.role === 'STUDIO_ADMIN' &&
      currentStudio &&
      meta.currency &&
      !currentStudio.branding.currencyCode
    ) {
      patchStudio((s) => ({
        ...s,
        branding: { ...s.branding, currencyCode: meta.currency, country: meta.country },
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, currentStudio?.id, session]);

  // Respaldo local de reserva (si la RPC book_session aún no está instalada).
  // Valida cupo, créditos y vigencia del paquete en el cliente.
  const legacyBookSession = (sessionId: string) => {
    if (!currentUser) return;
    const existing = db.bookings.find(
      (b) => b.userId === currentUser.id && b.sessionId === sessionId,
    );
    if (existing && existing.status !== 'CANCELED') return; // ya está reservada
    const s = db.classSessions.find((x) => x.id === sessionId);
    if (!s) return;
    const seats =
      s.capacity -
      db.bookings.filter((b) => b.sessionId === sessionId && b.status !== 'CANCELED').length;
    if (seats <= 0) return;
    // Paquete usable: activo, con créditos y dentro de su vigencia.
    const activePkg = db.userPackages.find(
      (p) => p.userId === currentUser.id && isUsablePackage(p),
    );
    if (!activePkg) return; // sin clases disponibles, no puede reservar

    if (existing) {
      setDb((prev) => ({
        ...prev,
        bookings: prev.bookings.map((b) =>
          b.id === existing.id
            ? { ...b, status: 'RESERVED', userPackageId: activePkg.id }
            : b,
        ),
        userPackages: prev.userPackages.map((p) =>
          p.id === activePkg.id ? { ...p, creditsUsed: p.creditsUsed + 1 } : p,
        ),
      }));
      void dbUpdate('bookings', existing.id, {
        status: 'RESERVED',
        user_package_id: activePkg.id,
      });
      void dbUpdate('user_packages', activePkg.id, { credits_used: activePkg.creditsUsed + 1 });
      return;
    }

    const booking: Booking = {
      id: newId(),
      userId: currentUser.id,
      sessionId,
      userPackageId: activePkg.id,
      status: 'RESERVED',
      createdAt: new Date().toISOString(),
    };
    setDb((prev) => ({
      ...prev,
      bookings: [...prev.bookings, booking],
      userPackages: prev.userPackages.map((p) =>
        p.id === activePkg.id ? { ...p, creditsUsed: p.creditsUsed + 1 } : p,
      ),
    }));
    void dbInsert('bookings', rowBooking(booking));
    void dbUpdate('user_packages', activePkg.id, { credits_used: activePkg.creditsUsed + 1 });
  };

  // Plan vigente del estudio (por defecto el más limitado si aún no hay dato).
  const plan: PlanId = currentStudio?.subscription?.plan ?? 'inicio';

  const value: StoreValue = {
    db,
    currentUser,
    currentStudio,
    authLoading,
    plan,
    can: (cap) => planHas(plan, cap),

    async signUp(input) {
      const { error } = await supabase.auth.signUp({
        email: input.email.trim(),
        password: input.password,
        options: {
          data: {
            full_name: input.fullName.trim(),
            ...(input.ceuCode ? { ceu_code: input.ceuCode.trim() } : {}),
            ...(input.studioName ? { studio_name: input.studioName.trim() } : {}),
            ...(input.role ? { signup_role: input.role } : {}),
            ...(input.phone ? { phone: input.phone.trim() } : {}),
            ...(input.birthDate ? { birth_date: input.birthDate } : {}),
            ...(input.country ? { country: input.country } : {}),
            ...(input.currency ? { currency: input.currency } : {}),
          },
        },
      });
      if (error) throw error;
    },
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
    },
    async logout() {
      await supabase.auth.signOut();
    },
    recoveryMode,
    async sendPasswordReset(email) {
      // Envía el correo con el enlace para restablecer. Al abrirlo, Supabase
      // regresa a la app con una sesión de recuperación (evento PASSWORD_RECOVERY).
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
    },
    async updatePassword(newPassword) {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setRecoveryMode(false);
    },

    seatsLeft(sessionId) {
      const s = db.classSessions.find((x) => x.id === sessionId);
      if (!s) return 0;
      const taken = db.bookings.filter(
        (b) => b.sessionId === sessionId && b.status !== 'CANCELED',
      ).length;
      return Math.max(0, s.capacity - taken);
    },
    studioUsers(role) {
      return db.users.filter((u) => u.studioId === currentUser?.studioId && u.role === role);
    },
    starBalance(userId) {
      return db.stars.filter((s) => s.userId === userId).reduce((a, s) => a + s.delta, 0);
    },
    // Alumno "nuevo": aún no tiene ninguna asistencia registrada (primer check-in).
    isNewStudent(userId) {
      return !db.bookings.some((b) => b.userId === userId && b.status === 'ATTENDED');
    },
    membership(userId) {
      const ups = db.userPackages.filter((p) => p.userId === userId);
      if (!ups.length) {
        return { state: 'none', planName: null, creditsLeft: 0, expiresAt: null, daysLeft: 0 };
      }
      // Consideramos TODOS los paquetes usables (activos, con créditos y vigentes),
      // no solo el más reciente: si el alumno tiene cualquiera activo, su membresía
      // está activa, y las clases disponibles se SUMAN de todos.
      const usable = ups.filter(isUsablePackage);
      if (usable.length) {
        // El que vence primero (el que se consume antes) define plan/vigencia.
        const soonest = usable.slice().sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))[0];
        const pkg = db.packages.find((p) => p.id === soonest.packageId);
        const daysLeft = daysUntil(soonest.expiresAt);
        const creditsLeft = usable.reduce((t, p) => t + Math.max(0, p.creditsTotal - p.creditsUsed), 0);
        // "Por vencer" es la parte FINAL de la vigencia del paquete, no un número
        // fijo de días. Así, un paquete recién comprado sale "Activa" aunque su
        // vigencia sea corta; solo se marca "Por vencer" cerca del final.
        const validity = pkg?.validityDays ?? 30;
        const expiringWindow = Math.min(7, Math.max(1, Math.round(validity * 0.3)));
        const state: MembershipState = daysLeft <= expiringWindow ? 'expiring' : 'active';
        return { state, planName: pkg?.name ?? null, creditsLeft, expiresAt: soonest.expiresAt, daysLeft };
      }
      // Sin paquetes usables: mostramos el más reciente como vencido/agotado.
      const latest = ups.slice().sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt))[0];
      const pkg = db.packages.find((p) => p.id === latest.packageId);
      return { state: 'expired', planName: pkg?.name ?? null, creditsLeft: 0, expiresAt: latest.expiresAt, daysLeft: daysUntil(latest.expiresAt) };
    },
    availableCredits(userId) {
      return db.userPackages
        .filter((p) => p.userId === userId && isUsablePackage(p))
        .reduce((total, p) => total + Math.max(0, p.creditsTotal - p.creditsUsed), 0);
    },

    // Reserva una clase. Primero intenta la función transaccional del servidor
    // (book_session), que valida cupo, créditos y vigencia de forma atómica y
    // evita sobrecupo cuando dos alumnos reservan al mismo tiempo. Si esa función
    // aún no está instalada en Supabase, usa el método local como respaldo.
    async bookSession(sessionId) {
      if (!currentUser) return;
      const uid = currentUser.id;
      const { data, error } = await supabase.rpc('book_session', { p_session_id: sessionId });
      if (error) {
        const msg = error.message || '';
        if (error.code === 'PGRST202' || /Could not find the function/i.test(msg)) {
          legacyBookSession(sessionId); // la RPC aún no existe: respaldo local
          return;
        }
        notifyError('reservar', bookingErrorMessage(msg));
        return;
      }
      const res = data as { booking_id: string; user_package_id: string } | null;
      if (!res) return;
      setDb((prev) => {
        const exists = prev.bookings.some((b) => b.id === res.booking_id);
        const nb: Booking = {
          id: res.booking_id,
          userId: uid,
          sessionId,
          userPackageId: res.user_package_id,
          status: 'RESERVED',
          createdAt: new Date().toISOString(),
        };
        return {
          ...prev,
          bookings: exists
            ? prev.bookings.map((b) =>
                b.id === res.booking_id
                  ? { ...b, status: 'RESERVED', userPackageId: res.user_package_id }
                  : b,
              )
            : [...prev.bookings, nb],
          userPackages: prev.userPackages.map((p) =>
            p.id === res.user_package_id ? { ...p, creditsUsed: p.creditsUsed + 1 } : p,
          ),
        };
      });
    },
    // Cancela una reserva y DEVUELVE el crédito de forma atómica en el servidor
    // (RPC cancel_booking). Si esa función aún no está instalada, usa el respaldo
    // local (escritura directa, compatible con la RLS antigua).
    async cancelBooking(bookingId) {
      const booking = db.bookings.find((b) => b.id === bookingId);
      if (!booking || booking.status === 'CANCELED') return;
      const applyLocal = () =>
        setDb((prev) => ({
          ...prev,
          bookings: prev.bookings.map((b) => (b.id === bookingId ? { ...b, status: 'CANCELED' } : b)),
          userPackages: booking.userPackageId
            ? prev.userPackages.map((p) =>
                p.id === booking.userPackageId ? { ...p, creditsUsed: Math.max(0, p.creditsUsed - 1) } : p,
              )
            : prev.userPackages,
        }));

      const { error } = await supabase.rpc('cancel_booking', { p_booking_id: bookingId });
      if (error) {
        const msg = error.message || '';
        if (error.code === 'PGRST202' || /Could not find the function/i.test(msg)) {
          // Respaldo: la RPC no existe todavía → escritura directa (RLS antigua).
          applyLocal();
          void dbUpdate('bookings', bookingId, { status: 'CANCELED' });
          if (booking.userPackageId) {
            const up = db.userPackages.find((p) => p.id === booking.userPackageId);
            if (up) void dbUpdate('user_packages', up.id, { credits_used: Math.max(0, up.creditsUsed - 1) });
          }
          return;
        }
        notifyError('cancelar', msg);
        return;
      }
      applyLocal();
    },

    // El coach marca si el alumno asistió. Al asistir gana 1 estrella (recompensa);
    // marcar "no asistió" NO devuelve la clase (penaliza reservar y no ir) y quita
    // la estrella si se había dado. La estrella usa un id derivado de la reserva
    // para que no se dupliquen aunque se cambie el estado varias veces.
    markAttendance(bookingId, attended) {
      const booking = db.bookings.find((b) => b.id === bookingId);
      if (!booking) return;
      const status: Booking['status'] = attended ? 'ATTENDED' : 'NO_SHOW';
      // Si el estudio configuró penalización y el alumno NO asistió (y no canceló),
      // se le genera un adeudo. Si asiste, se limpia cualquier adeudo previo.
      const penaltyCfg = Math.max(0, currentStudio?.branding.noShowPenaltyUsd ?? 0);
      const penaltyUsd = attended ? 0 : penaltyCfg;
      const starId = `att-${bookingId}`;
      const entry: StarEntry = {
        id: starId,
        userId: booking.userId,
        delta: 1,
        reason: 'attendance',
        createdAt: new Date().toISOString(),
      };
      setDb((prev) => {
        const bookings = prev.bookings.map((b) =>
          b.id === bookingId ? { ...b, status, penaltyUsd, penaltyPaid: attended ? false : (b.penaltyPaid ?? false) } : b,
        );
        let stars = prev.stars;
        if (attended) {
          if (!stars.some((s) => s.id === starId)) stars = [...stars, entry];
        } else {
          stars = stars.filter((s) => s.id !== starId);
        }
        return { ...prev, bookings, stars };
      });
      void dbUpdate('bookings', bookingId, { status, penalty_usd: penaltyUsd });
      if (attended) void dbUpsert('star_entries', rowStar(entry));
      else void dbDelete('star_entries', starId);
    },
    pendingPenalty(userId) {
      return db.bookings
        .filter((b) => b.userId === userId && !b.penaltyPaid && (b.penaltyUsd ?? 0) > 0)
        .reduce((a, b) => a + (b.penaltyUsd ?? 0), 0);
    },
    settlePenalty(bookingId, paid) {
      setDb((prev) => ({
        ...prev,
        bookings: prev.bookings.map((b) => (b.id === bookingId ? { ...b, penaltyPaid: paid } : b)),
      }));
      void dbUpdate('bookings', bookingId, { penalty_paid: paid });
    },
    waivePenalty(bookingId) {
      setDb((prev) => ({
        ...prev,
        bookings: prev.bookings.map((b) => (b.id === bookingId ? { ...b, penaltyUsd: 0, penaltyPaid: false } : b)),
      }));
      void dbUpdate('bookings', bookingId, { penalty_usd: 0, penalty_paid: false });
    },

    buyPackageOnline(packageId, method) {
      if (!currentUser) return;
      applyPurchase(setDb, db, currentUser.id, packageId, method, 'online');
    },
    registerManualPlan(userId, packageId, method) {
      applyPurchase(setDb, db, userId, packageId, method, 'studio');
    },

    // Canjea una recompensa. El saldo de estrellas se valida en el servidor
    // (RPC redeem_reward). Si esa función aún no está instalada, usa el respaldo
    // local (escritura directa, compatible con la RLS antigua).
    async redeemReward(rewardId) {
      if (!currentUser) return;
      const uid = currentUser.id;
      const reward = db.rewards.find((r) => r.id === rewardId);
      if (!reward) return;
      const balance = db.stars.filter((s) => s.userId === uid).reduce((a, s) => a + s.delta, 0);
      if (balance < reward.starCost) {
        notifyError('canjear', 'No tienes estrellas suficientes.');
        return;
      }
      const mkEntry = (id: string): StarEntry => ({
        id,
        userId: uid,
        delta: -reward.starCost,
        reason: 'redemption',
        createdAt: new Date().toISOString(),
      });

      const { data, error } = await supabase.rpc('redeem_reward', { p_reward_id: rewardId });
      if (error) {
        const msg = error.message || '';
        if (error.code === 'PGRST202' || /Could not find the function/i.test(msg)) {
          // Respaldo: la RPC no existe todavía → escritura directa (RLS antigua).
          const entry = mkEntry(newId());
          setDb((prev) => ({ ...prev, stars: [...prev.stars, entry] }));
          void dbInsert('star_entries', rowStar(entry));
          return;
        }
        notifyError('canjear', /NO_STARS/.test(msg) ? 'No tienes estrellas suficientes.' : msg);
        return;
      }
      const res = data as { entry_id?: string } | null;
      setDb((prev) => ({ ...prev, stars: [...prev.stars, mkEntry(res?.entry_id ?? newId())] }));
    },

    // ---- Metas del alumno (las crea el propio alumno) ----
    createGoal(title, target, periodEnd) {
      if (!currentUser) return;
      const goal: Goal = {
        id: newId(),
        userId: currentUser.id,
        title: title.trim(),
        targetValue: Math.max(1, Math.round(target)),
        currentValue: 0,
        periodEnd,
        achieved: false,
        createdAt: new Date().toISOString(),
      };
      setDb((prev) => ({ ...prev, goals: [...prev.goals, goal] }));
      void dbInsert('goals', rowGoal(goal));
    },
    deleteGoal(goalId) {
      setDb((prev) => ({ ...prev, goals: prev.goals.filter((g) => g.id !== goalId) }));
      void dbDelete('goals', goalId);
    },
    // Avance = clases ASISTIDAS dentro de la ventana [createdAt, periodEnd].
    goalProgress(goal) {
      const start = goal.createdAt ?? '1970-01-01T00:00:00.000Z';
      return db.bookings.filter((b) => {
        if (b.userId !== goal.userId || b.status !== 'ATTENDED') return false;
        const s = db.classSessions.find((x) => x.id === b.sessionId);
        return !!s && s.startsAt >= start && s.startsAt <= goal.periodEnd;
      }).length;
    },
    // Valida en el servidor si ya cumplió y, de ser así, la marca y da estrellas.
    async awardGoal(goalId) {
      const goal = db.goals.find((g) => g.id === goalId);
      if (!goal || goal.achieved) return;
      const { data, error } = await supabase.rpc('award_goal', { p_goal_id: goalId });
      if (error) return; // si la RPC no existe aún, no bloqueamos
      const res = data as { achieved?: boolean; stars?: number; progress?: number } | null;
      if (!res?.achieved) {
        if (typeof res?.progress === 'number') {
          const prog = res.progress;
          setDb((prev) => ({
            ...prev,
            goals: prev.goals.map((g) => (g.id === goalId ? { ...g, currentValue: prog } : g)),
          }));
        }
        return;
      }
      const stars = res.stars ?? 0;
      setDb((prev) => ({
        ...prev,
        goals: prev.goals.map((g) => (g.id === goalId ? { ...g, achieved: true } : g)),
        stars:
          stars > 0
            ? [
                ...prev.stars,
                { id: newId(), userId: goal.userId, delta: stars, reason: 'bonus' as const, createdAt: new Date().toISOString() },
              ]
            : prev.stars,
      }));
    },

    upsertPackage(pkg) {
      const studioId = currentUser?.studioId;
      if (!studioId) return;
      const exists = db.packages.some((p) => p.id === pkg.id);
      const row: Package = exists ? pkg : { ...pkg, id: newId(), studioId };
      setDb((prev) => ({
        ...prev,
        packages: exists
          ? prev.packages.map((p) => (p.id === row.id ? row : p))
          : [...prev.packages, row],
      }));
      void dbUpsert('packages', rowPackage(row));
    },
    togglePackageActive(packageId) {
      const p = db.packages.find((x) => x.id === packageId);
      if (!p) return;
      const active = !p.active;
      setDb((prev) => ({
        ...prev,
        packages: prev.packages.map((x) => (x.id === packageId ? { ...x, active } : x)),
      }));
      void dbUpdate('packages', packageId, { active });
    },

    upsertClassTemplate(tpl) {
      const studioId = currentUser?.studioId;
      if (!studioId) return;
      const exists = db.classTemplates.some((t) => t.id === tpl.id);
      const row: ClassTemplate = exists ? tpl : { ...tpl, id: newId(), studioId };
      setDb((prev) => ({
        ...prev,
        classTemplates: exists
          ? prev.classTemplates.map((t) => (t.id === row.id ? row : t))
          : [...prev.classTemplates, row],
      }));
      void dbUpsert('class_templates', rowClassTemplate(row));
    },
    deleteClassTemplate(id) {
      const affected = db.packages.filter((p) => p.eligibleClassIds.includes(id));
      setDb((prev) => ({
        ...prev,
        classTemplates: prev.classTemplates.filter((t) => t.id !== id),
        classSessions: prev.classSessions.filter((s) => s.templateId !== id),
        packages: prev.packages.map((p) => ({
          ...p,
          eligibleClassIds: p.eligibleClassIds.filter((c) => c !== id),
        })),
      }));
      // Orden importante: primero las sesiones (por la relación), luego el tipo.
      void (async () => {
        await dbDeleteWhere('class_sessions', 'template_id', id);
        for (const p of affected) {
          await dbUpdate('packages', p.id, {
            eligible_class_ids: p.eligibleClassIds.filter((c) => c !== id),
          });
        }
        await dbDelete('class_templates', id);
      })();
    },
    upsertSession(s) {
      const studioId = currentUser?.studioId;
      if (!studioId) return;
      const exists = db.classSessions.some((x) => x.id === s.id);
      const row: ClassSession = exists ? s : { ...s, id: newId(), studioId };
      setDb((prev) => ({
        ...prev,
        classSessions: exists
          ? prev.classSessions.map((x) => (x.id === row.id ? row : x))
          : [...prev.classSessions, row],
      }));
      void dbUpsert('class_sessions', rowClassSession(row));
    },
    deleteSession(id) {
      setDb((prev) => ({
        ...prev,
        classSessions: prev.classSessions.filter((s) => s.id !== id),
        bookings: prev.bookings.filter((b) => b.sessionId !== id),
      }));
      void dbDelete('class_sessions', id); // las reservas se borran en cascada
    },

    setCoachStatus(userId, status) {
      setDb((prev) => ({
        ...prev,
        users: prev.users.map((u) => (u.id === userId ? { ...u, coachStatus: status } : u)),
      }));
      void dbUpdate('users', userId, { coach_status: status ?? null });
    },
    upsertCoach(coach) {
      const studioId = currentUser?.studioId;
      if (!studioId) return;
      const exists = db.users.some((u) => u.id === coach.id);
      const row: User = exists ? coach : { ...coach, id: newId(), studioId };
      setDb((prev) => ({
        ...prev,
        users: exists ? prev.users.map((u) => (u.id === row.id ? row : u)) : [...prev.users, row],
      }));
      void dbUpsert('users', rowUser(row));
    },
    updateUserAvatar(userId, avatarUrl) {
      setDb((prev) => ({
        ...prev,
        users: prev.users.map((u) => (u.id === userId ? { ...u, avatarUrl } : u)),
      }));
      void dbUpdate('users', userId, { avatar_url: avatarUrl });
    },
    updateMyProfile(patch) {
      if (!currentUser) return;
      const uid = currentUser.id;
      setDb((prev) => ({
        ...prev,
        users: prev.users.map((u) => {
          if (u.id !== uid) return u;
          const next: User = { ...u };
          if (patch.fullName !== undefined) next.fullName = patch.fullName;
          if (patch.phone !== undefined) next.phone = patch.phone;
          if (patch.bio !== undefined || patch.specialties !== undefined || patch.yearsExp !== undefined) {
            next.coachProfile = {
              bio: patch.bio ?? u.coachProfile?.bio ?? '',
              specialties: patch.specialties ?? u.coachProfile?.specialties ?? [],
              yearsExp: patch.yearsExp ?? u.coachProfile?.yearsExp ?? 0,
            };
          }
          return next;
        }),
      }));
      const row: Record<string, unknown> = {};
      if (patch.fullName !== undefined) row.full_name = patch.fullName;
      if (patch.phone !== undefined) row.phone = patch.phone;
      if (patch.bio !== undefined) row.coach_bio = patch.bio;
      if (patch.specialties !== undefined) row.coach_specialties = patch.specialties;
      if (patch.yearsExp !== undefined) row.coach_years_exp = patch.yearsExp;
      if (Object.keys(row).length) void dbUpdate('users', uid, row);
    },

    addService(name, description, whatsapp) {
      patchStudio((s) => ({
        ...s,
        services: [
          ...s.services,
          { id: newId(), name, description, whatsapp: whatsapp ?? '', enabled: true, custom: true },
        ],
      }));
    },
    updateService(id, patch) {
      patchStudio((s) => ({
        ...s,
        services: s.services.map((sv) => (sv.id === id ? { ...sv, ...patch } : sv)),
      }));
    },
    removeService(id) {
      patchStudio((s) => ({ ...s, services: s.services.filter((sv) => sv.id !== id) }));
    },

    upsertReward(reward) {
      const studioId = currentUser?.studioId;
      if (!studioId) return;
      const exists = db.rewards.some((r) => r.id === reward.id);
      const row: Reward = exists ? reward : { ...reward, id: newId(), studioId };
      setDb((prev) => ({
        ...prev,
        rewards: exists ? prev.rewards.map((r) => (r.id === row.id ? row : r)) : [...prev.rewards, row],
      }));
      void dbUpsert('rewards', rowReward(row));
    },
    deleteReward(id) {
      setDb((prev) => ({ ...prev, rewards: prev.rewards.filter((r) => r.id !== id) }));
      void dbDelete('rewards', id);
    },

    updateStudio(patch) {
      patchStudio((s) => ({ ...s, ...patch }));
    },
    updateBranding(patch) {
      patchStudio((s) => ({ ...s, branding: { ...s.branding, ...patch } }));
    },
    updateWhatsapp(patch) {
      patchStudio((s) => ({ ...s, whatsapp: { ...s.whatsapp, ...patch } }));
    },
    upsertWhatsappTemplate(t) {
      patchStudio((s) => {
        const exists = s.whatsapp.templates.some((x) => x.id === t.id);
        return {
          ...s,
          whatsapp: {
            ...s.whatsapp,
            templates: exists
              ? s.whatsapp.templates.map((x) => (x.id === t.id ? t : x))
              : [...s.whatsapp.templates, { ...t, id: newId() }],
          },
        };
      });
    },
    deleteWhatsappTemplate(id) {
      patchStudio((s) => ({
        ...s,
        whatsapp: { ...s.whatsapp, templates: s.whatsapp.templates.filter((t) => t.id !== id) },
      }));
    },
    addKnowledge(text) {
      patchStudio((s) => ({ ...s, whatsapp: { ...s.whatsapp, knowledge: [...s.whatsapp.knowledge, text] } }));
    },
    removeKnowledge(index) {
      patchStudio((s) => ({
        ...s,
        whatsapp: { ...s.whatsapp, knowledge: s.whatsapp.knowledge.filter((_, i) => i !== index) },
      }));
    },

    // Promo de lanzamiento: paga $1 y activa 14 días de prueba con el plan Pro.
    activatePromo() {
      patchStudio((s) => {
        const end = new Date();
        end.setDate(end.getDate() + (s.subscription.trialDays || 14));
        return {
          ...s,
          subscription: {
            ...s.subscription,
            status: 'TRIALING',
            plan: 'pro', // durante la prueba se habilita el plan Pro completo
            priceUsd: getPlan('pro').priceUsd,
            isPromo: true,
            trialEndsAt: end.toISOString(),
            currentPeriodEnd: end.toISOString(),
          },
        };
      });
    },
    // El estudio elige un plan y queda activo por 30 días.
    subscribeToPlan(plan) {
      patchStudio((s) => {
        const end = new Date();
        end.setDate(end.getDate() + 30);
        return {
          ...s,
          subscription: {
            ...s.subscription,
            status: 'ACTIVE',
            plan,
            priceUsd: getPlan(plan).priceUsd,
            currentPeriodEnd: end.toISOString(),
          },
        };
      });
    },
    markSubscriptionPaid() {
      patchStudio((s) => {
        const end = new Date();
        end.setDate(end.getDate() + 30);
        return {
          ...s,
          subscription: { ...s.subscription, status: 'ACTIVE', currentPeriodEnd: end.toISOString() },
        };
      });
    },
    setSubscriptionPastDue() {
      patchStudio((s) => ({ ...s, subscription: { ...s.subscription, status: 'PAST_DUE' } }));
    },
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

// Compra/registro de un plan: crea UserPackage + Payment (local + Supabase).
function applyPurchase(
  setDb: React.Dispatch<React.SetStateAction<Database>>,
  db: Database,
  userId: string,
  packageId: string,
  method: PaymentMethod,
  registeredBy: 'studio' | 'online',
) {
  const pkg = db.packages.find((p) => p.id === packageId);
  if (!pkg) return;
  const expires = new Date();
  expires.setDate(expires.getDate() + pkg.validityDays);
  const userPackage = {
    id: newId(),
    userId,
    packageId: pkg.id,
    creditsTotal: pkg.classCredits,
    creditsUsed: 0,
    purchasedAt: new Date().toISOString(),
    expiresAt: expires.toISOString(),
    active: true,
  };
  const payment: Payment = {
    id: newId(),
    userId,
    amountUsd: pkg.priceUsd,
    method,
    packageId: pkg.id,
    concept: pkg.name,
    paidAt: new Date().toISOString(),
    registeredBy,
  };
  setDb((prev) => ({
    ...prev,
    userPackages: [...prev.userPackages, userPackage],
    payments: [...prev.payments, payment],
  }));
  // El paquete y el pago referencian a packages(id) por llave foránea. Si por
  // alguna razón la fila del paquete no llegó a guardarse en la base (p. ej. un
  // fallo puntual al crearlo), el insert se rechazaría y el pago no se
  // registraría. Nos aseguramos de que el paquete exista (upsert idempotente)
  // ANTES de insertar el user_package y el pago.
  void (async () => {
    await dbUpsert('packages', rowPackage(pkg));
    await dbInsert('user_packages', rowUserPackage(userPackage));
    await dbInsert('payments', rowPayment(payment));
  })();
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore debe usarse dentro de <StoreProvider>');
  return ctx;
}

export function isSubscriptionActive(studio: Studio | null): boolean {
  if (!studio) return false;
  const { status, currentPeriodEnd } = studio.subscription;
  if (status === 'PAST_DUE' || status === 'CANCELED') return false;
  return new Date(currentPeriodEnd).getTime() > Date.now();
}

// Un paquete es "usable" para reservar si está activo, le quedan créditos y
// aún está dentro de su vigencia (no vencido).
export function isUsablePackage(p: UserPackage): boolean {
  return (
    p.active &&
    p.creditsUsed < p.creditsTotal &&
    new Date(p.expiresAt).getTime() > Date.now()
  );
}

// Traduce los errores de la reserva (RPC book_session) a mensajes claros.
function bookingErrorMessage(msg: string): string {
  if (/FULL/.test(msg)) return 'La clase ya está llena.';
  if (/NO_CREDITS/.test(msg))
    return 'No tienes clases disponibles. Revisa la vigencia de tu paquete o compra uno nuevo.';
  if (/ALREADY/.test(msg)) return 'Ya tienes esta clase reservada.';
  if (/NOT_ALLOWED|NOT_FOUND/.test(msg)) return 'No se pudo reservar esta clase.';
  return 'No se pudo completar la reserva. Inténtalo de nuevo.';
}

// Genera una respuesta simulada del bot con base en la retro/conocimiento.
export function botReply(question: string, knowledge: string[]): string {
  const q = question.toLowerCase();
  const hit = knowledge.find((k) => {
    const words = k.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
    return words.some((w) => q.includes(w));
  });
  if (hit) return hit;
  if (/hola|buenas|buenos/.test(q)) return '¡Hola! 👋 ¿En qué te puedo ayudar hoy?';
  if (/gracias/.test(q)) return '¡Con gusto! Aquí estamos para lo que necesites. 🙌';
  return 'Gracias por tu mensaje. Un miembro del estudio te responderá en breve. Mientras tanto, ¿te ayudo con horarios, pagos o reservas?';
}
