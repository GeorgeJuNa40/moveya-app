import { useEffect } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Primitivas UI compartidas — estilo "Premium Zen Tech" (minimalista, wellness).
// ---------------------------------------------------------------------------

// Modal accesible: cierra con Esc o al hacer clic fuera; marca role="dialog".
export function Modal({
  onClose,
  children,
  className = 'w-full max-w-lg',
}: {
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className={className} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
}) {
  // Botones tipo "píldora" (Premium Zen Tech): grandes para el pulgar, con
  // sombras suaves y una micro-elevación al pasar/tocar.
  const base =
    'inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none';
  const styles: Record<string, string> = {
    primary: 'bg-brand text-cream-light shadow-card hover:shadow-zen hover:-translate-y-0.5 active:translate-y-0',
    accent: 'bg-mint text-ink shadow-card hover:bg-mint-dark hover:text-white hover:-translate-y-0.5',
    secondary: 'bg-brand-soft text-brand-soft hover:brightness-95',
    ghost: 'bg-transparent text-brand hover:bg-brand-soft',
    danger: 'bg-red-50 text-red-700 hover:bg-red-100',
  };
  return (
    <button className={`${base} ${styles[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  // Tarjetas con bordes redondeados suaves y sombra difusa (sin bordes duros).
  return (
    <div
      className={`rounded-2xl bg-card shadow-card ring-1 ring-black/[0.04] ${className}`}
    >
      {children}
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'brand';
}) {
  const tones: Record<string, string> = {
    neutral: 'bg-cream-dark text-ink-soft',
    success: 'bg-green-100 text-green-800',
    warning: 'bg-amber-100 text-amber-800',
    danger: 'bg-red-100 text-red-700',
    brand: 'bg-brand text-cream',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-faint">{label}</p>
          <p className="mt-2 text-3xl font-bold text-ink">{value}</p>
          {hint && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
        </div>
        {icon && (
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-soft text-xl text-brand">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex items-center justify-between gap-4 cursor-pointer py-3">
      <div>
        <p className="font-medium text-ink">{label}</p>
        {description && <p className="text-sm text-ink-faint">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
          checked ? 'bg-brand' : 'bg-cream-dark'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
            checked ? 'left-[22px]' : 'left-0.5'
          }`}
        />
      </button>
    </label>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="text-ink-faint mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-cream-dark p-10 text-center text-ink-faint">
      {children}
    </div>
  );
}
