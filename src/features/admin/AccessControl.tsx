import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { useStore, isUsablePackage } from '../../lib/store';
import { PageHeader, Card, Badge, Button } from '../../components/ui';
import { accessCheckIn, fetchTodayCheckins, subscribeCheckins, fmtDur, type Checkin } from '../../lib/access';
import { notifySuccess, notifyError } from '../../lib/notify';
import QrScanner, { parseCheckinQr } from '../checkin/QrScanner';

// Pantalla "Accesos" (gimnasio/mixto): control de entrada de los miembros.
//  - Modo de check-in configurable (QR fijo / staff escanea / manual).
//  - QR fijo de recepción para imprimir (el miembro lo escanea con su app).
//  - Registro manual buscando al miembro.
//  - "Quién entró hoy" en vivo.
type Mode = 'member_qr' | 'staff_qr' | 'manual';

export default function AccessControl() {
  const { db, currentStudio, updateBranding } = useStore();
  const studio = currentStudio!;
  const mode: Mode = (studio.branding.checkinMode ?? 'member_qr') as Mode;

  const origin = window.location.origin;
  const fixedUrl = `${origin}/#/checkin?s=${encodeURIComponent(studio.id)}`;
  const [qr, setQr] = useState('');
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  // Miembros (alumnos) del estudio, para el registro manual.
  const students = useMemo(
    () => db.users.filter((u) => u.studioId === studio.id && u.role === 'STUDENT'),
    [db.users, studio.id],
  );
  const activeUserIds = useMemo(() => {
    const set = new Set<string>();
    for (const p of db.userPackages) if (isUsablePackage(p)) set.add(p.userId);
    return set;
  }, [db.userPackages]);

  const load = () => { void fetchTodayCheckins().then(setCheckins); };
  useEffect(() => {
    load();
    const unsub = subscribeCheckins(load);
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reloj que avanza cada minuto para que el aforo/permanencia se actualicen solos.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  // Aforo (dentro ahora) = visitas sin salida. Completadas = con salida.
  const inside = useMemo(() => checkins.filter((c) => !c.exitedAt), [checkins]);
  const insideIds = useMemo(() => new Set(inside.map((c) => c.userId)), [inside]);
  const completed = useMemo(() => checkins.filter((c) => c.exitedAt), [checkins]);
  const avgStayMin = useMemo(() => {
    if (completed.length === 0) return 0;
    const total = completed.reduce(
      (a, c) => a + Math.max(0, (new Date(c.exitedAt!).getTime() - new Date(c.createdAt).getTime()) / 60000),
      0,
    );
    return Math.round(total / completed.length);
  }, [completed]);
  const elapsedMin = (iso: string) => Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  const durMin = (c: Checkin) =>
    Math.max(0, Math.floor((new Date(c.exitedAt!).getTime() - new Date(c.createdAt).getTime()) / 60000));

  useEffect(() => {
    QRCode.toDataURL(fixedUrl, { width: 320, margin: 1, color: { dark: '#4A5D55', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(''));
  }, [fixedUrl]);

  const markManual = async (userId: string, name: string) => {
    setBusy(userId);
    try {
      const res = await accessCheckIn(userId, 'manual');
      const msg = res.duplicate
        ? `${name}: registro repetido, sin cambios.`
        : res.action === 'out'
          ? `👋 Salida: ${name}${res.durationMin != null ? ` · ${fmtDur(res.durationMin)}` : ''}`
          : `✅ Entrada: ${name}${res.active ? '' : ' (sin membresía activa)'}`;
      notifySuccess(msg);
      load();
    } catch (e) {
      notifyError('acceso', (e as Error)?.message ?? 'No se pudo registrar');
    } finally {
      setBusy(null);
    }
  };

  // El staff escaneó el QR personal de un miembro: registramos su entrada.
  const onScan = (text: string) => {
    setScanning(false);
    const parsed = parseCheckinQr(text);
    if (!parsed || parsed.studio !== studio.id || !parsed.user) {
      notifyError('acceso', 'Ese código no es de un miembro de tu estudio.');
      return;
    }
    void markManual(parsed.user, nameOf(parsed.user));
  };

  const filtered = search.trim()
    ? students.filter((u) => u.fullName.toLowerCase().includes(search.toLowerCase()))
    : students;

  const nameOf = (uid: string) => db.users.find((u) => u.id === uid)?.fullName ?? 'Miembro';
  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

  return (
    <>
      <PageHeader title="Accesos" subtitle="Entrada y salida de tus miembros · aforo en tiempo real" />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Modo de check-in */}
        <Card className="p-6 lg:col-span-2">
          <h2 className="font-semibold text-ink mb-1">¿Cómo registran el acceso?</h2>
          <p className="text-sm text-ink-faint mb-3">Elige el método que mejor le acomode a tu gimnasio.</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {([
              { v: 'member_qr', t: 'QR en recepción', d: 'El miembro lo escanea con su app. Sin fila, sin hardware.' },
              { v: 'staff_qr', t: 'El staff escanea', d: 'El miembro muestra su QR y recepción lo escanea.' },
              { v: 'manual', t: 'Manual', d: 'Recepción marca la entrada desde la lista.' },
            ] as const).map((opt) => (
              <button
                key={opt.v}
                type="button"
                onClick={() => updateBranding({ checkinMode: opt.v })}
                className={`rounded-xl border p-3 text-left transition ${
                  mode === opt.v ? 'border-brand bg-brand-soft' : 'border-cream-dark bg-white hover:border-brand-soft'
                }`}
              >
                <span className={`block text-sm font-semibold ${mode === opt.v ? 'text-brand' : 'text-ink'}`}>{opt.t}</span>
                <span className="mt-0.5 block text-xs text-ink-faint">{opt.d}</span>
              </button>
            ))}
          </div>
        </Card>

        {/* QR fijo de recepción (modo member_qr) */}
        {mode === 'member_qr' && (
          <Card className="p-6 text-center">
            <h2 className="font-semibold text-ink mb-1">QR de recepción</h2>
            <p className="text-sm text-ink-faint mb-4">Imprímelo y pégalo en la entrada. Tus miembros lo escanean con su celular para registrar la entrada.</p>
            {qr ? <img src={qr} alt="QR de acceso" className="mx-auto h-52 w-52 rounded-2xl border border-cream-dark" /> : <div className="mx-auto h-52 w-52 animate-pulse rounded-2xl bg-cream-dark/40" />}
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="secondary" onClick={() => window.print()}>Imprimir</Button>
              {qr && <a href={qr} download="qr-acceso-moveya.png" className="rounded-2xl border border-cream-dark px-4 py-2 text-sm font-medium text-ink-soft hover:bg-brand-soft">Descargar</a>}
            </div>
          </Card>
        )}

        {/* Modo "staff escanea": escáner de cámara dentro de la app */}
        {mode === 'staff_qr' && (
          <Card className="p-6 text-center">
            <h2 className="font-semibold text-ink mb-1">Escanear al miembro</h2>
            <p className="text-sm text-ink-soft mb-4">
              Pide al miembro que abra <b>“Mi acceso”</b> en su app (verá su código). Aquí escaneas ese código y se registra su entrada.
            </p>
            <Button onClick={() => setScanning(true)}>📷 Escanear código</Button>
            <p className="mt-3 text-xs text-ink-faint">💡 También puedes registrar entradas a mano abajo.</p>
          </Card>
        )}

        {/* Registro manual / buscar miembro */}
        <Card className="p-6">
          <h2 className="font-semibold text-ink mb-1">Registrar acceso a mano</h2>
          <p className="text-sm text-ink-faint mb-3">Busca al miembro y registra su entrada o salida (el botón cambia solo).</p>
          <input
            className="w-full rounded-xl border border-cream-dark bg-white px-4 py-2.5 outline-none focus:ring-2 ring-brand mb-3"
            placeholder="Buscar por nombre…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {filtered.slice(0, 30).map((u) => (
              <div key={u.id} className="flex items-center justify-between gap-2 rounded-xl bg-cream-dark/30 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{u.fullName}</p>
                  <p className="text-[11px] text-ink-faint">
                    {insideIds.has(u.id) ? '🟢 Dentro ahora' : activeUserIds.has(u.id) ? '🔓 Membresía activa' : '⚠️ Sin membresía'}
                  </p>
                </div>
                <Button
                  variant={insideIds.has(u.id) ? 'primary' : 'secondary'}
                  disabled={busy === u.id}
                  onClick={() => markManual(u.id, u.fullName)}
                >
                  {busy === u.id ? '…' : insideIds.has(u.id) ? 'Salida' : 'Entrada'}
                </Button>
              </div>
            ))}
            {filtered.length === 0 && <p className="text-xs text-ink-faint">Sin miembros que coincidan.</p>}
          </div>
        </Card>

        {/* Aforo en tiempo real */}
        <Card className="p-6 lg:col-span-2">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-2xl bg-brand-soft p-4">
              <p className="text-3xl font-black text-brand">{inside.length}</p>
              <p className="text-xs font-medium text-ink-soft">Dentro ahora</p>
            </div>
            <div className="rounded-2xl bg-cream-dark/30 p-4">
              <p className="text-3xl font-black text-ink">{checkins.length}</p>
              <p className="text-xs font-medium text-ink-soft">Visitas hoy</p>
            </div>
            <div className="rounded-2xl bg-cream-dark/30 p-4">
              <p className="text-3xl font-black text-ink">{avgStayMin > 0 ? fmtDur(avgStayMin) : '—'}</p>
              <p className="text-xs font-medium text-ink-soft">Permanencia prom.</p>
            </div>
          </div>
        </Card>

        {/* Dentro ahora */}
        <Card className="p-6">
          <h2 className="font-semibold text-ink mb-3">🟢 Dentro ahora <span className="text-ink-faint">({inside.length})</span></h2>
          {inside.length === 0 ? (
            <p className="text-sm text-ink-faint">No hay nadie dentro en este momento.</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {inside.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-xl bg-cream-dark/30 px-3 py-2">
                  <span className="truncate text-sm font-medium text-ink">{nameOf(c.userId)}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-ink-faint">entró {fmtTime(c.createdAt)}</span>
                    <Badge tone="success">{fmtDur(elapsedMin(c.createdAt))}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Movimiento de hoy (entradas y salidas) */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-ink">Movimiento de hoy</h2>
            <Button variant="ghost" onClick={load}>Actualizar</Button>
          </div>
          {checkins.length === 0 ? (
            <p className="text-sm text-ink-faint">Aún no hay movimiento hoy.</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {checkins.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-xl bg-cream-dark/30 px-3 py-2">
                  <span className="truncate text-sm font-medium text-ink">{nameOf(c.userId)}</span>
                  <div className="flex items-center gap-2 shrink-0 text-xs text-ink-faint">
                    <span>🟢 {fmtTime(c.createdAt)}</span>
                    {c.exitedAt ? (
                      <>
                        <span>👋 {fmtTime(c.exitedAt)}</span>
                        <Badge tone="neutral">{fmtDur(durMin(c))}</Badge>
                      </>
                    ) : (
                      <Badge tone="success">Dentro</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {scanning && <QrScanner onResult={onScan} onClose={() => setScanning(false)} />}
    </>
  );
}
