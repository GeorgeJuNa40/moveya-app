import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useStore } from '../../lib/store';
import { COUNTRIES, DEFAULT_COUNTRY_ISO, getCountry } from '../../lib/countries';

type Mode = 'login' | 'join' | 'create' | 'forgot';

// Pantalla de inicio: registro real (crear estudio o unirse por CEU) e inicio
// de sesión, contra Supabase. La redirección la hace App.tsx según el rol.
export default function OnboardingScreen() {
  const { signIn, signUp, sendPasswordReset } = useStore();
  // Si el alumno llega por un link de invitación (?ceu=XXXX), pre-llenamos el
  // código y abrimos directamente el modo "unirse".
  const [searchParams] = useSearchParams();
  const invitedCeu = (searchParams.get('ceu') ?? '').toUpperCase();
  const isCoachInvite = (searchParams.get('role') ?? '').toLowerCase() === 'coach';
  // Desde la landing, "Registra tu estudio" llega con ?nuevo=1 → abre modo crear.
  const wantsCreate = searchParams.get('nuevo') === '1';

  const [mode, setMode] = useState<Mode>(invitedCeu ? 'join' : wantsCreate ? 'create' : 'login');

  const [fullName, setFullName] = useState('');
  const [studioName, setStudioName] = useState('');
  const [ceu, setCeu] = useState(invitedCeu);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [countryIso, setCountryIso] = useState(DEFAULT_COUNTRY_ISO);
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [sentReset, setSentReset] = useState(false); // ya se envió el correo de recuperación

  // Al cambiar de modo limpiamos la contraseña (y datos sensibles) para que los
  // campos no arrastren lo tecleado antes. El navegador seguirá ofreciendo tus
  // credenciales guardadas al hacer clic en el modo "iniciar sesión".
  const changeMode = (m: Mode) => {
    setError('');
    setPassword('');
    setPhone('');
    setBirthDate('');
    setSentReset(false);
    setMode(m);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'forgot') {
        if (!email.trim()) throw new Error('Escribe tu correo.');
        await sendPasswordReset(email);
        setSentReset(true);
      } else if (mode === 'login') {
        await signIn(email, password);
      } else {
        const country = getCountry(countryIso);
        const fullPhone = phone.trim() ? `${country.dial} ${phone.trim()}` : '';
        const contact = { phone: fullPhone, country: country.iso, currency: country.currency };
        if (mode === 'create') {
          if (!studioName.trim()) throw new Error('Escribe el nombre de tu estudio.');
          await signUp({ fullName, email, password, studioName, ...contact });
        } else {
          if (!ceu.trim()) throw new Error('Escribe el Código de Estudio (CEU).');
          if (!birthDate) throw new Error('Indica tu fecha de nacimiento.');
          await signUp({
            fullName,
            email,
            password,
            ceuCode: ceu,
            role: isCoachInvite ? 'COACH' : 'STUDENT',
            birthDate,
            ...contact,
          });
        }
      }
      // Al haber sesión, App.tsx redirige automáticamente al panel según el rol.
    } catch (err) {
      setError(translateError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Panel de marca — el logo en una tarjeta cream, limpio */}
      <div className="hidden lg:flex items-center justify-center bg-forest p-12">
        <div className="brand-float rounded-3xl p-8 shadow-zen" style={{ backgroundColor: '#F6F1E9' }}>
          <img src="/logo-moveya.png" alt="Move yA" className="w-72 h-auto select-none" draggable={false} />
        </div>
      </div>

      {/* Panel de acceso */}
      <div className="flex items-center justify-center bg-cream p-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8 flex justify-center">
            <img src="/logo-moveya.png" alt="Move yA" className="brand-float w-52 h-auto select-none" draggable={false} />
          </div>

          <h1 className="text-2xl font-bold text-ink">
            {mode === 'login'
              ? 'Bienvenido de nuevo'
              : mode === 'forgot'
                ? 'Recupera tu contraseña'
                : mode === 'create'
                  ? 'Crea tu estudio'
                  : isCoachInvite
                    ? 'Únete como coach'
                    : 'Únete a tu estudio'}
          </h1>
          <p className="text-ink-faint mt-1 mb-6">
            {mode === 'login'
              ? 'Ingresa con tu correo y contraseña.'
              : mode === 'forgot'
                ? 'Te enviamos un enlace a tu correo para crear una nueva contraseña.'
                : mode === 'create'
                  ? 'Registra tu estudio y empieza tu prueba.'
                  : isCoachInvite
                    ? 'Regístrate como coach. El estudio deberá aprobarte para que empieces.'
                    : 'Ingresa el Código de Estudio (CEU) que te dieron.'}
          </p>

          <form onSubmit={submit} className="space-y-3">
            {(mode === 'create' || mode === 'join') && (
              <Input label="Tu nombre" value={fullName} onChange={setFullName} placeholder="Ej. Ana López" required />
            )}
            {mode === 'create' && (
              <Input label="Nombre del estudio" value={studioName} onChange={setStudioName} placeholder="Ej. Estudio Zen" required />
            )}
            {mode === 'join' && !invitedCeu && (
              <Input
                label="Código de Estudio (CEU)"
                value={ceu}
                onChange={(v) => setCeu(v.toUpperCase())}
                placeholder="Ej. ZEN-2024"
                required
              />
            )}
            {mode === 'join' && invitedCeu && (
              <div className="rounded-xl border border-cream-dark bg-cream-dark/30 px-4 py-3 text-sm text-ink-soft">
                Te unes con el código{' '}
                <span className="font-mono font-bold text-brand">{invitedCeu}</span>
                {isCoachInvite ? ' como coach.' : '.'} Solo completa tus datos.
              </div>
            )}
            <Input
              label="Correo"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="tu@correo.com"
              required
              name="email"
              autoComplete={mode === 'login' ? 'username' : 'off'}
            />
            {(mode === 'create' || mode === 'join') && (
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-ink-soft">Teléfono (con código de país)</span>
                <div className="flex gap-2">
                  <select
                    value={countryIso}
                    onChange={(e) => setCountryIso(e.target.value)}
                    className="rounded-xl border border-cream-dark bg-white px-2 py-3 outline-none focus:ring-2 ring-brand"
                    aria-label="País"
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c.iso} value={c.iso}>
                        {c.flag} {c.dial}
                      </option>
                    ))}
                  </select>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="55 1234 5678"
                    className="w-full rounded-xl border border-cream-dark bg-white px-4 py-3 outline-none focus:ring-2 ring-brand"
                  />
                </div>
                {mode === 'create' && (
                  <span className="mt-1 block text-xs text-ink-faint">
                    Definimos la moneda de tu estudio según tu país: {getCountry(countryIso).currency}.
                  </span>
                )}
              </label>
            )}
            {mode === 'join' && (
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-ink-soft">Fecha de nacimiento</span>
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="w-full rounded-xl border border-cream-dark bg-white px-4 py-3 outline-none focus:ring-2 ring-brand"
                />
              </label>
            )}
            {mode !== 'forgot' && (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-soft">Contraseña</span>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  required
                  name="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-cream-dark bg-white px-4 py-3 pr-12 outline-none focus:ring-2 ring-brand"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 grid w-12 place-items-center text-lg text-ink-faint"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </label>
            )}

            {mode === 'login' && (
              <button
                type="button"
                onClick={() => changeMode('forgot')}
                className="block text-sm text-brand hover:underline"
              >
                ¿Olvidaste tu contraseña?
              </button>
            )}

            {mode === 'forgot' && sentReset && (
              <p className="rounded-xl bg-mint-soft/40 px-4 py-3 text-sm text-ink-soft">
                Listo ✓ Si <strong>{email}</strong> está registrado, te llegará un correo con el enlace
                para crear tu nueva contraseña. Revisa también la carpeta de spam.
              </p>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-brand px-4 py-3 font-semibold text-cream shadow-zen hover:opacity-90 disabled:opacity-60"
            >
              {busy
                ? 'Un momento…'
                : mode === 'login'
                  ? 'Iniciar sesión'
                  : mode === 'forgot'
                    ? 'Enviar enlace de recuperación'
                    : 'Crear cuenta'}
            </button>
          </form>

          {/* Cambiar de modo */}
          <div className="mt-6 space-y-2 text-sm">
            {(mode === 'create' || mode === 'join') && (
              <button onClick={() => changeMode('login')} className="text-ink-faint hover:text-ink">
                ¿Ya tienes cuenta? <span className="text-brand font-medium">Inicia sesión</span>
              </button>
            )}
            {mode === 'login' && (
              <>
                <button onClick={() => changeMode('join')} className="block text-ink-faint hover:text-ink">
                  ¿Tienes un CEU? <span className="text-brand font-medium">Únete a tu estudio</span>
                </button>
                <button onClick={() => changeMode('create')} className="block text-ink-faint hover:text-ink">
                  ¿Eres un estudio nuevo? <span className="text-brand font-medium">Crea tu cuenta</span>
                </button>
              </>
            )}
          </div>

          {/* Aviso legal: navegación INTERNA (Link) a Términos y Privacidad. Así no
              recarga la app ni depende de la red, y se puede regresar. */}
          <p className="mt-6 text-center text-xs leading-relaxed text-ink-faint">
            {mode === 'login' ? 'Al usar Move yA aceptas nuestros' : 'Al crear tu cuenta aceptas nuestros'}{' '}
            <Link to="/terms" className="font-medium text-brand hover:underline">Términos</Link>{' '}y el{' '}
            <Link to="/privacy" className="font-medium text-brand hover:underline">Aviso de Privacidad</Link>.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes brandFloat { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-8px);} }
        .brand-float{ animation: brandFloat 4s ease-in-out infinite; }
      `}</style>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required,
  name,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  name?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink-soft">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        name={name}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-cream-dark bg-white px-4 py-3 outline-none focus:ring-2 ring-brand"
      />
    </label>
  );
}

// Traduce los errores técnicos de Supabase a mensajes claros en español.
function translateError(err: unknown): string {
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  if (/Invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos.';
  if (/User already registered/i.test(msg)) return 'Ese correo ya está registrado. Inicia sesión.';
  if (/Database error saving new user/i.test(msg))
    return 'No se pudo completar el registro. Verifica que el CEU exista o el nombre del estudio.';
  if (/Password should be at least/i.test(msg)) return 'La contraseña debe tener al menos 6 caracteres.';
  if (/rate limit|too many|only request this once|for security purposes|\bseconds\b/i.test(msg))
    return 'Demasiados intentos. Espera un minuto e inténtalo de nuevo.';
  if (/error sending|sending.*(email|recovery|confirmation)|recovery email|confirmation email|smtp/i.test(msg))
    return 'No pudimos enviar el correo en este momento. Inténtalo en un minuto; si sigue, falta configurar el correo del sistema (SMTP).';
  if (/CEU/i.test(msg)) return msg;
  const clean = msg.trim();
  if (!clean || clean === '{}' || clean === '[object Object]') return 'Ocurrió un error. Inténtalo de nuevo.';
  return clean;
}
