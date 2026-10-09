import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useStore } from '../../lib/store';
import { accessCheckIn, fmtDur } from '../../lib/access';

// Pantalla de registro de entrada (check-in). Se abre al escanear un QR:
//   • QR fijo de recepción → el miembro (en sesión) registra SU entrada.
//   • QR personal del miembro → el staff (en sesión) registra al miembro (?u=).
// Funciona a pantalla completa, fuera del AppShell.
type State = 'loading' | 'need-login' | 'ok' | 'dup' | 'error';

export default function Checkin() {
  const { currentUser, authLoading } = useStore();
  const [params] = useSearchParams();
  const targetUser = params.get('u') ?? ''; // presente cuando el staff escanea a un miembro
  const [state, setState] = useState<State>('loading');
  const [name, setName] = useState('');
  const [active, setActive] = useState(false);
  const [action, setAction] = useState<'in' | 'out'>('in');
  const [durationMin, setDurationMin] = useState<number | undefined>(undefined);
  const [errMsg, setErrMsg] = useState('');
  const done = useRef(false);

  useEffect(() => {
    if (authLoading || done.current) return;
    if (!currentUser) {
      setState('need-login');
      return;
    }
    done.current = true;
    (async () => {
      try {
        const res = await accessCheckIn(targetUser || undefined, targetUser ? 'staff_qr' : 'member_qr');
        setName(res.name);
        setActive(res.active);
        setAction(res.action);
        setDurationMin(res.durationMin);
        setState(res.duplicate ? 'dup' : 'ok');
      } catch (e) {
        setErrMsg(translate((e as Error)?.message ?? ''));
        setState('error');
      }
    })();
  }, [authLoading, currentUser, targetUser]);

  return (
    <div className="min-h-screen grid place-items-center bg-cream p-6 text-center">
      <div className="w-full max-w-sm">
        {(state === 'loading' || authLoading) && (
          <p className="text-lg font-semibold text-brand animate-pulse">Registrando tu acceso…</p>
        )}

        {state === 'need-login' && (
          <div className="rounded-3xl bg-white p-8 shadow-zen">
            <div className="text-4xl">🔒</div>
            <h1 className="mt-3 text-xl font-bold text-ink">Inicia sesión para registrar tu entrada</h1>
            <p className="mt-2 text-sm text-ink-soft">Entra a tu cuenta y vuelve a escanear el código.</p>
            <Link
              to="/entrar"
              className="mt-5 inline-block rounded-xl bg-brand px-5 py-3 font-semibold text-cream shadow-zen"
            >
              Iniciar sesión
            </Link>
          </div>
        )}

        {(state === 'ok' || state === 'dup') && (
          <div className="rounded-3xl bg-white p-8 shadow-zen">
            <div className="text-6xl">{state === 'dup' ? 'ℹ️' : action === 'out' ? '👋' : '✅'}</div>
            <h1 className="mt-3 text-2xl font-bold text-ink">
              {state === 'dup'
                ? '¡Ya estaba registrado!'
                : action === 'out'
                  ? '¡Salida registrada!'
                  : '¡Entrada registrada!'}
            </h1>
            {name && <p className="mt-1 text-lg font-semibold text-brand">{name}</p>}
            {action === 'out' && durationMin != null ? (
              <p className="mt-3 text-sm font-medium text-ink-soft">⏱️ Permaneciste {fmtDur(durationMin)}</p>
            ) : (
              <p className={`mt-3 text-sm font-medium ${active ? 'text-green-700' : 'text-amber-700'}`}>
                {active ? '🔓 Membresía activa · acceso permitido' : '⚠️ Sin membresía activa · pásalo a recepción'}
              </p>
            )}
            <p className="mt-4 text-xs text-ink-faint">
              {new Date().toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
            <Link to="/" className="mt-5 inline-block text-sm font-medium text-brand">
              Ir a mi app
            </Link>
          </div>
        )}

        {state === 'error' && (
          <div className="rounded-3xl bg-white p-8 shadow-zen">
            <div className="text-5xl">😕</div>
            <h1 className="mt-3 text-xl font-bold text-ink">No se pudo registrar</h1>
            <p className="mt-2 text-sm text-ink-soft">{errMsg}</p>
            <Link to="/" className="mt-5 inline-block text-sm font-medium text-brand">
              Volver
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function translate(msg: string): string {
  if (/NOT_ALLOWED/.test(msg)) return 'No tienes permiso para registrar este acceso.';
  if (/NOT_FOUND/.test(msg)) return 'No encontramos a ese miembro.';
  return 'Ocurrió un error. Inténtalo de nuevo.';
}
