import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Card } from '../../components/ui';

// Tarjeta para invitar alumnos y coaches: código CEU, links personalizados y QR.
// El link lleva el CEU (y el rol) dentro, así entran sin escribir nada.
export default function InviteCard({ ceuCode }: { ceuCode: string }) {
  const origin = window.location.origin;
  const studentLink = `${origin}/#/?ceu=${encodeURIComponent(ceuCode)}`;
  const coachLink = `${origin}/#/?ceu=${encodeURIComponent(ceuCode)}&role=coach`;
  const operatorLink = `${origin}/#/?ceu=${encodeURIComponent(ceuCode)}&role=operador`;
  const [copied, setCopied] = useState('');

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(''), 1500);
    } catch {
      /* algunos navegadores bloquean el portapapeles */
    }
  };

  return (
    <Card className="p-6 mb-6">
      <h2 className="font-semibold text-ink">Invitaciones</h2>
      <p className="mt-1 mb-4 text-sm text-ink-faint">
        Comparte el link o el código QR. Quien lo abra entra directo a tu estudio, sin escribir nada.
      </p>

      {/* CEU compartido */}
      <div className="mb-5">
        <span className="mb-1 block text-sm font-medium text-ink-soft">Código de Estudio (CEU)</span>
        <div className="flex items-center gap-2 max-w-md">
          <code className="flex-1 rounded-xl bg-cream-dark/50 px-4 py-3 text-lg font-bold tracking-widest text-brand">
            {ceuCode}
          </code>
          <button
            type="button"
            onClick={() => copy(ceuCode, 'ceu')}
            className="rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-cream hover:opacity-90"
          >
            {copied === 'ceu' ? '¡Copiado!' : 'Copiar'}
          </button>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <InviteBlock
          title="👥 Invitar alumnos"
          link={studentLink}
          hint="Tus alumnos se registran y entran de inmediato a tu estudio."
          fileName={`alumnos-${ceuCode}`}
          copyKey="linkAlumno"
          copied={copied}
          onCopy={copy}
        />
        <InviteBlock
          title="🏋️ Invitar coaches"
          link={coachLink}
          hint="El coach se registra como pendiente. Apruébalo en el menú Coaches."
          fileName={`coaches-${ceuCode}`}
          copyKey="linkCoach"
          copied={copied}
          onCopy={copy}
        />
        <InviteBlock
          title="🧾 Invitar recepción / operador"
          link={operatorLink}
          hint="Empleado con acceso limitado: opera miembros, calendario, clases, paquetes y tienda. No ve reportes, configuración ni facturación."
          fileName={`recepcion-${ceuCode}`}
          copyKey="linkOperator"
          copied={copied}
          onCopy={copy}
        />
      </div>
    </Card>
  );
}

function InviteBlock({
  title,
  link,
  hint,
  fileName,
  copyKey,
  copied,
  onCopy,
}: {
  title: string;
  link: string;
  hint: string;
  fileName: string;
  copyKey: string;
  copied: string;
  onCopy: (text: string, key: string) => void;
}) {
  const [qr, setQr] = useState('');

  useEffect(() => {
    QRCode.toDataURL(link, {
      width: 320,
      margin: 1,
      color: { dark: '#4A5D55', light: '#ffffff' },
    })
      .then(setQr)
      .catch(() => setQr(''));
  }, [link]);

  return (
    <div className="rounded-2xl border border-cream-dark p-4">
      <h3 className="mb-2 font-semibold text-ink">{title}</h3>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={link}
          onFocus={(e) => e.target.select()}
          className="flex-1 rounded-xl border border-cream-dark bg-white px-3 py-2.5 text-sm text-ink-soft"
        />
        <button
          type="button"
          onClick={() => onCopy(link, copyKey)}
          className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-cream hover:opacity-90"
        >
          {copied === copyKey ? '¡Copiado!' : 'Copiar'}
        </button>
      </div>
      <p className="mt-1 text-xs text-ink-faint">{hint}</p>

      {qr && (
        <div className="mt-3 flex flex-col items-center gap-2">
          <img src={qr} alt="Código QR de invitación" className="h-36 w-36 rounded-xl border border-cream-dark" />
          <a
            href={qr}
            download={`invitacion-${fileName}.png`}
            className="text-sm font-medium text-brand hover:underline"
          >
            Descargar QR
          </a>
        </div>
      )}
    </div>
  );
}
