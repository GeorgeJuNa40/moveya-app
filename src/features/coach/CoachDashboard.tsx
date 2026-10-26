import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../../lib/store';
import { PageHeader, StatCard, Card, Badge } from '../../components/ui';
import { fmtDay, fmtTime, usd } from '../../lib/format';
import { fetchClassLogs, logStatus, type ClassLog } from '../../lib/coachClasses';

const d2 = (n: number) => String(n).padStart(2, '0');

export default function CoachDashboard() {
  const { db, currentUser, seatsLeft } = useStore();

  // Pago estimado del mes: clases CONFIRMADAS (doble confirmación) + sueldo fijo.
  const [logs, setLogs] = useState<ClassLog[]>([]);
  useEffect(() => {
    const sid = currentUser?.studioId;
    if (!sid) return;
    const now = new Date();
    const start = `${now.getFullYear()}-${d2(now.getMonth() + 1)}-01`;
    const endD = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const end = `${endD.getFullYear()}-${d2(endD.getMonth() + 1)}-${d2(endD.getDate())}`;
    void fetchClassLogs(sid, start, end).then(setLogs);
  }, [currentUser?.studioId]);

  const pay = currentUser?.coachPay;
  const confirmedLogs = logs.filter((l) => logStatus(l) === 'confirmada');
  const pendingCount = logs.length - confirmedLogs.length;
  const classesPay = confirmedLogs.reduce((a, l) => a + l.amount, 0);
  const base = pay?.mode === 'fijo' ? (pay.rate || 0) * (pay.period === 'quincena' ? 2 : 1) : 0;
  const estimated = classesPay + base;

  const upcoming = useMemo(
    () =>
      db.classSessions
        .filter((s) => s.coachId === currentUser!.id)
        .filter((s) => new Date(s.startsAt).getTime() > Date.now())
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [db.classSessions, currentUser],
  );

  const totalStudents = upcoming.reduce(
    (acc, s) => acc + (s.capacity - seatsLeft(s.id)),
    0,
  );

  return (
    <>
      <PageHeader
        title={`Hola, ${currentUser!.fullName.split(' ')[0]}`}
        subtitle="Tu agenda de clases y alumnos inscritos"
      />

      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        <StatCard label="Clases próximas" value={upcoming.length} icon="▦" />
        <StatCard label="Alumnos inscritos" value={totalStudents} icon="⚇" />
        <StatCard
          label="Especialidades"
          value={currentUser!.coachProfile?.specialties.length ?? 0}
          icon="✦"
        />
      </div>

      {/* Mi pago estimado del mes (clases confirmadas + sueldo fijo) */}
      <Card className="mb-6 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-faint">Mi pago estimado · este mes</p>
            <p className="text-3xl font-black text-ink">{usd(estimated)}</p>
          </div>
          <div className="text-right text-sm text-ink-soft">
            <p>{confirmedLogs.length} clases confirmadas{classesPay > 0 ? ` · ${usd(classesPay)}` : ''}</p>
            {base > 0 && <p>Sueldo fijo · {usd(base)}</p>}
            {pendingCount > 0 && <p className="text-amber-700">{pendingCount} pendientes (no cuentan aún)</p>}
          </div>
        </div>
        <p className="mt-3 text-xs text-ink-faint">
          Solo cuentan las clases con <b>doble confirmación</b> (tú ✓ + estudio ✓). Confirma tus clases en
          <Link to="/coach/calendar" className="text-brand font-medium"> tu calendario</Link>.
        </p>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-ink">Tus próximas clases</h2>
          <Link to="/coach/calendar" className="text-sm text-brand font-medium">
            Ver calendario →
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <div className="rounded-xl border border-dashed border-cream-dark p-8 text-center text-sm text-ink-faint">
            No tienes clases próximas asignadas. Cuando el estudio te agende una clase, aparecerá aquí.
          </div>
        ) : (
          <div className="divide-y divide-cream-dark">
            {upcoming.slice(0, 6).map((s) => {
              const tpl = db.classTemplates.find((t) => t.id === s.templateId)!;
              const enrolled = s.capacity - seatsLeft(s.id);
              return (
                <div key={s.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-ink">{tpl.name}</p>
                    <p className="text-sm text-ink-faint">
                      {fmtDay(s.startsAt)} · {fmtTime(s.startsAt)}
                    </p>
                  </div>
                  <Badge tone={enrolled >= s.capacity ? 'danger' : 'success'}>
                    {enrolled}/{s.capacity} alumnos
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}
