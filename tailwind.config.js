/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta "Premium Zen Tech". Los tokens de superficie, texto y menta se
        // leen en runtime (white-label profundo): `rgb(var(--token)/<alpha>)`
        // permite además opacidades (bg-cream-dark/40, text-ink/70, …). Los
        // valores por defecto viven en src/lib/theme.ts (iguales a los de antes).
        forest: {
          DEFAULT: '#4A5D55', // Verde Salvia Profundo (Primario)
          light: '#6E837A',
          dark: '#3A4A43',
        },
        // Acento menta/cian — energía y movimiento.
        mint: {
          DEFAULT: 'rgb(var(--mint) / <alpha-value>)',
          soft: 'rgb(var(--mint-soft) / <alpha-value>)',
          dark: 'rgb(var(--mint-dark) / <alpha-value>)',
        },
        cream: {
          light: 'rgb(var(--surface-light) / <alpha-value>)',
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          dark: 'rgb(var(--surface-dark) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--text) / <alpha-value>)',
          soft: 'rgb(var(--text-soft) / <alpha-value>)',
          faint: 'rgb(var(--text-faint) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Avenir', 'Helvetica', 'Arial', 'sans-serif'],
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.5rem',
        '3xl': '2rem',
      },
      boxShadow: {
        // Sombras muy suaves y difusas (nunca negras duras) para dar profundidad zen.
        soft: '0 2px 14px -6px rgba(33, 33, 33, 0.08)',
        card: '0 6px 26px -12px rgba(74, 93, 85, 0.16)',
        zen: '0 10px 34px -14px rgba(74, 93, 85, 0.22)',
        nav: '0 -4px 24px -12px rgba(33, 33, 33, 0.12)',
      },
    },
  },
  plugins: [],
};
