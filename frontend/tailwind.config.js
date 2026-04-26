module.exports = {
  content: [
    './pages/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
    './styles/**/*.css',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'sl-root':   '#050509',
        'sl-panel':  '#0A0C14',
        'sl-card':   '#0F1320',
        'sl-border': '#1A2035',
        'sl-hover':  '#242D45',
        'sl-text':   '#F8FAFC',
        'sl-sub':    '#94A3B8',
        'sl-muted':  '#64748B',
        'sl-violet': '#7C3AED',
        'sl-green':  '#10B981',
        'sl-orange': '#F59E0B',
        'sl-red':    '#DC2626',
        'sl-blue':   '#3B82F6',
      },
      fontFamily: {
        'display': ['var(--font-space-grotesk)', 'sans-serif'],
        'ui':      ['var(--font-inter)', 'sans-serif'],
        'mono':    ['var(--font-jetbrains-mono)', 'monospace'],
      },
      fontSize: {
        '2xs':  ['10px', { lineHeight: '14px' }],
        'xs':   ['11px', { lineHeight: '16px' }],
        'sm':   ['13px', { lineHeight: '18px' }],
        'base': ['15px', { lineHeight: '22px' }],
        'lg':   ['18px', { lineHeight: '26px' }],
        'xl':   ['22px', { lineHeight: '30px' }],
        '2xl':  ['28px', { lineHeight: '36px' }],
        '3xl':  ['36px', { lineHeight: '44px' }],
      },
      spacing: {
        '13': '52px',
        '18': '72px',
      },
    },
  },
  plugins: [],
}
