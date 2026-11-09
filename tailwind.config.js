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
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Arial',
          'Helvetica',
          'sans-serif'
        ],
        ui: [
          'Rethink Sans',
          'RethinkSans',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Arial',
          'Helvetica',
          'sans-serif'
        ],
        sans: [
          'Rethink Sans',
          'RethinkSans',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Arial',
          'Helvetica',
          'sans-serif'
        ],
      },
      colors: {
        'omni-brand-primary': 'var(--omni-brand-primary, #7B0209)',
        'omni-brand-accent': 'var(--omni-brand-accent, #CC092F)',
        'omni-vinho': '#3D000B',
        'omni-bordo': '#7B0209',
        'omni-rubi': '#CC092F',
        'omni-carmim': '#E30328',
        'omni-ink': '#1A1D24',
        'omni-line': '#E3E5EA',
        'omni-mist': '#F4F5F7',
        'bradesco-red': 'var(--omni-brand-primary, #7B0209)',
        'bradesco-red-hover': '#5e0107',
        'bradesco-purple': 'var(--omni-brand-primary, #7B0209)',
        'soft-bg': '#F4F5F7',
        'soft-surface': '#ffffff',
        'soft-secondary': '#f0f3f6',
        'soft-graphite': '#1A1D24',
        'soft-gray-text': '#64748b',
        'soft-border': '#E3E5EA',
      },
      // Nomes "neu-*" mantidos por compatibilidade; valores agora seguem a linguagem flat enterprise.
      boxShadow: {
        'neu-card': '0 1px 2px rgba(26, 29, 36, 0.04), 0 1px 1px rgba(26, 29, 36, 0.02)',
        'neu-card-hover': '0 4px 14px rgba(26, 29, 36, 0.07), 0 1px 2px rgba(26, 29, 36, 0.04)',
        'neu-raised': '0 1px 2px rgba(26, 29, 36, 0.05)',
        'neu-raised-hover': '0 2px 6px rgba(26, 29, 36, 0.08)',
        'neu-pressed': 'inset 0 1px 2px rgba(26, 29, 36, 0.08)',
        'neu-input': 'none',
        'overlay': '0 24px 64px rgba(26, 29, 36, 0.18), 0 2px 6px rgba(26, 29, 36, 0.06)',
      },
      borderRadius: {
        'neu-sm': '6px',
        'neu': '8px',
        'neu-md': '10px',
        'neu-lg': '12px',
        'neu-xl': '14px',
      },
      backgroundImage: {
        'omni-gradient': 'linear-gradient(160deg, #3D000B 0%, #7B0209 46%, #CC092F 100%)',
        'omni-action': 'linear-gradient(135deg, #7B0209 0%, #B3061F 60%, #CC092F 100%)',
      }
    },
  },
  plugins: [],
};
