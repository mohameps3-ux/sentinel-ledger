/**
 * Sentinel Ledger — Tailwind config
 *
 * Phase 7C+ Champagne Gold (institutional, not terracotta):
 *  - Surfaces: pure black + dark grays
 *  - Accent: clean yellow-gold — #FACC15 base, #FEF08A highlight, #CA8A04 depth
 *    (no copper #c08552 / no amber-500 #f59e0b: reads brown on black)
 *  - Up: emerald, Down: red
 *
 * Strategy: same token names (sl-violet, etc.), single champagne family.
 * violet/purple/indigo/blue/sky/cyan classNames map to this ramp.
 */
const champagneGoldRamp = {
  50:  '#fffbeb',
  100: '#fef3c7',
  200: '#fef08a',
  300: '#fde047',
  400: '#facc15',
  500: '#eab308',
  600: '#ca8a04',
  700: '#a16207',
  800: '#854d0e',
  900: '#713f12',
  950: '#422006'
};

const neutralRamp = {
  50:  '#fafafa',
  100: '#f5f5f5',
  200: '#e5e5e5',
  300: '#d4d4d4',
  400: '#a3a3a3',
  500: '#737373',
  600: '#525252',
  700: '#404040',
  800: '#262626',
  900: '#171717',
  950: '#0a0a0a'
};

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
        // Surfaces (Bloomberg-Black)
        'sl-root':   '#0a0a0a',
        'sl-panel':  '#0d0d0d',
        'sl-card':   '#141414',
        'sl-border': '#1f1f1f',
        'sl-hover':  '#262626',
        // Text
        'sl-text':   '#fafafa',
        'sl-sub':    '#a3a3a3',
        'sl-muted':  '#737373',
        // Brand accent — single champagne gold (hex matches CSS tokens)
        'sl-violet': '#facc15',
        // Semantic
        'sl-green':  '#10b981',
        'sl-orange': '#facc15',
        'sl-red':    '#dc2626',
        // Legacy 'sl-blue' — same gold accent
        'sl-blue':   '#facc15',

        // Override Tailwind built-ins — all warm legacy hues → champagne scale
        violet:  champagneGoldRamp,
        purple:  champagneGoldRamp,
        indigo:  champagneGoldRamp,
        fuchsia: champagneGoldRamp,
        cyan:    neutralRamp,
        sky:     neutralRamp,
        blue:    neutralRamp,
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
