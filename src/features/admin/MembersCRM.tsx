import { useMemo, useState } from 'react';
import { useStore } from '../../lib/store';
import { PageHeader, Card, Badge, Button, StatCard } from '../../components/ui';
import Avatar from '../../components/Avatar';
import { fmtDay, fmtTime, usd } from '../../lib/format';
import type { MembershipState, Payment, PaymentMethod, User } from '../../lib/types';

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
  const { db, currentStudio, studioUsers, membership, registerManualPlan, isNewStudent, pendingPenalty, settlePenalty, waivePenalty } = useStore();
  const students = studioUsers('STUDENT');
  const packages = db.packages.filter((p) => p.studioId === currentStudio!.id && p.active);

  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState<User | null>(null);
  const [payFor, setPayFor] = useState<User | null>(null);

  const studentIds = useMemo(() => new Set(students.map((s) => s.id)), [students]);

  const filtered = useMemo(
    () =>
      students.filter((s) =>
        `${s.fullName} ${s.email} ${s.phone}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [students, query],
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
        action={<Button onClick={() => setPayFor(students[0] ?? null)}>+ Registrar pago</Button>}
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
        className="mb-4 w-full rounded-xl border border-cream-dark bg-white px-4 py-2.5 outline-none focus:ring-2 ring-brand"
      />

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
                          </div>
                          <p className="text-xs text-ink-faint">Alta {fmtDay(s.createdAt)}</p>
                          {fmtBirthday(s.birthDate) && (
                            <p className="text-xs text-ink-faint">🎂 {fmtBirthday(s.birthDate)}</p>
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
                      {m.state !== 'none' && m.state !== 'expired' && (
                        <span className="ml-2 text-xs text-ink-faint">{m.creditsLeft} clases · {m.daysLeft}d</span>
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
                </div>
                <Badge tone={meta.tone}>{meta.label}</Badge>
              </div>
              <p className="mt-2 text-sm text-ink-soft">{m.planName ?? 'Sin plan'} · {bookingsOf(s.id).length} clases</p>
              <p className="mt-1 text-xs text-ink-faint">
                {last ? `Últ. pago: ${usd(last.amountUsd)} · ${METHOD_LABEL[last.method]} (${SOURCE_LABEL[last.registeredBy]})` : 'Sin pagos registrados'}
              </p>
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
                <div className="flex items-center gap-2 mb-4">
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                  <span className="text-sm text-ink-soft">{m.planName ?? 'Sin plan'}</span>
                  {m.state !== 'none' && <span className="text-sm text-ink-faint">· {m.creditsLeft} clases · vence en {m.daysLeft}d</span>}
                </div>

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
          onClose={() => setPayFor(null)}
          onSubmit={(userId, packageId, method) => {
            registerManualPlan(userId, packageId, method);
            setPayFor(null);
          }}
        />
      )}
    </>
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
  initial, students, packages, onClose, onSubmit,
}: {
  initial: User;
  students: User[];
  packages: { id: string; name: string; priceUsd: number }[];
  onClose: () => void;
  onSubmit: (userId: string, packageId: string, method: PaymentMethod) => void;
}) {
  const [userId, setUserId] = useState(initial.id);
  const [packageId, setPackageId] = useState(packages[0]?.id ?? '');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const pkg = packages.find((p) => p.id === packageId);

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg font-bold text-ink mb-1">Registrar pago</h2>
      <p className="text-sm text-ink-faint mb-4">
        Asigna un plan al alumno y registra cómo pagó (efectivo, tarjeta o transferencia en el estudio).
        Los pagos con tarjeta en línea se registran solos.
      </p>
      <div className="space-y-4">
        <Field label="Alumno">
          <select className="input" value={userId} onChange={(e) => setUserId(e.target.value)}>
            {students.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
          </select>
        </Field>
        <Field label="Plan / paquete">
          <select className="input" value={packageId} onChange={(e) => setPackageId(e.target.value)}>
            {packages.map((p) => <option key={p.id} value={p.id}>{p.name} — {usd(p.priceUsd)}</option>)}
          </select>
        </Field>
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
      </div>
      <div className="mt-6 flex items-center justify-between">
        <span className="text-lg font-bold text-brand">{pkg ? usd(pkg.priceUsd) : ''}</span>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button disabled={!packageId} onClick={() => onSubmit(userId, packageId, method)}>Registrar y asignar plan</Button>
        </div>
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
