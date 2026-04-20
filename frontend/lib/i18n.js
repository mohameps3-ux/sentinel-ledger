/**
 * Lightweight i18n dictionary. Pure-function lookup: no provider, no context.
 *
 * Usage:
 *   import { t, useT } from "../lib/i18n";
 *   t("wallet.summary.loading", "es");           // function form
 *   const tr = useT(lang); tr("wallet.summary.loading"); // hook form
 *
 * Conventions:
 *   - Keys are dot-separated namespaces (e.g. `wayfinding.youAreHere`).
 *   - Add new strings under a clear namespace; English first, then Spanish.
 *   - For interpolation use {{name}} and pass `vars` as third arg.
 */

const SUPPORTED_LANGS = ["en", "es"];
const DEFAULT_LANG = "en";

const DICT = {
  en: {
    common: {
      loading: "Loading...",
      error: "Something went wrong.",
      cache: "cache",
      live: "live",
      back: "Back"
    },
    wayfinding: {
      youAreHere: "You are here",
      goTo: "Go to",
      stayInFlow: "Stay in flow:",
      nextStep: "Next suggested step:",
      jumpAria: "Jump to any tool",
      fomo: [
        "The live strip above keeps moving — refresh or you only see a snapshot.",
        "Next wallet cluster pass may surface a new ENTER before you come back.",
        "If you leave now, you miss the countdown on open entry windows.",
        "Smart-money ranks reorder as 24h PnL updates — stale view = stale decisions."
      ],
      places: {
        home: { title: "Home", detail: "Decision feed, scan, NLU bar" },
        token: { title: "Token", detail: "Single-mint terminal" },
        wallet: { title: "Wallet profile", detail: "Summary + narrative" },
        scanner: { title: "Scanner", detail: "Paste a mint to open token" },
        smartMoney: { title: "Smart money", detail: "Leaderboard + wallet links" },
        results: { title: "Results", detail: "Saved outcomes" },
        compare: { title: "Compare", detail: "Two tokens side by side" },
        watchlist: { title: "Watchlist", detail: "Tokens you track" },
        portfolio: { title: "Portfolio", detail: "Watchlist markets" },
        alerts: { title: "Alerts", detail: "Notifications setup" },
        pricing: { title: "Pricing", detail: "Upgrade path" },
        graveyard: { title: "Graveyard", detail: "Dead / rugged archive" },
        stalker: { title: "Wallet stalker", detail: "Follow wallets" },
        ops: { title: "Ops", detail: "Status + tools" },
        legal: { title: "Legal / contact", detail: "Policies + support" },
        unknown: { title: "Sentinel", detail: "Use the links below to switch screen" }
      },
      links: {
        home: "Home",
        homeDesc: "Feed + scan",
        scanner: "Scanner",
        scannerDesc: "Mint lookup",
        smartMoney: "Smart money",
        smartMoneyDesc: "Wallets + edge",
        watchlist: "Watchlist",
        watchlistDesc: "Your tokens",
        alerts: "Alerts",
        alertsDesc: "Telegram / PRO",
        pricing: "Pricing",
        pricingDesc: "Plans",
        compare: "Compare",
        compareTitle: "Side-by-side tokens",
        portfolio: "Portfolio",
        portfolioTitle: "Markets for watchlist"
      },
      steps: {
        smartMoney: "Open a wallet row for its profile (ES/EN narrative), or use Scanner if you already have a mint.",
        scanner: "Paste a Solana mint (32–44 characters), then Analyze to open the full token terminal.",
        watchlist:
          "Add mints from Home or Scanner, then open Portfolio for watchlist markets or Compare for two tokens side by side.",
        token: "Add this mint to Watchlist to track it, check Smart money for wallets in flow, or Compare it against another token.",
        wallet: "Return to Smart money for the full leaderboard, or Scanner if you want to pivot to a specific mint."
      }
    },
    wallet: {
      narrative: {
        loading: "Generating narrative...",
        errorTitle: "Could not build narrative",
        headlineFallback: "Wallet narrative"
      },
      summary: {
        loading: "Loading summary...",
        notFound: "Wallet not found in smart_wallets yet.",
        loadError: "Could not load wallet summary ({{error}}).",
        winRate: "Win rate",
        pnl30d: "30d PnL",
        trades: "Trades",
        bestTrade: "Best trade",
        lastSeen: "Last seen"
      },
      page: {
        loadingWallet: "Loading wallet...",
        invalidAddress: "Invalid wallet address.",
        profileLabel: "Wallet profile",
        backToSmartMoney: "Back to Smart Money",
        switchToOther: "Español",
        whyThisWallet: "Why this wallet?"
      }
    }
  },
  es: {
    common: {
      loading: "Cargando...",
      error: "Algo salió mal.",
      cache: "cache",
      live: "en vivo",
      back: "Volver"
    },
    wayfinding: {
      youAreHere: "Estás en",
      goTo: "Ir a",
      stayInFlow: "Mantén el flujo:",
      nextStep: "Siguiente paso sugerido:",
      jumpAria: "Saltar a cualquier herramienta",
      fomo: [
        "La franja en vivo no para — recarga o solo verás una foto fija.",
        "El próximo barrido de clusters puede sacar un ENTER antes de que vuelvas.",
        "Si te vas ahora, pierdes la cuenta atrás de las ventanas de entrada abiertas.",
        "Los rankings de smart money se reordenan con el PnL 24h — vista vieja, decisión vieja."
      ],
      places: {
        home: { title: "Inicio", detail: "Feed de decisión, escáner y barra NLU" },
        token: { title: "Token", detail: "Terminal de un único mint" },
        wallet: { title: "Perfil de wallet", detail: "Resumen y narrativa" },
        scanner: { title: "Escáner", detail: "Pega un mint y abre el token" },
        smartMoney: { title: "Smart money", detail: "Ranking y enlaces a wallets" },
        results: { title: "Resultados", detail: "Outcomes guardados" },
        compare: { title: "Comparar", detail: "Dos tokens lado a lado" },
        watchlist: { title: "Watchlist", detail: "Tokens que sigues" },
        portfolio: { title: "Cartera", detail: "Mercados de tu watchlist" },
        alerts: { title: "Alertas", detail: "Configuración de avisos" },
        pricing: { title: "Precios", detail: "Mejora a PRO" },
        graveyard: { title: "Cementerio", detail: "Archivo de tokens muertos / rug" },
        stalker: { title: "Wallet stalker", detail: "Sigue wallets" },
        ops: { title: "Ops", detail: "Estado y herramientas" },
        legal: { title: "Legal / contacto", detail: "Políticas y soporte" },
        unknown: { title: "Sentinel", detail: "Usa los enlaces para cambiar de pantalla" }
      },
      links: {
        home: "Inicio",
        homeDesc: "Feed y escáner",
        scanner: "Escáner",
        scannerDesc: "Buscar mint",
        smartMoney: "Smart money",
        smartMoneyDesc: "Wallets y edge",
        watchlist: "Watchlist",
        watchlistDesc: "Tus tokens",
        alerts: "Alertas",
        alertsDesc: "Telegram / PRO",
        pricing: "Precios",
        pricingDesc: "Planes",
        compare: "Comparar",
        compareTitle: "Tokens lado a lado",
        portfolio: "Cartera",
        portfolioTitle: "Mercados de la watchlist"
      },
      steps: {
        smartMoney:
          "Abre la fila de una wallet para ver su perfil (narrativa ES/EN), o usa el Escáner si ya tienes un mint.",
        scanner: "Pega un mint de Solana (32–44 caracteres) y pulsa Analyze para abrir el terminal del token.",
        watchlist:
          "Añade mints desde Inicio o el Escáner; luego abre Cartera para mercados o Comparar para dos tokens.",
        token:
          "Añade este mint a la Watchlist para seguirlo, mira Smart money por wallets activas o compáralo con otro token.",
        wallet: "Vuelve a Smart money para el ranking completo, o al Escáner si quieres saltar a un mint concreto."
      }
    },
    wallet: {
      narrative: {
        loading: "Generando narrativa...",
        errorTitle: "No se pudo generar narrativa",
        headlineFallback: "Narrativa de wallet"
      },
      summary: {
        loading: "Cargando resumen...",
        notFound: "La wallet aún no está en smart_wallets.",
        loadError: "No se pudo cargar el resumen ({{error}}).",
        winRate: "Win rate",
        pnl30d: "PnL 30d",
        trades: "Trades",
        bestTrade: "Mejor trade",
        lastSeen: "Visto por última vez"
      },
      page: {
        loadingWallet: "Cargando wallet...",
        invalidAddress: "Dirección de wallet no válida.",
        profileLabel: "Perfil de wallet",
        backToSmartMoney: "Volver a Smart Money",
        switchToOther: "English",
        whyThisWallet: "¿Por qué esta wallet?"
      }
    }
  }
};

function pickLang(lang) {
  const key = String(lang || "").toLowerCase();
  return SUPPORTED_LANGS.includes(key) ? key : DEFAULT_LANG;
}

function lookup(node, parts) {
  let cur = node;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

function interpolate(template, vars) {
  if (typeof template !== "string" || !vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ""));
}

/**
 * Translate a key. If missing in `lang`, fallback to English; if also missing, return the key itself.
 *
 * @param {string} key - dotted path, e.g. "wallet.summary.loading"
 * @param {string} [lang]
 * @param {Record<string, string | number>} [vars]
 */
export function t(key, lang, vars) {
  const parts = String(key || "").split(".").filter(Boolean);
  if (!parts.length) return "";
  const langKey = pickLang(lang);
  const localized = lookup(DICT[langKey], parts);
  if (localized != null) return interpolate(localized, vars);
  const fallback = lookup(DICT[DEFAULT_LANG], parts);
  if (fallback != null) return interpolate(fallback, vars);
  return key;
}

/** React-style hook (no actual React state needed; just binds the language). */
export function useT(lang) {
  const langKey = pickLang(lang);
  return (key, vars) => t(key, langKey, vars);
}

export const SUPPORTED_LOCALES = SUPPORTED_LANGS;
export const DEFAULT_LOCALE = DEFAULT_LANG;
