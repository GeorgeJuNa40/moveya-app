import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useStore, isUsablePackage } from '../../lib/store';
import { Card, Button } from '../../components/ui';
import { fmtDay, fmtTime, daysUntil } from '../../lib/format';

// Anillo de progreso circular (estilo "Weekly Goal"). El color del arco usa la
// marca del estudio (white-label); la pista es crema.
function ProgressRing({ pct, children }: { pct: number; children: ReactNode }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(1, Math.max(0, pct));
  return (
    <div className="relative grid h-44 w-44 place-items-center">
      <svg viewBox="0 0 128 128" className="h-44 w-44 -rotate-90">
        <circle cx="64" cy="64" r={r} fill="none" strokeWidth="11" stroke="#E8E3D6" />
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          strokeWidth="11"
          strokeLinecap="round"
          stroke="var(--brand-primary)"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped)}
          style={{ transition: 'stroke-dashoffset 0.7s ease' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

// Chip de estadística compacto.
function StatChip({ icon, value, label }: { icon: string; value: ReactNode; label: string }) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-soft text-lg text-brand">
        {icon}
      </div>
      <div>
        <p className="text-xl font-bold leading-none text-ink">{value}</p>
        <p className="mt-1 text-xs text-ink-faint">{label}</p>
      </div>
    </Card>
  );
}

export default function StudentDashboard() {
  const { db, currentUser, currentStudio, starBalance, availableCredits } = useStore();
  const uid = currentUser!.id;
  const photos = currentStudio!.photos;

  const data = useMemo(() => {
    const myBookings = db.bookings
      .filter((b) => b.userId === uid && b.status !== 'CANCELED')
      .map((b) => ({ booking: b, session: db.classSessions.find((s) => s.id === b.sessionId)! }))
      .filter((x) => x.session && new Date(x.session.startsAt).getTime() > Date.now())
      .sort((a, b) => a.session.startsAt.localeCompare(b.session.startsAt));

    const activePkg = db.userPackages.find((p) => p.userId === uid && isUsablePackage(p)) ?? null;
    return { myBookings, activePkg };
  }, [db, uid]);

  const creditsLeft = availableCredits(uid);
  const stars = starBalance(uid);
  const firstName = currentUser!.fullName.split(' ')[0];
  const next = data.myBookings[0];
  const nextTpl = next ? db.classTemplates.find((t) => t.id === next.session.templateId) : null;
  const nextCoach = next ? db.users.find((u) => u.id === next.session.coachId) : null;

  // Membresía de acceso libre vigente (gimnasio/mixto): se muestra por vigencia,
  // no por créditos. Tiene prioridad en el hero.
  const accessPkg = db.userPackages.find((p) => p.userId === uid && p.kind === 'access' && isUsablePackage(p)) ?? null;
  const heroPkg = accessPkg ?? data.activePkg;

  // Progreso del anillo: acceso libre = lleno; si no, clases disponibles / total.
  const pkgTotal = data.activePkg?.creditsTotal ?? 0;
  const ringPct = accessPkg ? 1 : pkgTotal > 0 ? creditsLeft / pkgTotal : creditsLeft > 0 ? 1 : 0;

  return (
    <div className="space-y-6">
      {/* Saludo */}
      <div>
        <p className="text-sm text-ink-faint">Hola de nuevo ✦</p>
        <h1 className="text-3xl font-black tracking-tight text-ink">{firstName}</h1>
      </div>

      {/* Hero: anillo de progreso + próxima clase */}
      <Card className="relative overflow-hidden p-6">
        {/* blobs orgánicos suaves */}
        <div className="brand-blob absolute -right-10 -top-10 h-40 w-40 rounded-full" />
        <div className="brand-blob absolute -bottom-14 -left-10 h-40 w-40 rounded-full opacity-70" />

        <div className="relative flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-5">
            <ProgressRing pct={ringPct}>
              {accessPkg ? (
                <div>
                  <p className="text-3xl">🔓</p>
                  <p className="text-xs font-medium text-ink-faint">Acceso libre</p>
                </div>
              ) : (
                <div>
                  <p className="text-4xl font-black text-ink">{creditsLeft}</p>
                  <p className="text-xs font-medium text-ink-faint">clases disponibles</p>
                </div>
              )}
            </ProgressRing>
            <div className="hidden sm:block">
              {heroPkg ? (
                <>
                  <p className="text-xs uppercase tracking-wide text-ink-faint">{accessPkg ? 'Tu membresía' : 'Tu paquete'}</p>
                  <p className="text-lg font-bold text-ink">
                    {db.packages.find((p) => p.id === heroPkg.packageId)?.name}
                  </p>
                  <p className="mt-1 text-sm text-ink-soft">
                    Vence en {daysUntil(heroPkg.expiresAt)} días
                  </p>
                </>
              ) : (
                <>
                  <p className="text-lg font-bold text-ink">Sin plan activo</p>
                  <p className="mt-1 text-sm text-ink-soft">Compra uno para reservar clases.</p>
                </>
              )}
            </div>
          </div>

          <Link to="/app/book" className="w-full sm:w-auto">
            <Button className="w-full sm:w-auto">Reservar clase</Button>
          </Link>
        </div>
      </Card>

      {/* Próxima clase */}
      <Card className="p-5">
        <p className="text-xs uppercase tracking-wide text-ink-faint">Próxima clase</p>
        {next && nextTpl ? (
          <div className="mt-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-lg font-bold text-ink">{nextTpl.name}</p>
              <p className="mt-0.5 text-sm text-ink-soft">
                {fmtDay(next.session.startsAt)} · {fmtTime(next.session.startsAt)}
                {nextCoach ? ` · ${nextCoach.fullName}` : ''}
              </p>
            </div>
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-6 w-6">
                <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
                <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        ) : (
          <div className="mt-3 rounded-2xl bg-cream-light p-5 text-center">
            <p className="text-sm text-ink-soft">
              Tu calendario está en calma 🧘 —{' '}
              <Link to="/app/book" className="font-semibold text-brand">
                reserva tu primera clase
              </Link>
              .
            </p>
          </div>
        )}
      </Card>

      {/* Chips */}
      <div className="grid grid-cols-2 gap-4">
        <StatChip icon="★" value={stars} label="Estrellas" />
        <StatChip icon="✦" value={data.myBookings.length} label="Próximas reservas" />
      </div>

      {/* Conoce el estudio */}
      {photos.length > 0 && (
        <div>
          <h2 className="mb-3 font-semibold text-ink">Conoce {currentStudio!.branding.logoText}</h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {photos.map((p, i) => (
              <img
                key={i}
                src={p}
                alt=""
                className="h-32 w-48 shrink-0 rounded-2xl object-cover shadow-soft"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
