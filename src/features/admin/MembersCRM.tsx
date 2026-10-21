import { useMemo, useState } from 'react';
import { useStore } from '../../lib/store';
import { PageHeader, Card, Badge, Button, StatCard } from '../../components/ui';
import Avatar from '../../components/Avatar';
import { fmtDay, fmtTime, fmtDate, usd } from '../../lib/format';
import { PERIOD_NOUN, PERIOD_DAYS, periodOf } from '../../lib/periods';
import type { MembershipState, Package, Payment, PaymentMethod, User } from '../../lib/types';

const STATE_META: Record<MembershipState, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  active: { label: 'Activa', tone: 'success' },
  expiring: { label: 'Por vencer', tone: 'warning' },
  expired: { label: 'Vencida', tone: 'danger' },
  none: { label: 'Sin plan', tone: 'neutral' },
};

// De dónde llegó el alumno (si vino como invitado y luego se registró).
const ORIGIN_LABEL: Record<'trial' | 'companion', string> = {
  trial: 'Llegó de prueba',
  companion: 'Llegó por 2×1',
};

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  paypal: 'PayPal',
};

// Origen del pago: en el estudio (manual) o en línea (tarjeta / pasarela).
const SOURCE_LABEL: Record<'studio' | 'online', string> = {
  studio: 'En estudio',
  online: 'En línea',
};

// Formatea el cumpleaños (día y mes) desde una fecha ISO YYYY-MM-DD.
const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function fmtBirthday(iso?: string): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  return `${d} ${MONTHS_ES[m - 1]}`;
}

// CRM de alumnos: contacto, clases agendadas, membresía y registro de pagos.
export default function MembersCRM() {
  const { db, currentStudio, currentUser, studioUsers, membership, registerManualPlan, removeUserPackage, addMember, isNewStudent, pendingPenalty, settlePenalty, waivePenalty, setStudentExternalCoach, setUserBranch, setMemberStatus, deleteMember, pendingMembership, settleMembershipPayment, waiveMembershipPending, updateMemberProfile } = useStore();
  // Etiqueta del adeudo de mensualidad según el periodo del paquete del alumno.
  const pendingLabel = (userId: string): string | null => {
    const up = pendingMembership(userId);
    if (!up) return null;
    const pk = db.packages.find((p) => p.id === up.packageId);
    return `Pago pendiente · ${pk ? PERIOD_NOUN[periodOf(pk)] : 'mensualidad'}`;
  };
  // El operador/recepción opera pero NO gestiona estado ni elimina miembros.
  const canManageMembers = currentUser?.role !== 'OPERATOR';
  const students = studioUsers('STUDENT');
  const packages = db.packages.filter((p) => p.studioId === currentStudio!.id && p.active);
  const isGymish = currentStudio!.studioType === 'gym' || currentStudio!.studioType === 'mixed';
  const branches = currentStudio!.branches ?? [];
  const branchName = (id?: string) => branches.find((b) => b.id === id)?.name;
  const externalCoaches = useMemo(
    () => studioUsers('COACH').filter((c) => c.coachType === 'externo'),
    [studioUsers],
  );
  const coachName = (id?: string) => externalCoaches.find((c) => c.id === id)?.fullName;

  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState<User | null>(null);
  const [payFor, setPayFor] = useState<User | null>(null);
  const [adding, setAdding] = useState(false);
  // Vista: miembros activos o dados de baja/vetados.
  const [view, setView] = useState<'active' | 'inactive'>('active');

  const studentIds = useMemo(() => new Set(students.map((s) => s.id)), [students]);
  const isActiveMember = (u: User) => (u.memberStatus ?? 'active') === 'active';
  const inactiveCount = useMemo(() => students.filter((s) => !isActiveMember(s)).length, [students]);

  const filtered = useMemo(
    () =>
      students
        .filter((s) => (view === 'active' ? isActiveMember(s) : !isActiveMember(s)))
        .filter((s) =>
          `${s.fullName} ${s.email} ${s.phone}`.toLowerCase().includes(query.toLowerCase()),
        ),
    [students, query, view],
  );

  const summary = useMemo(() => {
    let active = 0, expiring = 0, expired = 0, none = 0;
    for (const s of students) {
      const st = membership(s.id).state;
      if (st === 'active') active++;
      else if (st === 'expiring') expiring++;
      else if (st === 'expired') expired++;
      else none++;
    }
    const income = db.payments
      .filter((p) => studentIds.has(p.userId))
      .reduce((a, p) => a + p.amountUsd, 0);
    return { active, expiring, expired, none, income };
  }, [students, membership, db.payments, studentIds]);

  const bookingsOf = (userId: string) =>
    db.bookings
      .filter((b) => b.userId === userId && b.status !== 'CANCELED')
      .map((b) => ({ b, s: db.classSessions.find((x) => x.id === b.sessionId)! }))
      .filter((x) => x.s)
      .sort((a, b) => a.s.startsAt.localeCompare(b.s.startsAt));

  const paymentsOf = (userId: string) =>
    db.payments.filter((p) => p.userId === userId).sort((a, b) => b.paidAt.localeCompare(a.paidAt));

  const lastPaymentOf = (userId: string): Payment | undefined => paymentsOf(userId)[0];

  return (
    <>
      <PageHeader
        title="Miembros (CRM)"
        subtitle="Alumnos registrados, sus clases, membresías y pagos"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setAdding(true)}>+ Agregar miembro</Button>
            <Button onClick={() => setPayFor(students[0] ?? null)}>+ Registrar pago</Button>
          </div>
        }
      />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5 mb-6">
        <StatCard label="Total alumnos" value={students.length} icon="⚇" />
        <StatCard label="Membresías activas" value={summary.active} icon="✓" />
        <StatCard label="Por vencer" value={summary.expiring} icon="⏳" />
        <StatCard label="Vencidas / sin plan" value={summary.expired + summary.none} icon="•" />
        <StatCard label="Ingresos registrados" value={usd(summary.income)} icon="$" />
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por nombre, correo o teléfono…"
        className="mb-3 w-full rounded-xl border border-cream-dark bg-white px-4 py-2.5 outline-none focus:ring-2 ring-brand"
      />

      <div className="mb-4 flex gap-2">
        {([
          { v: 'active', t: 'Activos' },
          { v: 'inactive', t: `Dados de baja${inactiveCount ? ` (${inactiveCount})` : ''}` },
        ] as const).map((opt) => (
          <button
            key={opt.v}
            onClick={() => setView(opt.v)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium border transition ${view === opt.v ? 'bg-brand text-cream border-brand' : 'bg-white text-ink-soft border-cream-dark'}`}
          >
            {opt.t}
          </button>
        ))}
      </div>

      {/* Tabla (desktop) */}
      <Card className="hidden md:block overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-cream-dark/50 text-left text-ink-soft">
              <tr>
                <th className="px-4 py-3 font-semibold">Alumno</th>
                <th className="px-4 py-3 font-semibold">Contacto</th>
                <th className="px-4 py-3 font-semibold">Clases</th>
                <th className="px-4 py-3 font-semibold">Plan</th>
                <th className="px-4 py-3 font-semibold">Último pago</th>
                <th className="px-4 py-3 font-semibold">Membresía</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-dark">
              {filtered.map((s) => {
                const m = membership(s.id);
                const meta = STATE_META[m.state];
                const classCount = bookingsOf(s.id).length;
                const last = lastPaymentOf(s.id);
                return (
                  <tr key={s.id} className="hover:bg-cream-dark/20">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar url={s.avatarUrl} initials={s.avatarInitials} className="h-8 w-8 text-xs" />
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="font-medium text-ink">{s.fullName}</p>
                            {isNewStudent(s.id) && (
                              <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand">Nuevo</span>
                            )}
                            {s.source && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">{ORIGIN_LABEL[s.source]}</span>
                            )}
                            {!isActiveMember(s) && (
                              <span className="rounded-full bg-cream-dark px-2 py-0.5 text-[10px] font-semibold text-ink-soft">{s.memberStatus === 'banned' ? 'Vetado' : 'Baja'}</span>
                            )}
                          </div>
                          <p className="text-xs text-ink-faint">Alta {fmtDay(s.createdAt)}</p>
                          {fmtBirthday(s.birthDate) && (
                            <p className="text-xs text-ink-faint">🎂 {fmtBirthday(s.birthDate)}</p>
                          )}
                          {coachName(s.externalCoachId) && (
                            <p className="text-xs text-ink-faint">🧑‍🏫 Externo: {coachName(s.externalCoachId)}</p>
                          )}
                          {branchName(s.branchId) && (
                            <p className="text-xs text-ink-faint">📍 {branchName(s.branchId)}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">
                      <p>{s.phone}</p>
                      <p className="text-xs text-ink-faint">{s.email}</p>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{classCount}</td>
                    <td className="px-4 py-3 text-ink-soft">{m.planName ?? '—'}</td>
                    <td className="px-4 py-3 text-ink-soft">
                      {last ? (
                        <div>
                          <p>{usd(last.amountUsd)} · {METHOD_LABEL[last.method]}</p>
                          <p className="text-xs text-ink-faint">{SOURCE_LABEL[last.registeredBy]} · {fmtDay(last.paidAt)}</p>
                        </div>
                      ) : (
                        <span className="text-ink-faint">Sin pagos</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      {m.state !== 'none' && m.state !== 'expired' && m.expiresAt && (
                        <span className="ml-2 text-xs text-ink-faint">
                          Vence {fmtDate(m.expiresAt)}{m.creditsLeft > 0 ? ` · ${m.creditsLeft} clases` : ''}
                        </span>
                      )}
                      {pendingLabel(s.id) && (
                        <span className="mt-1 block w-fit rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                          💰 {pendingLabel(s.id)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => setDetail(s)} className="text-brand font-medium mr-3">Ver</button>
                      <button onClick={() => setPayFor(s)} className="text-brand font-medium">Registrar pago</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Cards (mobile) */}
      <div className="md:hidden space-y-3">
        {filtered.map((s) => {
          const m = membership(s.id);
          const meta = STATE_META[m.state];
          const last = lastPaymentOf(s.id);
          return (
            <Card key={s.id} className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="font-medium text-ink">{s.fullName}</p>
                    {isNewStudent(s.id) && (
                      <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand">Nuevo</span>
                    )}
                    {s.source && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">{ORIGIN_LABEL[s.source]}</span>
                    )}
                  </div>
                  <p className="text-xs text-ink-faint">{s.phone} · {s.email}</p>
                  {coachName(s.externalCoachId) && (
                    <p className="text-xs text-ink-faint">🧑‍🏫 Externo: {coachName(s.externalCoachId)}</p>
                  )}
                  {branchName(s.branchId) && (
                    <p className="text-xs text-ink-faint">📍 {branchName(s.branchId)}</p>
                  )}
                </div>
                <Badge tone={meta.tone}>{meta.label}</Badge>
              </div>
              <p className="mt-2 text-sm text-ink-soft">
                {m.planName ?? 'Sin plan'}
                {m.state !== 'none' && m.state !== 'expired' && m.expiresAt ? ` · vence ${fmtDate(m.expiresAt)}` : ''}
              </p>
              <p className="mt-1 text-xs text-ink-faint">
                {last ? `Últ. pago: ${usd(last.amountUsd)} · ${METHOD_LABEL[last.method]} (${SOURCE_LABEL[last.registeredBy]})` : 'Sin pagos registrados'}
              </p>
              {pendingLabel(s.id) && (
                <p className="mt-1 w-fit rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">💰 {pendingLabel(s.id)}</p>
              )}
              {pendingPenalty(s.id) > 0 && (
                <p className="mt-1 text-xs font-semibold text-amber-700">Adeudo por no asistir: {usd(pendingPenalty(s.id))}</p>
              )}
              <div className="mt-3 flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => setDetail(s)}>Ver</Button>
                <Button className="flex-1" onClick={() => setPayFor(s)}>Registrar pago</Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Detalle del alumno */}
      {detail && (
        <Modal onClose={() => setDetail(null)}>
          {(() => {
            const m = membership(detail.id);
            const meta = STATE_META[m.state];
            const classes = bookingsOf(detail.id);
            const pays = paymentsOf(detail.id);
            return (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <Avatar url={detail.avatarUrl} initials={detail.avatarInitials} className="h-12 w-12 text-base" />
                  <div>
                    <h2 className="text-lg font-bold text-ink">{detail.fullName}</h2>
                    <p className="text-sm text-ink-faint">{detail.phone} · {detail.email}</p>
                    {fmtBirthday(detail.birthDate) && (
                      <p className="text-sm text-ink-faint">🎂 Cumpleaños: {fmtBirthday(detail.birthDate)}</p>
                    )}
                  </div>
                </div>
                <MemberEditCard
                  key={detail.id}
                  member={detail}
                  onSave={(patch) => { updateMemberProfile(detail.id, patch); setDetail({ ...detail, ...patch }); }}
                />

                <div className="flex items-center gap-2 mb-4">
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                  <span className="text-sm text-ink-soft">{m.planName ?? 'Sin plan'}</span>
                  {m.state !== 'none' && m.expiresAt && (
                    <span className="text-sm text-ink-faint">
                      · vence el {fmtDate(m.expiresAt)}{m.creditsLeft > 0 ? ` · ${m.creditsLeft} clases` : ''}
                    </span>
                  )}
                </div>

                {/* Adeudo de mensualidad (pago pendiente): registrar el pago o condonar. */}
                {(() => {
                  const up = pendingMembership(detail.id);
                  if (!up) return null;
                  const pk = db.packages.find((p) => p.id === up.packageId);
                  return (
                    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <p className="text-sm font-semibold text-amber-800">💰 Pago pendiente de {pk ? PERIOD_NOUN[periodOf(pk)] : 'mensualidad'}</p>
                      <p className="mt-0.5 text-xs text-amber-700">
                        {pk ? `${pk.name} · ${usd(pk.priceUsd)}` : ''}
                        {up.pendingDue ? ` · acordado el ${fmtDate(up.pendingDue)}` : ''} · acceso vence {fmtDate(up.expiresAt)}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-amber-800">Registrar pago:</span>
                        {(['cash', 'card', 'transfer'] as PaymentMethod[]).map((mth) => (
                          <Button key={mth} variant="secondary" onClick={() => { settleMembershipPayment(up.id, mth); setDetail({ ...detail }); }}>
                            {METHOD_LABEL[mth]}
                          </Button>
                        ))}
                        <Button variant="ghost" onClick={() => { waiveMembershipPending(up.id); setDetail({ ...detail }); }}>Condonar</Button>
                      </div>
                    </div>
                  );
                })()}

                {/* Planes/paquetes asignados: corregir un cobro mal capturado. */}
                {(() => {
                  const ups = db.userPackages
                    .filter((p) => p.userId === detail.id)
                    .sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));
                  if (ups.length === 0) return null;
                  return (
                    <div className="mb-4 rounded-xl bg-cream-dark/40 p-3">
                      <p className="mb-2 text-sm font-medium text-ink-soft">Planes asignados</p>
                      <div className="space-y-2">
                        {ups.map((up) => {
                          const pk = db.packages.find((k) => k.id === up.packageId);
                          const vig = new Date(up.expiresAt).getTime() > Date.now() && up.active;
                          return (
                            <div key={up.id} className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-ink">{pk?.name ?? 'Paquete'}</p>
                                <p className="text-xs text-ink-faint">
                                  {vig ? 'Vigente' : 'Vencido/!activo'} · vence {fmtDate(up.expiresAt)}
                                  {up.kind !== 'access' ? ` · ${Math.max(0, up.creditsTotal - up.creditsUsed)}/${up.creditsTotal} clases` : ''}
                                </p>
                              </div>
                              <button
                                onClick={() => {
                                  const alsoPay = window.confirm(
                                    `¿Quitar el plan "${pk?.name ?? 'Paquete'}" de ${detail.fullName}?\n\nAceptar = quitar también el PAGO registrado con ese plan.\nCancelar = elegir si lo quitas sin pago.`,
                                  );
                                  if (!alsoPay) {
                                    if (!window.confirm('¿Quitar solo el plan y CONSERVAR el pago registrado?')) return;
                                    removeUserPackage(up.id);
                                  } else {
                                    removeUserPackage(up.id, { removePayment: true });
                                  }
                                  setDetail({ ...detail });
                                }}
                                className="shrink-0 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                              >
                                Quitar
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      <p className="mt-2 text-xs text-ink-faint">Úsalo para corregir un cobro mal capturado: quita el plan equivocado y vuelve a registrar el correcto.</p>
                    </div>
                  );
                })()}

                {branches.length > 0 && (
                  <div className="mb-4 rounded-xl bg-cream-dark/40 px-3 py-3">
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-ink-soft">Sucursal</span>
                      <select
                        className="w-full rounded-xl border border-cream-dark bg-white px-3 py-2 text-sm outline-none focus:ring-2 ring-brand"
                        value={detail.branchId ?? ''}
                        onChange={(e) => {
                          const val = e.target.value || null;
                          setUserBranch(detail.id, val);
                          setDetail({ ...detail, branchId: val ?? undefined });
                        }}
                      >
                        <option value="">— Sede principal —</option>
                        {branches.map((br) => (
                          <option key={br.id} value={br.id}>{br.name}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}

                {isGymish && externalCoaches.length > 0 && (
                  <div className="mb-4 rounded-xl bg-cream-dark/40 px-3 py-3">
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-ink-soft">Coach externo (alumno que trae un externo)</span>
                      <select
                        className="w-full rounded-xl border border-cream-dark bg-white px-3 py-2 text-sm outline-none focus:ring-2 ring-brand"
                        value={detail.externalCoachId ?? ''}
                        onChange={(e) => {
                          const val = e.target.value || null;
                          setStudentExternalCoach(detail.id, val);
                          setDetail({ ...detail, externalCoachId: val ?? undefined });
                        }}
                      >
                        <option value="">— Alumno del gimnasio —</option>
                        {externalCoaches.map((c) => (
                          <option key={c.id} value={c.id}>{c.fullName}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}

                <h3 className="font-semibold text-ink text-sm mb-2">Clases agendadas ({classes.length})</h3>
                <div className="space-y-1.5 mb-4 max-h-40 overflow-y-auto">
                  {classes.length === 0 && <p className="text-sm text-ink-faint">Sin clases agendadas.</p>}
                  {classes.map(({ b, s }) => {
                    const tpl = db.classTemplates.find((t) => t.id === s.templateId);
                    return (
                      <div key={b.id} className="flex justify-between rounded-lg bg-cream-dark/40 px-3 py-1.5 text-sm">
                        <span className="text-ink">{tpl?.name}</span>
                        <span className="text-ink-faint">{fmtDay(s.startsAt)} {fmtTime(s.startsAt)}</span>
                      </div>
                    );
                  })}
                </div>

                <h3 className="font-semibold text-ink text-sm mb-2">Historial de pagos ({pays.length})</h3>
                <div className="space-y-1.5 mb-4 max-h-40 overflow-y-auto">
                  {pays.length === 0 && <p className="text-sm text-ink-faint">Sin pagos registrados.</p>}
                  {pays.map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-lg bg-cream-dark/40 px-3 py-2 text-sm">
                      <div>
                        <p className="text-ink">{p.concept}</p>
                        <p className="text-xs text-ink-faint">
                          {METHOD_LABEL[p.method]} · {SOURCE_LABEL[p.registeredBy]} · {fmtDay(p.paidAt)}
                        </p>
                      </div>
                      <span className="font-semibold text-brand">{usd(p.amountUsd)}</span>
                    </div>
                  ))}
                </div>

                {(() => {
                  const pens = db.bookings
                    .filter((b) => b.userId === detail.id && (b.penaltyUsd ?? 0) > 0)
                    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
                  if (pens.length === 0) return null;
                  return (
                    <>
                      <h3 className="font-semibold text-ink text-sm mb-2">Adeudos por no asistir ({pens.length})</h3>
                      <div className="space-y-1.5 mb-4 max-h-40 overflow-y-auto">
                        {pens.map((b) => {
                          const s = db.classSessions.find((x) => x.id === b.sessionId);
                          return (
                            <div key={b.id} className="flex items-center justify-between gap-2 rounded-lg bg-cream-dark/40 px-3 py-2 text-sm">
                              <div>
                                <p className="text-ink">
                                  {usd(b.penaltyUsd ?? 0)}{' '}
                                  {b.penaltyPaid ? <span className="text-green-700">· Pagado</span> : <span className="text-amber-700">· Pendiente</span>}
                                </p>
                                {s && <p className="text-xs text-ink-faint">Clase del {fmtDay(s.startsAt)}</p>}
                              </div>
                              <div className="flex shrink-0 gap-1.5">
                                {!b.penaltyPaid ? (
                                  <>
                                    <Button variant="secondary" onClick={() => settlePenalty(b.id, true)}>Cobrado</Button>
                                    <Button variant="ghost" onClick={() => waivePenalty(b.id)}>Condonar</Button>
                                  </>
                                ) : (
                                  <Button variant="ghost" onClick={() => settlePenalty(b.id, false)}>Marcar pendiente</Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}

                {/* Estado del miembro: baja / vetar / reactivar / eliminar.
                    Solo el dueño/gerente — el operador no gestiona estado ni borra. */}
                {canManageMembers && (
                <div className="mb-4 rounded-xl bg-cream-dark/40 p-3">
                  <p className="mb-2 text-sm font-medium text-ink-soft">Estado del miembro</p>
                  <div className="flex flex-wrap gap-2">
                    {isActiveMember(detail) ? (
                      <>
                        <Button variant="secondary" onClick={() => { setMemberStatus(detail.id, 'inactive'); setDetail({ ...detail, memberStatus: 'inactive' }); }}>Dar de baja</Button>
                        <Button variant="secondary" onClick={() => { setMemberStatus(detail.id, 'banned'); setDetail({ ...detail, memberStatus: 'banned' }); }}>Vetar</Button>
                      </>
                    ) : (
                      <Button variant="secondary" onClick={() => { setMemberStatus(detail.id, 'active'); setDetail({ ...detail, memberStatus: 'active' }); }}>Reactivar</Button>
                    )}
                    <button
                      onClick={async () => {
                        if (!window.confirm(`¿ELIMINAR definitivamente a ${detail.fullName}? Se borran sus datos y NO se puede deshacer.`)) return;
                        const ok = await deleteMember(detail.id);
                        if (ok) setDetail(null);
                      }}
                      className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
                    >
                      Eliminar definitivamente
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-ink-faint">Dar de baja o vetar conserva su historial (reversible). Eliminar borra todo.</p>
                </div>
                )}

                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setDetail(null)}>Cerrar</Button>
                  <Button onClick={() => { setPayFor(detail); setDetail(null); }}>Registrar pago</Button>
                </div>
              </>
            );
          })()}
        </Modal>
      )}

      {/* Registrar pago / plan manual */}
      {payFor && (
        <RegisterPaymentModal
          initial={payFor}
          students={students}
          packages={packages}
          membership={membership}
          onClose={() => setPayFor(null)}
          onSubmit={(userId, packageId, method, opts) => {
            registerManualPlan(userId, packageId, method, opts);
            setPayFor(null);
          }}
        />
      )}

      {/* Alta manual de miembro (sin app) */}
      {adding && (
        <AddMemberModal
          packages={packages}
          branches={branches}
          onClose={() => setAdding(false)}
          onSubmit={async ({ fullName, phone, email, birthDate, branchId, packageId, method, noCharge, expiresAt }) => {
            const id = await addMember({ fullName, phone, email, birthDate, branchId });
            if (id && packageId) {
              registerManualPlan(id, packageId, method, {
                recordPayment: !noCharge,
                expiresAt: noCharge && expiresAt ? expiresAt : undefined,
              });
            }
            setAdding(false);
          }}
        />
      )}
    </>
  );
}

// Edición de los datos de contacto de un miembro (corrige un nombre mal escrito,
// teléfono, etc.). El correo aquí es solo de contacto; no cambia el login.
function MemberEditCard({
  member, onSave,
}: {
  member: User;
  onSave: (patch: { fullName?: string; phone?: string; email?: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState(member.fullName);
  const [phone, setPhone] = useState(member.phone);
  const [email, setEmail] = useState(member.email);
  const inp = 'w-full rounded-xl border border-cream-dark bg-white px-3 py-2 text-sm outline-none focus:ring-2 ring-brand';
  const dirty =
    fullName.trim() !== member.fullName.trim() ||
    phone.trim() !== (member.phone ?? '').trim() ||
    email.trim() !== (member.email ?? '').trim();

  if (!open) {
    return (
      <div className="mb-4">
        <button
          type="button"
          onClick={() => { setFullName(member.fullName); setPhone(member.phone); setEmail(member.email); setOpen(true); }}
          className="text-sm font-medium text-brand"
        >
          ✏️ Editar datos del alumno
        </button>
      </div>
    );
  }
  return (
    <div className="mb-4 rounded-xl bg-cream-dark/40 p-3 space-y-3">
      <p className="text-sm font-medium text-ink-soft">Editar datos del alumno</p>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-soft">Nombre completo</span>
        <input className={inp} value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-soft">Teléfono</span>
          <input className={inp} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-soft">Correo (contacto)</span>
          <input className={inp} value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
      </div>
      <p className="text-xs text-ink-faint">El correo aquí es solo de contacto; no cambia el correo con el que el alumno inicia sesión.</p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
        <Button
          disabled={!dirty || !fullName.trim()}
          onClick={() => { onSave({ fullName: fullName.trim(), phone: phone.trim(), email: email.trim() }); setOpen(false); }}
        >
          Guardar
        </Button>
      </div>
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <Card className="w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" >
        <div onClick={(e) => e.stopPropagation()}>{children}</div>
      </Card>
    </div>
  );
}

function RegisterPaymentModal({
  initial, students, packages, membership, onClose, onSubmit,
}: {
  initial: User;
  students: User[];
  packages: Package[];
  membership: (userId: string) => { state: MembershipState; planName: string | null; expiresAt: string | null };
  onClose: () => void;
  onSubmit: (userId: string, packageId: string, method: PaymentMethod, opts?: { expiresAt?: string; recordPayment?: boolean; paymentPending?: boolean; pendingDue?: string }) => void;
}) {
  const [userId, setUserId] = useState(initial.id);
  const [packageId, setPackageId] = useState(packages[0]?.id ?? '');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  // Modo de registro: cobrar ahora · pago pendiente (a crédito) · sin cobro.
  const [mode, setMode] = useState<'charge' | 'pending' | 'free'>('charge');
  const [expiresAt, setExpiresAt] = useState(''); // vencimiento real (opcional)
  const [pendingDue, setPendingDue] = useState(''); // fecha acordada de pago (opcional)
  const pkg = packages.find((p) => p.id === packageId);

  // Membresía actual del alumno seleccionado.
  const m = membership(userId);
  const hasActive = m.state === 'active' || m.state === 'expiring';
  const noun = pkg ? PERIOD_NOUN[periodOf(pkg)] : 'mensualidad';

  // "Mantener día de corte": calcula el próximo corte desde el último vencimiento
  // + el periodo del paquete, para no calcularlo a mano. Solo aplica si el
  // miembro NO está activo (si lo está, el nuevo ciclo entra en cola y el corte
  // se mantiene solo).
  const keepCut = () => {
    if (!pkg) return;
    const days = PERIOD_DAYS[periodOf(pkg)];
    if (m.expiresAt) {
      const d = new Date(m.expiresAt);
      const now = Date.now();
      let guard = 0;
      while (d.getTime() <= now && guard < 500) { d.setDate(d.getDate() + days); guard++; }
      setExpiresAt(d.toISOString().slice(0, 10));
    } else {
      const d = new Date();
      d.setDate(d.getDate() + days);
      setExpiresAt(d.toISOString().slice(0, 10));
    }
  };

  // Si el miembro está activo, el vencimiento manual se ignora (entra en cola).
  const effExpires = !hasActive && expiresAt ? expiresAt : undefined;

  const submit = () => {
    const opts =
      mode === 'charge' ? { recordPayment: true, expiresAt: effExpires }
      : mode === 'pending' ? { recordPayment: false, paymentPending: true, pendingDue: pendingDue || undefined, expiresAt: effExpires }
      : { recordPayment: false, expiresAt: effExpires };
    onSubmit(userId, packageId, method, opts);
  };

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg font-bold text-ink mb-1">Registrar pago / membresía</h2>
      <p className="text-sm text-ink-faint mb-4">
        Asigna un plan al alumno. Si ya tiene un plan activo, el nuevo
        <strong> no lo borra</strong>: en gimnasio se forma <strong>en cola</strong> (empieza al terminar el actual);
        en estudio se suman las clases.
      </p>
      <div className="space-y-4">
        <Field label="Alumno">
          <select className="input" value={userId} onChange={(e) => setUserId(e.target.value)}>
            {students.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
          </select>
        </Field>

        {hasActive && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-800">
            Ya tiene <strong>{m.planName}</strong> activo
            {m.expiresAt ? <> hasta el <strong>{fmtDate(m.expiresAt)}</strong></> : ''}. El plan que registres
            quedará <strong>en cola</strong> y empezará cuando ese termine, <strong>manteniendo el día de corte</strong>.
          </div>
        )}

        <Field label="Plan / paquete">
          <select className="input" value={packageId} onChange={(e) => setPackageId(e.target.value)}>
            {packages.map((p) => <option key={p.id} value={p.id}>{p.name} — {usd(p.priceUsd)}</option>)}
          </select>
        </Field>

        {/* Modo de registro */}
        <div>
          <span className="mb-1 block text-sm font-medium text-ink-soft">¿Cómo se registra?</span>
          <div className="grid grid-cols-3 gap-2">
            {([
              { v: 'charge', t: 'Cobrar ahora', d: 'Registra el pago' },
              { v: 'pending', t: 'Pago pendiente', d: 'Acceso a crédito' },
              { v: 'free', t: 'Sin cobro', d: 'Ya pagó aparte' },
            ] as const).map((opt) => (
              <button
                key={opt.v}
                type="button"
                onClick={() => setMode(opt.v)}
                className={`rounded-xl border px-2 py-2.5 text-center transition ${mode === opt.v ? 'border-brand bg-brand-soft text-brand' : 'border-cream-dark bg-white text-ink-soft'}`}
              >
                <span className="block text-sm font-semibold">{opt.t}</span>
                <span className="block text-[11px] leading-tight text-ink-faint">{opt.d}</span>
              </button>
            ))}
          </div>
        </div>

        {mode === 'pending' && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 space-y-3">
            <p className="text-sm text-amber-800">
              Le das acceso ahora y el pago de la <strong>{noun}</strong> queda <strong>pendiente</strong>. Al alumno le
              aparecerá un recordatorio hasta que registres el pago desde su ficha.
            </p>
            <Field label="Fecha acordada de pago (opcional)">
              <input type="date" className="input" value={pendingDue} onChange={(e) => setPendingDue(e.target.value)} />
            </Field>
          </div>
        )}

        {mode === 'charge' && (
          <Field label="Forma de pago">
            <div className="flex flex-wrap gap-2">
              {(['cash', 'card', 'transfer', 'paypal'] as PaymentMethod[]).map((mth) => (
                <button
                  key={mth}
                  onClick={() => setMethod(mth)}
                  className={`rounded-full px-3 py-1.5 text-sm border transition ${method === mth ? 'bg-brand text-cream border-brand' : 'bg-white text-ink-soft border-cream-dark'}`}
                >
                  {METHOD_LABEL[mth]}
                </button>
              ))}
            </div>
          </Field>
        )}

        {/* Vencimiento / día de corte: solo cuando el miembro NO está activo
            (si está activo, entra en cola y el corte se mantiene solo). */}
        {!hasActive && (
          <div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Field label="Vence el (día de corte)">
                  <input type="date" className="input" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
                </Field>
              </div>
              <Button type="button" variant="secondary" onClick={keepCut}>Mantener día de corte</Button>
            </div>
            <p className="mt-1 text-xs text-ink-faint">
              "Mantener día de corte" calcula el próximo corte a partir del vencimiento anterior, para pagos tardíos o adelantados. Déjalo vacío para que corra desde hoy por la vigencia del paquete.
            </p>
          </div>
        )}
      </div>
      <div className="mt-6 flex items-center justify-between">
        <span className="text-lg font-bold text-brand">{mode === 'charge' && pkg ? usd(pkg.priceUsd) : ''}</span>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button disabled={!packageId} onClick={submit}>
            {mode === 'charge' ? 'Registrar y asignar plan' : mode === 'pending' ? 'Dar acceso (pago pendiente)' : 'Registrar membresía'}
          </Button>
        </div>
      </div>
      <style>{`.input{width:100%;border:1px solid #E8E3D6;border-radius:.75rem;padding:.6rem .8rem;background:#fff;outline:none}.input:focus{box-shadow:0 0 0 2px var(--brand-primary)}`}</style>
    </Modal>
  );
}

function AddMemberModal({
  packages, branches, onClose, onSubmit,
}: {
  packages: { id: string; name: string; priceUsd: number }[];
  branches: { id: string; name: string }[];
  onClose: () => void;
  onSubmit: (data: {
    fullName: string; phone: string; email: string; birthDate: string; branchId?: string;
    packageId: string; method: PaymentMethod; noCharge: boolean; expiresAt: string;
  }) => void;
}) {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [branchId, setBranchId] = useState('');
  const [assignPlan, setAssignPlan] = useState(false);
  const [packageId, setPackageId] = useState(packages[0]?.id ?? '');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [noCharge, setNoCharge] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!fullName.trim() || saving) return;
    setSaving(true);
    await onSubmit({
      fullName, phone, email, birthDate,
      branchId: branchId || undefined,
      packageId: assignPlan ? packageId : '',
      method, noCharge, expiresAt,
    });
  };

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg font-bold text-ink mb-1">Agregar miembro</h2>
      <p className="text-sm text-ink-faint mb-4">
        Da de alta a una persona que no usa la app (adultos mayores, walk-ins). Se crea sin cuenta;
        tú le registras el pago. Solo el nombre es obligatorio.
      </p>
      <div className="space-y-4">
        <Field label="Nombre completo *">
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ej. María López" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Teléfono">
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Opcional" />
          </Field>
          <Field label="Cumpleaños">
            <input type="date" className="input" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Correo (opcional)">
          <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Si no tiene, se omite" />
        </Field>
        {branches.length > 0 && (
          <Field label="Sucursal">
            <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">— Sede principal —</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
        )}

        <button
          type="button"
          onClick={() => setAssignPlan((v) => !v)}
          className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${assignPlan ? 'border-brand bg-brand-soft' : 'border-cream-dark bg-white'}`}
        >
          <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${assignPlan ? 'bg-brand border-brand text-cream' : 'border-cream-dark'}`}>
            {assignPlan ? '✓' : ''}
          </span>
          <span className="text-sm font-medium text-ink">Asignarle un plan y registrar su pago ahora</span>
        </button>

        {assignPlan && (
          <>
            <Field label="Plan / paquete">
              <select className="input" value={packageId} onChange={(e) => setPackageId(e.target.value)}>
                {packages.map((p) => <option key={p.id} value={p.id}>{p.name} — {usd(p.priceUsd)}</option>)}
              </select>
            </Field>

            <button
              type="button"
              onClick={() => setNoCharge((v) => !v)}
              className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${noCharge ? 'border-brand bg-brand-soft' : 'border-cream-dark bg-white'}`}
            >
              <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border ${noCharge ? 'bg-brand border-brand text-cream' : 'border-cream-dark'}`}>
                {noCharge ? '✓' : ''}
              </span>
              <span>
                <span className="block text-sm font-semibold text-ink">Ya tiene este plan (sin cobro)</span>
                <span className="block text-xs text-ink-faint">Da de alta su membresía actual con su vencimiento real, sin registrar un pago.</span>
              </span>
            </button>

            {noCharge ? (
              <Field label="Vence el (fecha real de su membresía)">
                <input type="date" className="input" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              </Field>
            ) : (
              <Field label="Forma de pago">
                <div className="flex flex-wrap gap-2">
                  {(['cash', 'card', 'transfer', 'paypal'] as PaymentMethod[]).map((mth) => (
                    <button
                      key={mth}
                      onClick={() => setMethod(mth)}
                      className={`rounded-full px-3 py-1.5 text-sm border transition ${method === mth ? 'bg-brand text-cream border-brand' : 'bg-white text-ink-soft border-cream-dark'}`}
                    >
                      {METHOD_LABEL[mth]}
                    </button>
                  ))}
                </div>
              </Field>
            )}
          </>
        )}
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button disabled={!fullName.trim() || saving || (assignPlan && !packageId)} onClick={submit}>
          {saving ? 'Guardando…' : !assignPlan ? 'Crear miembro' : noCharge ? 'Crear y registrar membresía' : 'Crear y registrar pago'}
        </Button>
      </div>
      <style>{`.input{width:100%;border:1px solid #E8E3D6;border-radius:.75rem;padding:.6rem .8rem;background:#fff;outline:none}.input:focus{box-shadow:0 0 0 2px var(--brand-primary)}`}</style>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink-soft">{label}</span>
      {children}
    </label>
  );
}
