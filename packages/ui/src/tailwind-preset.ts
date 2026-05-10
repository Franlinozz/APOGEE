import type { Config } from 'tailwindcss';

const preset: Omit<Config, 'content'> = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        /* Surfaces */
        bg:       'rgb(var(--color-bg) / <alpha-value>)',
        surface:  'rgb(var(--color-surface) / <alpha-value>)',
        elevated: 'rgb(var(--color-elevated) / <alpha-value>)',

        /* Typography */
        fg:         'rgb(var(--color-fg) / <alpha-value>)',
        'fg-muted': 'rgb(var(--color-fg-muted) / <alpha-value>)',
        'fg-faint': 'rgb(var(--color-fg-faint) / <alpha-value>)',

        /* Accent */
        accent:       'rgb(var(--color-accent) / <alpha-value>)',
        'accent-light': 'rgb(var(--color-accent-light) / <alpha-value>)',

        /* Status */
        success: 'rgb(var(--color-success) / <alpha-value>)',
        warning: 'rgb(var(--color-warning) / <alpha-value>)',
        danger:  'rgb(var(--color-danger) / <alpha-value>)',
        neutral: 'rgb(var(--color-neutral) / <alpha-value>)',

        /* Legacy aliases — keep backward compat */
        ink:   'rgb(var(--color-bg) / <alpha-value>)',
        brand: 'rgb(var(--color-accent) / <alpha-value>)',
        line:  'var(--color-line)',
      },

      borderColor: {
        DEFAULT:  'var(--color-line)',
        bright:   'var(--color-line-bright)',
        accent:   'var(--color-line-accent)',
      },

      boxShadow: {
        glow:       'var(--shadow-glow)',
        'glow-sm':  'var(--shadow-glow-sm)',
        card:       'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
        'inner-glow': 'inset 0 1px 0 var(--color-line-bright)',
      },

      fontFamily: {
        sans: ['var(--font-geist-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
      },

      fontSize: {
        /* Override base sizes with tighter line heights */
        xs:   ['0.75rem',  { lineHeight: '1rem' }],
        sm:   ['0.875rem', { lineHeight: '1.25rem' }],
        base: ['1rem',     { lineHeight: '1.5rem' }],
        lg:   ['1.125rem', { lineHeight: '1.75rem' }],
        xl:   ['1.25rem',  { lineHeight: '1.75rem' }],
        '2xl':['1.5rem',   { lineHeight: '2rem' }],
        '3xl':['1.875rem', { lineHeight: '2.25rem' }],
        '4xl':['2.25rem',  { lineHeight: '2.5rem' }],
        '5xl':['3rem',     { lineHeight: '1.15' }],
        '6xl':['3.75rem',  { lineHeight: '1.1' }],
        '7xl':['4.5rem',   { lineHeight: '1.05' }],
      },

      letterSpacing: {
        tight:   '-0.02em',
        tighter: '-0.03em',
        display: '-0.04em',
      },

      borderRadius: {
        sm:  'var(--radius-sm)',
        DEFAULT: 'var(--radius)',
        lg:  'var(--radius-lg)',
        xl:  'var(--radius-xl)',
      },

      transitionDuration: {
        fast: '120ms',
        base: '200ms',
        slow: '350ms',
      },

      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.19, 1, 0.22, 1)',
      },

      keyframes: {
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'rise-in': {
          '0%':   { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.4' },
        },
      },

      animation: {
        shimmer:  'shimmer 2s linear infinite',
        'fade-in': 'fade-in 0.3s ease-out',
        'rise-in': 'rise-in 0.4s cubic-bezier(0.19, 1, 0.22, 1)',
        pulse:    'pulse 2s ease-in-out infinite',
      },
    },
  },
};

export default preset;
