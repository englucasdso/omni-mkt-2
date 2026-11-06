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
        'omni-brand-accent': 'var(--omni-brand-accent, #E30328)',
        'bradesco-red': 'var(--omni-brand-primary, #7B0209)',
        'bradesco-red-hover': '#5e0107',
        'bradesco-purple': 'var(--omni-brand-primary, #7B0209)',
        'soft-bg': '#f6f8fa',
        'soft-surface': '#ffffff',
        'soft-secondary': '#f0f3f6',
        'soft-graphite': '#1e293b',
        'soft-gray-text': '#64748b',
        'soft-border': '#e2e8f0',
      },
      boxShadow: {
        'neu-card': '4px 6px 16px rgba(160, 174, 192, 0.18), -4px -4px 12px rgba(255, 255, 255, 0.9)',
        'neu-card-hover': '6px 8px 20px rgba(160, 174, 192, 0.25), -5px -5px 15px rgba(255, 255, 255, 1)',
        'neu-raised': '2px 3px 7px rgba(160, 174, 192, 0.2), -2px -2px 6px rgba(255, 255, 255, 0.95)',
        'neu-raised-hover': '3px 4px 10px rgba(160, 174, 192, 0.28), -3px -3px 8px rgba(255, 255, 255, 1)',
        'neu-pressed': 'inset 2px 2px 5px rgba(160, 174, 192, 0.28), inset -2px -2px 5px rgba(255, 255, 255, 0.8)',
        'neu-input': 'inset 1.5px 1.5px 4px rgba(160, 174, 192, 0.18), inset -1.5px -1.5px 4px rgba(255, 255, 255, 0.85)',
      },
      borderRadius: {
        'neu-sm': '10px',
        'neu': '14px',
        'neu-md': '16px',
        'neu-lg': '18px',
        'neu-xl': '22px',
      }
    },
  },
  plugins: [],
};
