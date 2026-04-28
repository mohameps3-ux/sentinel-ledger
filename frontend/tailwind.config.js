/**
 * Sentinel Ledger — Tailwind config
 *
 * Sapphire institutional palette:
 *  - Surfaces: near-black + slate panels
 *  - Accent: institutional blue — #2563EB base, #60A5FA highlight
 *  - Up: emerald, Down: red, Heat/warn: amber
 *
 * Strategy: same token names (sl-violet, etc.) map to sapphire blue for legacy classes.
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

/** Maps teal/cyan/indigo/purple/violet utilities to the institutional sapphire ramp. */
const sapphireHueRamp = {
  100: '#DBEAFE',
  200: '#BFDBFE',
  300: '#93C5FD',
  400: '#60A5FA',
  500: '#2563EB',
  600: '#1D4ED8',
  700: '#1E40AF',
  800: '#1E3A8A',
  900: '#1E3A5F',
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
        // Surfaces (Bloomberg-Black + sapphire panels)
        'sl-root':   '#010103',
        'sl-panel':  '#0B0F14',
        'sl-card':   '#0B0F14',
        'sl-border': '#1F2A37',
        'sl-hover':  '#1E3A5F',
        // Text
        'sl-text':   '#E6EDF3',
        'sl-sub':    '#94A3B8',
        'sl-muted':  '#475569',
        // Brand accent — sapphire blue (sl-violet name retained for utilities)
        'sl-violet': '#2563EB',
        // Semantic
        'sl-green':  '#10B981',
        'sl-orange': '#F59E0B',
        'sl-red':    '#FF3B30',
        'sl-blue':   '#2563EB',
        'sl-blue-lt': '#60A5FA',

        // Override Tailwind built-ins — cool legacy hues → sapphire scale
        teal:    sapphireHueRamp,
        cyan:    sapphireHueRamp,
        indigo:  sapphireHueRamp,
        purple:  sapphireHueRamp,
        violet:  sapphireHueRamp,
        fuchsia: champagneGoldRamp,
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
