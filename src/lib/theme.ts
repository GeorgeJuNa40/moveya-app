// ============================================================================
// Move yA — Motor de tema (White-label profundo)
// ----------------------------------------------------------------------------
// El white-label (Pro/Premium) no cambia solo el color primario: re-pinta TODA
// la interfaz (fondos, superficies, textos, bordes, acentos) a partir de la
// marca del estudio. Para estudios sin white-label (o sin personalizar) se usa
// la paleta por defecto de Move yA — idéntica a la de siempre.
//
// Tailwind lee estos tokens como `rgb(var(--token) / <alpha-value>)`, por eso
// aquí guardamos los canales "R G B" (no hex): así funcionan también las
// opacidades (bg-cream-dark/40, text-ink/70, etc.).
// ============================================================================
import type { Branding } from './types';

type Rgb = [number, number, number];

const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

function hexToRgb(hex: string): Rgb | null {
  if (!hex) return null;
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const channels = (c: Rgb) => `${c[0]} ${c[1]} ${c[2]}`;

// Mezcla a con b: t=0 → a, t=1 → b.
function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t].map(clamp) as Rgb;
}
const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];
const lighten = (c: Rgb, t: number) => mix(c, WHITE, t);
const darken = (c: Rgb, t: number) => mix(c, BLACK, t);

// Luminosidad relativa simple (0 oscuro … 255 claro) para decidir contrastes.
const luma = (c: Rgb) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

// Paleta por defecto de Move yA (igual a los valores fijos de tailwind.config).
const DEFAULT_VARS: Record<string, string> = {
  '--surface-light': '250 248 243', // #FAF8F3
  '--surface': '244 241 234', // #F4F1EA
  '--surface-dark': '232 227 214', // #E8E3D6
  '--text': '33 33 33', // #212121
  '--text-soft': '74 74 74', // #4A4A4A
  '--text-faint': '138 138 138', // #8A8A8A
  '--mint': '136 184 183', // #88B8B7
  '--mint-soft': '185 214 213', // #B9D6D5
  '--mint-dark': '95 150 149', // #5F9695
  '--card': '255 255 255', // tarjetas/inputs/paneles (blanco por defecto)
  '--card-border': '232 227 214', // borde de tarjetas/inputs (#E8E3D6)
};
const DEFAULT_PRIMARY = '#4A5D55';
const DEFAULT_SECONDARY = '#FAF8F3';
const DEFAULT_ACCENT = '#212121';

// Aplica el tema al documento. `whitelabel` = el plan incluye white-label.
export function applyTheme(branding: Branding | undefined, whitelabel: boolean) {
  const root = document.documentElement;

  const primaryHex = branding?.primaryColor || DEFAULT_PRIMARY;
  const secondaryHex = branding?.secondaryColor || DEFAULT_SECONDARY;
  const accentHex = branding?.accentColor || DEFAULT_ACCENT;

  // Tokens hex que ya usaban las clases .bg-brand / body (compatibilidad).
  root.style.setProperty('--brand-primary', primaryHex);
  root.style.setProperty('--brand-secondary', whitelabel ? secondaryHex : DEFAULT_SECONDARY);
  root.style.setProperty('--brand-accent', whitelabel ? accentHex : DEFAULT_ACCENT);
  root.style.setProperty('--brand-font', `'${branding?.fontFamily ?? 'Inter'}', system-ui, sans-serif`);

  const primary = hexToRgb(primaryHex);
  root.style.setProperty('--brand-primary-rgb', primary ? channels(primary) : '74 93 85');

  // La paleta PROFUNDA (fondos/superficies/textos) solo se re-pinta si el estudio
  // tiene white-label Y además personalizó su fondo o su texto. Así, quien no ha
  // tocado nada (o solo cambió el color primario) conserva EXACTO el look Move yA
  // y solo cambian los acentos de marca. Evita cualquier cambio inesperado.
  const sameHex = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  // Color de TEXTO independiente del acento. Si no se definió, se usa el acento
  // (compatibilidad con estudios que ya personalizaron). El acento queda solo
  // para detalles de marca, no para el texto del cuerpo.
  const textHex = branding?.textColor || accentHex;
  const customizedSurface =
    !sameHex(secondaryHex, DEFAULT_SECONDARY) ||
    !sameHex(accentHex, DEFAULT_ACCENT) ||
    (!!branding?.textColor && !sameHex(textHex, DEFAULT_ACCENT));
  const surface = hexToRgb(secondaryHex);
  const text = hexToRgb(textHex);
  if (!whitelabel || !customizedSurface || !surface || !text || !primary) {
    for (const [k, v] of Object.entries(DEFAULT_VARS)) root.style.setProperty(k, v);
    return;
  }

  // ---- White-label profundo: paleta COHERENTE derivada del fondo ----
  // Detectamos si el fondo elegido es oscuro o claro y derivamos TODA la interfaz
  // (tarjetas, textos, bordes, inputs) para que siempre sea legible y cambie de
  // verdad: fondo oscuro → tarjetas y texto claros (modo oscuro); fondo claro →
  // tarjetas blancas y texto oscuro (modo claro).
  const dark = luma(surface) < 128;
  const WHITEISH: Rgb = [245, 245, 245];
  const DARKISH: Rgb = [28, 28, 30];

  // Texto principal: usamos el acento elegido SOLO si contrasta con el fondo;
  // si no, el automático legible según el fondo.
  const autoText: Rgb = dark ? WHITEISH : DARKISH;
  const accentContrasts = Math.abs(luma(text) - luma(surface)) > 90;
  const textFinal = accentContrasts ? text : autoText;

  // Tarjetas/inputs: ligeramente "elevadas" respecto al fondo.
  const card: Rgb = dark ? lighten(surface, 0.1) : luma(surface) > 240 ? [255, 255, 255] : lighten(surface, 0.55);
  const cardBorder: Rgb = dark ? lighten(surface, 0.22) : darken(surface, 0.08);

  // Superficies (fondo, superficies suaves, divisores).
  const surfaceLight = surface; // fondo principal = color elegido
  const surfaceMid = dark ? lighten(surface, 0.05) : mix(surface, DARKISH, 0.04);
  const surfaceDark = dark ? lighten(surface, 0.16) : mix(surface, DARKISH, 0.12);

  // Textos suaves/tenues, mezclados hacia el fondo.
  const textSoft = mix(textFinal, surface, 0.3);
  const textFaint = mix(textFinal, surface, 0.52);

  // Menta/acento secundario armonizado con el primario y el modo.
  const mintBase = primary;
  const mintSoft = dark ? mix(primary, surface, 0.6) : lighten(primary, 0.55);
  const mintDark = darken(primary, 0.18);

  const vars: Record<string, string> = {
    '--surface-light': channels(surfaceLight),
    '--surface': channels(surfaceMid),
    '--surface-dark': channels(surfaceDark),
    '--text': channels(textFinal),
    '--text-soft': channels(textSoft),
    '--text-faint': channels(textFaint),
    '--mint': channels(mintBase),
    '--mint-soft': channels(mintSoft),
    '--mint-dark': channels(mintDark),
    '--card': channels(card),
    '--card-border': channels(cardBorder),
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  // El acento se mantiene como color de MARCA (no se sobreescribe con el texto);
  // el texto del cuerpo usa su propio color (rgb(var(--text))). Así acento y
  // texto son independientes.
  root.style.setProperty('--brand-accent', accentHex);
}
