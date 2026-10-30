import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../lib/store';
import { PageHeader, Card, StatCard, Button } from '../../components/ui';
import { usd } from '../../lib/format';
import { fetchExpenses, saveExpense, deleteExpense } from '../../lib/finance';
import { fetchSales } from '../../lib/products';
import { fetchAppointments } from '../../lib/appointments';
import { notifySuccess } from '../../lib/notify';
import type { MembershipState, PaymentMethod, Expense, ProductSale, ServiceAppointment } from '../../lib/types';

const METHOD_LABEL: Record<PaymentMethod, string> = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', paypal: 'PayPal' };
const STATE_LABEL: Record<MembershipState, string> = { active: 'Activas', expiring: 'Por vencer', expired: 'Vencidas', none: 'Sin plan' };

const MONTH_FMT = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' });
const MONTH_SHORT = new Intl.DateTimeFormat('es-MX', { month: 'short' });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface Period {
  key: string;
  label: string;
  short: string;
  start: number; // ms (inclusive)
  end: number; // ms (exclusivo)
}

export default function Reports() {
  const { db, currentStudio, studioUsers, membership } = useStore();

  // Historial: "Todo el tiempo" + cada uno de los últimos 12 meses.
  const periods = useMemo<Period[]>(() => {
    const now = new Date();
    const months: Period[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = d.getTime();
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
      const label = i === 0 ? `Este mes · ${cap(MONTH_FMT.format(d))}` : cap(MONTH_FMT.format(d));
      months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label, short: cap(MONTH_SHORT.format(d)), start, end });
    }
    return [{ key: 'all', label: 'Todo el tiempo', short: 'Todo', start: 0, end: Infinity }, ...months];
  }, []);

  // Por defecto arrancamos en el mes actual (día a día); se puede ver el historial.
  const [periodKey, setPeriodKey] = useState<string>(periods[1]?.key ?? 'all');
  const period = periods.find((p) => p.key === periodKey) ?? periods[0];

  // Egresos (gastos) y ventas de tienda — para el reporte de entradas y salidas.
  const studioId = currentStudio!.id;
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [sales, setSales] = useState<ProductSale[]>([]);
  const [appts, setAppts] = useState<ServiceAppointment[]>([]);
  const [downloading, setDownloading] = useState(false);
  const reloadFinance = () => {
    void fetchExpenses(studioId).then(setExpenses);
    void fetchSales(studioId).then(setSales);
    void fetchAppointments(studioId).then(setAppts);
  };
  useEffect(reloadFinance, [studioId]);

  const inPeriod = (iso?: string | null) => {
    if (period.key === 'all') return true;
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return t >= period.start && t < period.end;
  };

  // Entradas (pagos + ventas de tienda) y salidas (egresos) del periodo.
  const finance = useMemo(() => {
    const paysIn = db.payments.filter((p) => inPeriod(p.paidAt));
    // Ventas de tienda del periodo. Las pagadas EN LÍNEA (sold_by='online') ya
    // entran como pago en `payments`, así que aquí se excluyen para no contarlas
    // dos veces; quedan solo las de mostrador (pos_sell).
    const salesIn = sales.filter((s) => inPeriod(s.soldAt) && s.soldBy !== 'online');
    const expIn = expenses.filter((e) => inPeriod(e.spentAt));
    // Comisiones de servicios COBRADAS (consulta realizada + comisión marcada cobrada).
    const commIn = appts.filter((a) => a.status === 'done' && a.commissionPaid && a.commissionUsd > 0 && inPeriod(a.scheduledFor ?? a.createdAt));
    const entradasPagos = paysIn.reduce((a, p) => a + p.amountUsd, 0);
    const entradasVentas = salesIn.reduce((a, s) => a + s.total, 0);
    const entradasComisiones = commIn.reduce((a, c) => a + c.commissionUsd, 0);
    const entradas = entradasPagos + entradasVentas + entradasComisiones;
    const salidas = expIn.reduce((a, e) => a + e.amountUsd, 0);
    return { paysIn, salesIn, expIn, commIn, entradasPagos, entradasVentas, entradasComisiones, entradas, salidas, saldo: entradas - salidas };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.payments, sales, expenses, appts, period]);

  // Alta de egreso (gasto).
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const [expForm, setExpForm] = useState({ concept: '', amount: '', category: '', date: todayStr() });
  const addExp = async () => {
    const amount = Math.max(0, Number(expForm.amount) || 0);
    if (!expForm.concept.trim() || amount <= 0) return;
    const res = await saveExpense({
      studioId, concept: expForm.concept.trim(),
      category: expForm.category.trim() || undefined,
      amountUsd: amount, spentAt: new Date(expForm.date).toISOString(),
    });
    if (res.ok) {
      notifySuccess('Egreso registrado.');
      setExpForm({ concept: '', amount: '', category: '', date: todayStr() });
      reloadFinance();
    }
  };
  const delExp = async (id: string) => { if (await deleteExpense(id)) reloadFinance(); };

  // Genera un PDF contable de ENTRADAS y SALIDAS del periodo (letra >= 14pt).
  const downloadPdf = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const PW = doc.internal.pageSize.getWidth();
      const RIGHT = PW - 15;
      const SAGE: [number, number, number] = [74, 93, 85];
      const INK: [number, number, number] = [33, 33, 33];
      const fmtd = (iso: string) => new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
      let y = 20;
      const nl = (h = 7) => { y += h; if (y > 278) { doc.addPage(); y = 20; } };

      doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(...SAGE);
      doc.text(currentStudio!.name, 15, y); nl(9);
      doc.setFontSize(16); doc.setTextColor(...INK);
      doc.text('Reporte de movimientos', 15, y); nl(7);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(14); doc.setTextColor(110, 122, 115);
      doc.text(`Periodo: ${period.key === 'all' ? 'Todo el tiempo' : period.label}`, 15, y); nl(6);
      doc.text(`Generado: ${new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}`, 15, y); nl(10);

      const section = (title: string) => {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...SAGE);
        doc.text(title, 15, y); nl(8);
      };
      const row = (a: string, b: string, c: string, bold = false) => {
        doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(14);
        doc.setTextColor(...(bold ? SAGE : INK));
        doc.text(a, 15, y);
        doc.text(b.length > 48 ? b.slice(0, 47) + '…' : b, 45, y);
        doc.text(c, RIGHT, y, { align: 'right' });
        nl(7);
      };

      // ENTRADAS
      section('Entradas (ingresos)');
      row('Fecha', 'Concepto', 'Monto', true);
      for (const p of finance.paysIn.slice().sort((x, y2) => x.paidAt.localeCompare(y2.paidAt)))
        row(fmtd(p.paidAt), `${p.concept} · ${METHOD_LABEL[p.method]}`, usd(p.amountUsd));
      for (const s of finance.salesIn.slice().sort((x, y2) => x.soldAt.localeCompare(y2.soldAt)))
        row(fmtd(s.soldAt), `Tienda: ${s.qty}× ${s.productName}`, usd(s.total));
      for (const c of finance.commIn.slice().sort((x, y2) => (x.scheduledFor ?? x.createdAt).localeCompare(y2.scheduledFor ?? y2.createdAt)))
        row(fmtd(c.scheduledFor ?? c.createdAt), `Comisión: ${c.serviceName}`, usd(c.commissionUsd));
      if (!finance.paysIn.length && !finance.salesIn.length && !finance.commIn.length) row('', 'Sin entradas en el periodo', '');
      nl(2); row('', 'Total entradas', usd(finance.entradas), true); nl(6);

      // SALIDAS
      section('Salidas (egresos)');
      row('Fecha', 'Concepto', 'Monto', true);
      for (const e of finance.expIn.slice().sort((x, y2) => x.spentAt.localeCompare(y2.spentAt)))
        row(fmtd(e.spentAt), e.category ? `${e.concept} · ${e.category}` : e.concept, usd(e.amountUsd));
      if (!finance.expIn.length) row('', 'Sin egresos en el periodo', '');
      nl(2); row('', 'Total salidas', usd(finance.salidas), true); nl(8);

      // SALDO
      doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...SAGE);
      doc.text('Saldo del periodo', 15, y);
      doc.text(usd(finance.saldo), RIGHT, y, { align: 'right' }); nl(10);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(14); doc.setTextColor(140, 140, 140);
      doc.text('Move yA · Reporte generado automáticamente', 15, y);

      doc.save(`reporte-${currentStudio!.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${period.key}.pdf`);
    } finally {
      setDownloading(false);
    }
  };

  const data = useMemo(() => {
    const sid = currentStudio!.id;
    const students = studioUsers('STUDENT');
    const coaches = studioUsers('COACH');

    const sessById = new Map(db.classSessions.map((s) => [s.id, s]));
    const inRange = (iso?: string | null) => {
      if (period.key === 'all') return true;
      if (!iso) return false;
      const t = new Date(iso).getTime();
      return t >= period.start && t < period.end;
    };

    // Pagos del periodo (por fecha de pago).
    const pays = db.payments.filter((p) => inRange(p.paidAt));
    const revenue = pays.reduce((a, p) => a + p.amountUsd, 0);
    const manual = pays.filter((p) => p.registeredBy === 'studio').reduce((a, p) => a + p.amountUsd, 0);
    const online = revenue - manual;

    // Reservas del periodo (por fecha de la clase).
    const bookingsInRange = db.bookings.filter((b) => b.status !== 'CANCELED' && inRange(sessById.get(b.sessionId)?.startsAt));
    const attended = db.bookings.filter((b) => b.status === 'ATTENDED' && inRange(sessById.get(b.sessionId)?.startsAt)).length;
    const totalBookings = bookingsInRange.length;

    const byTemplate = db.classTemplates
      .filter((t) => t.studioId === sid)
      .map((t) => ({
        name: t.name,
        color: t.colorHex,
        count: bookingsInRange.filter((b) => sessById.get(b.sessionId)?.templateId === t.id).length,
      }))
      .sort((a, b) => b.count - a.count);
    const maxCount = Math.max(1, ...byTemplate.map((x) => x.count));

    const byMethod = (['cash', 'card', 'transfer', 'paypal'] as PaymentMethod[]).map((m) => ({
      m, total: pays.filter((p) => p.method === m).reduce((a, p) => a + p.amountUsd, 0),
    }));
    const maxMethod = Math.max(1, ...byMethod.map((x) => x.total));

    // Estado de membresías: es una foto ACTUAL (no depende del mes elegido).
    const memberStates = { active: 0, expiring: 0, expired: 0, none: 0 } as Record<MembershipState, number>;
    for (const s of students) memberStates[membership(s.id).state]++;

    const starsIssued = db.stars.filter((s) => s.delta > 0 && inRange(s.createdAt)).reduce((a, s) => a + s.delta, 0);
    const redemptions = db.stars.filter((s) => s.reason === 'redemption' && inRange(s.createdAt)).length;

    // Tendencia: ingresos de cada uno de los últimos 12 meses (más viejo -> más nuevo).
    const monthly = periods
      .filter((p) => p.key !== 'all')
      .map((p) => ({
        key: p.key,
        short: p.short,
        total: db.payments
          .filter((pay) => { const t = new Date(pay.paidAt).getTime(); return t >= p.start && t < p.end; })
          .reduce((a, pay) => a + pay.amountUsd, 0),
      }))
      .reverse();
    const maxMonthly = Math.max(1, ...monthly.map((x) => x.total));

    return { students: students.length, coaches: coaches.length, revenue, manual, online, attended, totalBookings, byTemplate, maxCount, byMethod, maxMethod, memberStates, starsIssued, redemptions, monthly, maxMonthly };
  }, [db, currentStudio, studioUsers, membership, period, periods]);

  return (
    <>
      <PageHeader
        title="Reportes"
        subtitle="Métricas de tu estudio — elige un mes para ver su historial"
        action={<Button variant="secondary" disabled={downloading} onClick={downloadPdf}>{downloading ? 'Generando…' : '⬇ Descargar PDF'}</Button>}
      />

      {/* Selector de periodo (historial hasta 12 meses atrás) */}
      <div className="mb-6 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {periods.map((p) => {
          const active = p.key === period.key;
          return (
            <button
              key={p.key}
              onClick={() => setPeriodKey(p.key)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
                active ? 'bg-brand text-cream-light shadow-card' : 'bg-white text-ink-soft ring-1 ring-black/[0.06] hover:bg-brand-soft'
              }`}
            >
              {p.key === 'all' ? 'Todo el tiempo' : active ? p.label : p.short + ' ' + p.key.split('-')[0]}
            </button>
          );
        })}
      </div>

      {/* Entradas y salidas de dinero del periodo */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Entradas" value={usd(finance.entradas)} hint="pagos + tienda + comisiones" icon="↑" />
        <StatCard label="Salidas" value={usd(finance.salidas)} hint="egresos / gastos" icon="↓" />
        <StatCard label="Saldo" value={usd(finance.saldo)} hint="entradas − salidas" icon="=" />
      </div>

      {/* Egresos / gastos */}
      <Card className="p-6 mb-6">
        <h2 className="font-semibold text-ink mb-1">Egresos / gastos</h2>
        <p className="text-xs text-ink-faint mb-4">Registra las salidas de dinero (renta, nómina, insumos…) para tu reporte contable.</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex-1 min-w-[10rem]">
            <span className="mb-1 block text-xs font-medium text-ink-soft">Concepto</span>
            <input className="rinp" value={expForm.concept} onChange={(e) => setExpForm({ ...expForm, concept: e.target.value })} placeholder="Ej. Renta del local" />
          </label>
          <label className="w-28">
            <span className="mb-1 block text-xs font-medium text-ink-soft">Categoría</span>
            <input className="rinp" value={expForm.category} onChange={(e) => setExpForm({ ...expForm, category: e.target.value })} placeholder="Opcional" />
          </label>
          <label className="w-24">
            <span className="mb-1 block text-xs font-medium text-ink-soft">Monto</span>
            <input type="number" min="0" step="0.01" className="rinp" value={expForm.amount} onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })} />
          </label>
          <label className="w-36">
            <span className="mb-1 block text-xs font-medium text-ink-soft">Fecha</span>
            <input type="date" className="rinp" value={expForm.date} onChange={(e) => setExpForm({ ...expForm, date: e.target.value })} />
          </label>
          <Button disabled={!expForm.concept.trim() || !(Number(expForm.amount) > 0)} onClick={addExp}>Agregar</Button>
        </div>

        {finance.expIn.length > 0 && (
          <div className="mt-4 divide-y divide-cream-dark">
            {finance.expIn.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate text-ink">{e.concept}{e.category ? ` · ${e.category}` : ''}</p>
                  <p className="text-xs text-ink-faint">{new Date(e.spentAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-semibold text-ink">{usd(e.amountUsd)}</span>
                  <button onClick={() => delExp(e.id)} className="text-xs font-medium text-red-600">Eliminar</button>
                </div>
              </div>
            ))}
          </div>
        )}
        <style>{`.rinp{width:100%;border:1px solid #E8E3D6;border-radius:.6rem;padding:.5rem .7rem;background:#fff;outline:none;font-size:14px}.rinp:focus{box-shadow:0 0 0 2px var(--brand-primary)}`}</style>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-6">
        <StatCard label="Ingresos" value={usd(data.revenue)} hint={`${usd(data.online)} en línea · ${usd(data.manual)} en estudio`} />
        <StatCard label="Reservas" value={data.totalBookings} hint={`${data.attended} asistencias`} />
        <StatCard label="Alumnos / Coaches" value={`${data.students} / ${data.coaches}`} hint="Total actual del estudio" />
        <StatCard label="Estrellas · canjes" value={`${data.starsIssued} · ${data.redemptions}`} icon="★" />
      </div>

      {/* Tendencia mensual de ingresos (12 meses) — toca una barra para ver ese mes */}
      <Card className="p-6 mb-6">
        <h2 className="font-semibold text-ink mb-1">Ingresos por mes</h2>
        <p className="text-xs text-ink-faint mb-4">Últimos 12 meses · toca un mes para ver su detalle</p>
        <div className="flex items-end gap-1.5 sm:gap-2 h-44">
          {data.monthly.map((m) => {
            const active = m.key === period.key;
            const h = Math.max(4, (m.total / data.maxMonthly) * 100);
            return (
              <button
                key={m.key}
                onClick={() => setPeriodKey(m.key)}
                className="group flex flex-1 flex-col items-center justify-end h-full gap-1"
                title={`${m.short}: ${usd(m.total)}`}
              >
                <span className={`text-[10px] font-semibold tabular-nums ${active ? 'text-brand' : 'text-ink-faint opacity-0 group-hover:opacity-100'}`}>
                  {m.total > 0 ? usd(m.total).replace(/\s\w+$/, '') : ''}
                </span>
                <div
                  className={`w-full rounded-t-lg transition-all ${active ? 'bg-brand' : 'bg-brand-soft group-hover:bg-mint'}`}
                  style={{ height: `${h}%` }}
                />
                <span className={`text-[10px] ${active ? 'font-bold text-brand' : 'text-ink-faint'}`}>{m.short}</span>
              </button>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-semibold text-ink">Membresías por estado</h2>
            <span className="text-xs text-ink-faint">Actual</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(Object.keys(data.memberStates) as MembershipState[]).map((k) => (
              <div key={k} className="rounded-xl bg-cream-dark/40 p-4 text-center">
                <p className="text-2xl font-bold text-ink">{data.memberStates[k]}</p>
                <p className="text-xs text-ink-faint">{STATE_LABEL[k]}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="font-semibold text-ink mb-4">Ingresos por método de pago</h2>
          {data.byMethod.every((x) => x.total === 0) ? (
            <p className="text-sm text-ink-faint">Sin pagos registrados en este periodo.</p>
          ) : (
            <div className="space-y-3">
              {data.byMethod.map((x) => (
                <div key={x.m}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-ink-soft">{METHOD_LABEL[x.m]}</span>
                    <span className="text-ink-faint">{usd(x.total)}</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-cream-dark overflow-hidden">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${(x.total / data.maxMethod) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-6 lg:col-span-2">
          <h2 className="font-semibold text-ink mb-4">Popularidad por tipo de clase</h2>
          {data.byTemplate.every((t) => t.count === 0) ? (
            <p className="text-sm text-ink-faint">Sin reservas en este periodo.</p>
          ) : (
            <div className="space-y-3">
              {data.byTemplate.map((t) => (
                <div key={t.name}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-ink-soft">{t.name}</span>
                    <span className="text-ink-faint">{t.count} reservas</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-cream-dark overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${(t.count / data.maxCount) * 100}%`, background: t.color }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
