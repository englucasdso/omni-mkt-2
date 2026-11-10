/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./frontend/src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        heading: [
          'Bradesco Sans',
          'BradescoSans',
          'Rethink Sans Variable',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Arial',
          'sans-serif'
        ],
        ui: [
          'Rethink Sans Variable',
          'Rethink Sans',
          'RethinkSans',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Arial',
          'sans-serif'
        ],
        sans: [
          'Rethink Sans Variable',
          'Rethink Sans',
          'RethinkSans',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Arial',
          'sans-serif'
        ],
        mono: [
          'ui-monospace',
          'Cascadia Code',
          'Consolas',
          'monospace'
        ],
      },
      colors: {
        'omni-vinho': '#3D000B',
        'omni-bordo': '#7B0209',
        'omni-rubi': '#CC092F',
        'omni-carmim': '#E30328',
        'omni-ink': '#1A1D24',
        'omni-ink-secondary': '#4A505C',
        'omni-muted': '#6B7280',
        'omni-mist': '#F4F5F7',
        'omni-line': '#E3E5EA',
        'omni-line-subtle': '#ECEEF2',
        'omni-surface': '#FFFFFF',
        'omni-brand-primary': 'var(--omni-brand-primary, #7B0209)',
        'omni-brand-accent': 'var(--omni-brand-accent, #E30328)',
        'bradesco-red': 'var(--omni-brand-primary, #7B0209)',
        'bradesco-red-hover': '#5e0107',
        'bradesco-purple': 'var(--omni-brand-primary, #7B0209)',
        'soft-bg': '#F4F5F7',
        'soft-surface': '#ffffff',
        'soft-secondary': '#F4F5F7',
        'soft-graphite': '#1A1D24',
        'soft-gray-text': '#4A505C',
        'soft-border': '#E3E5EA',
      },
      backgroundImage: {
        'omni-gradient': 'linear-gradient(160deg, #3D000B 0%, #7B0209 46%, #CC092F 100%)',
        'omni-action': 'linear-gradient(135deg, #7B0209 0%, #B3061F 60%, #CC092F 100%)',
      },
      boxShadow: {
        'overlay': '0 24px 64px rgba(26,29,36,.18)',
        'neu-card': '0 1px 2px rgba(26,29,36,.04), 0 1px 1px rgba(26,29,36,.02)',
        'neu-card-hover': '0 4px 14px rgba(26,29,36,.07), 0 1px 2px rgba(26,29,36,.04)',
        'neu-raised': '0 1px 2px rgba(26,29,36,.05)',
        'neu-raised-hover': '0 2px 6px rgba(26,29,36,.08)',
        'neu-pressed': 'inset 0 1px 2px rgba(26,29,36,.08)',
        'neu-input': 'none',
      },
      borderRadius: {
        'neu-sm': '6px',
        'neu': '8px',
        'neu-md': '10px',
        'neu-lg': '12px',
        'neu-xl': '14px',
      }
    },
  },
  plugins: [],
};
