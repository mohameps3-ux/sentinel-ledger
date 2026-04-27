/**
 * Sentinel Ledger — Tailwind config
 *
 * Phase 7C palette migration: Bloomberg-Black
 *  - Surfaces: pure black + dark grays
 *  - Accent: amber (#f59e0b) — replaces violet/indigo across the codebase
 *  - Up: emerald, Down: red — kept (semantic standards in finance)
 *  - Removed all blue/cyan tint by overriding Tailwind built-ins
 *
 * Strategy: we keep the existing token NAMES (sl-violet, sl-blue, etc.) but
 * change their VALUES. Existing className usages (e.g. `bg-sl-violet`) keep
 * working — they just paint amber now. We also override Tailwind's built-in
 * `violet/purple/indigo/sky/cyan/blue` so raw classes like `text-violet-300`
 * automatically follow the institutional palette without touching pages.
 */
const amberRamp = {
  50:  '#fef7e6',
  100: '#fdecc3',
  200: '#fbd99c',
  300: '#fbbf24',
  400: '#f59e0b',
  500: '#f59e0b',
  600: '#d97706',
  700: '#b45309',
  800: '#92400e',
  900: '#78350f',
  950: '#451a03'
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
        // Brand accent (amber/gold) — keeps the old name for compatibility
        'sl-violet': '#f59e0b',
        // Semantic
        'sl-green':  '#10b981',
        'sl-orange': '#f59e0b',
        'sl-red':    '#dc2626',
        // Legacy 'sl-blue' now maps to amber so existing usages stay coherent
        'sl-blue':   '#f59e0b',

        // Override Tailwind built-ins to remove violet/purple/indigo/blue/cyan
        // tint across the whole codebase. We keep semantic emerald/red/amber.
        violet:  amberRamp,
        purple:  amberRamp,
        indigo:  amberRamp,
        fuchsia: amberRamp,
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
