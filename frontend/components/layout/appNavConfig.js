/**
 * Single source of truth for app nav links (dropdown + mobile menu).
 * Keep labels short — items also appear in a compact "Más" menu on the home page.
 */
export const APP_NAV_LINKS = [
  { href: "/", key: "dash", label: "Dashboard" },
  { href: "/results", key: "results", label: "Results" },
  { href: "/scanner", key: "scanner", label: "Scanner" },
  { href: "/smart-money", key: "smart", label: "Smart Money" },
  { href: "/alerts", key: "alerts", label: "Alerts" },
  { href: "/pricing", key: "pricing", label: "Upgrade PRO" },
  { href: "/graveyard", key: "grave", label: "Graveyard" },
  { href: "/wallet-stalker", key: "stalker", label: "Stalker", isStalker: true },
  { href: "/compare", key: "compare", label: "Compare" },
  { href: "/watchlist", key: "watch", label: "Watchlist" },
  { href: "/portfolio", key: "port", label: "Portfolio" }
];
