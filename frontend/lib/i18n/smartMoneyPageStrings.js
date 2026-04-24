import { S } from "./stringRow";

/** @type {Record<string, Record<string, string>>} */
export const SMART_MONEY_PAGE_STRINGS = {
  "smart.pageTitle": S("Smart Money Wallets — Sentinel Ledger", {
    es: "Wallets smart money — Sentinel Ledger"
  }),
  "smart.pageDesc": S(
    "Top Solana smart wallets by win rate, 30d PnL, ROI vs average ticket size, and recent signal flow.",
    {
      es: "Top wallets Solana por win rate, PnL 30d, ROI vs tamaño medio de ticket y flujo de señales."
    }
  ),
  "smart.label": S("Smart Money", { es: "Smart money", zh: "聪明钱", ko: "스마트 머니", ja: "スマートマネー", pt: "Smart money" }),
  "smart.hero.h1.favorites": S("Favorites in top {{limit}}{{suffix}}", {
    es: "Favoritos en el top {{limit}}{{suffix}}"
  }),
  "smart.hero.h1.top": S("Top {{limit}} smart wallets", { es: "Top {{limit}} smart wallets" }),
  "smart.hero.body.favorites": S(
    "Only favorite wallets that fall within this top {{limit}} are shown. If you starred wallets outside the window, raise the limit (URL ?limit=100) or clear the filter.",
    {
      es: "Sólo aparecen carteras favoritas que caen dentro de este top {{limit}}. Si añadiste estrellas a wallets fuera de la ventana, sube el límite (URL ?limit=100) o quita el filtro."
    }
  ),
  "smart.hero.body.default": S(
    "Ranked by win rate with 30d PnL, estimated return versus average position size, and best resolved signal move when result_pct is populated. Source: {{source}}{{rows}}.",
    {
      es: "Orden por win rate con PnL 30d, retorno estimado vs tamaño medio de posición y mejor movimiento de señal resuelta cuando result_pct está rellenado. Fuente: {{source}}{{rows}}."
    }
  ),
  "smart.hero.body.tail": S(
    "Tap or click a row or card for the panel. Star = local favorite. URL: /smart-money?limit=10–100 &favorites=1.",
    {
      es: "Toca o haz clic en fila o carta para el panel. Estrella = favorito local. URL: /smart-money?limit=10–100 &favorites=1."
    }
  ),
  "smart.hero.rowsMeta": S(" · {{count}} rows{{limitHint}}", {
    es: " · {{count}} filas{{limitHint}}"
  }),
  "smart.hero.limitHint": S(" (API limit {{limit}})", { es: " (límite API {{limit}})" }),
  "smart.hero.trending": S("Trending feed: {{state}} · Local favorites: {{fav}} ·", {
    es: "Feed trending: {{state}} · Favoritos locales: {{fav}} ·"
  }),
  "smart.hero.trending.degraded": S("degraded", { es: "degradado" }),
  "smart.hero.trending.connected": S("connected", { es: "conectado" }),
  "smart.hero.refreshLb": S("Refresh leaderboard", { es: "Actualizar ranking" }),

  "smart.filters.label": S("Filters", { es: "Filtros", fr: "Filtres" }),
  "smart.filters.apiLimit": S("API limit (URL ?limit=)", { es: "Límite API (URL ?limit=)" }),
  "smart.filters.chain": S("Chain", { es: "Cadena" }),
  "smart.filters.opt.solana": S("Solana", { es: "Solana" }),
  "smart.filters.opt.all": S("All (same dataset)", { es: "Todo (mismo dataset)" }),
  "smart.filters.minWr": S("Min win rate %", { es: "Win rate mín %" }),
  "smart.filters.minTrades": S("Min total trades", { es: "Trades totales mín" }),
  "smart.filters.narrativeLang": S("Narrative lang", { es: "Idioma narrativa" }),
  "smart.filters.favoritesOnly": S("Favorites only (in this top)", { es: "Sólo favoritos (en este top)" }),
  "smart.filters.roiNote": S(
    "ROI column is 30d PnL ÷ avg position size — a coarse multiple, not leverage-adjusted APR. The limit stays in the address bar; share the link.",
    {
      es: "La columna ROI es PnL 30d ÷ tamaño medio de posición — múltiple aproximado, no APR ajustado por apalancamiento. El límite queda en la barra de direcciones; comparte el enlace."
    }
  ),
  "smart.select.default50": S("50 (default)", { es: "50 (defecto)" }),

  "smart.loading": S("Loading wallets…", { es: "Cargando wallets…" }),
  "smart.errorFallback": S("Could not load leaderboard.", { es: "No se pudo cargar el ranking." }),
  "smart.empty.title": S("No rows match filters (or smart_wallets is empty).", {
    es: "Ninguna fila coincide con los filtros (o smart_wallets está vacío)."
  }),
  "smart.empty.hint": S("Run npm run seed:terminal-home in backend, or widen filters.", {
    es: "Ejecuta npm run seed:terminal-home en el backend, o amplía filtros."
  }),
  "smart.empty.upgrade": S("Upgrade for token-level smart money", {
    es: "Mejorar para smart money a nivel token"
  }),

  "smart.favEmpty.title": S("No favorites are in the top {{limit}} right now.", {
    es: "Ningún favorito entra en el top {{limit}} ahora."
  }),
  "smart.favEmpty.hint": S('Raise limit to 100, uncheck "Favorites only", or star rows in this table and re-enable the filter.', {
    es: 'Sube limit a 100, desmarca "Sólo favoritos", o marca estrella en filas de esta tabla y vuelve a activar el filtro.'
  }),
  "smart.favEmpty.clear": S("Clear favorites filter", { es: "Quitar filtro de favoritos" }),

  "smart.th.fav": S("Favorite (local)", { es: "Favorito (local)" }),
  "smart.th.rank": S("#", { es: "#" }),
  "smart.th.wallet": S("Wallet", { es: "Wallet" }),
  "smart.th.winRate": S("Win rate", { es: "Win rate" }),
  "smart.th.wrReal": S("WR real 5m/30m/2h", { es: "WR real 5m/30m/2h" }),
  "smart.th.roi": S("30d ROI†", { es: "ROI 30d†" }),
  "smart.th.pnl": S("30d PnL", { es: "PnL 30d" }),
  "smart.th.trades": S("Trades", { es: "Trades" }),
  "smart.th.best": S("Best trade", { es: "Mejor trade" }),
  "smart.th.lastSeen": S("Last seen", { es: "Última vez" }),
  "smart.th.call": S("Call", { es: "Llamada" }),

  "smart.fav.removeTitle": S("Remove from favorites", { es: "Quitar de favoritos" }),
  "smart.fav.addTitle": S("Add to favorites (this device only)", { es: "Añadir a favoritos (solo en este dispositivo)" }),
  "smart.fav.aria": S("Favorite", { es: "Favorito" }),
  "smart.fav.mobileTitle": S("Favorite (local)", { es: "Favorito (local)" }),
  "smart.globalRankTitle": S("Rank in top {{limit}} (full API ranking)", {
    es: "Puesto en el top {{limit}} (ranking completo de la API)"
  }),
  "smart.global": S("global", { es: "global" }),
  "smart.lowSample": S("Low sample", { es: "Muestra baja" }),
  "smart.lowSampleMobile": S("Low sample (n<{{n}})", { es: "Muestra baja (n<{{n}})" }),
  "smart.pending": S("pending", { es: "pendiente" }),
  "smart.behavior": S("Behavior", { es: "Comportamiento" }),
  "smart.panel.close": S("Close panel", { es: "Cerrar panel" }),
  "smart.panel.open": S("Open panel", { es: "Abrir panel" }),
  "smart.panel.openFull": S("Open full panel", { es: "Abrir panel completo" }),
  "smart.detail.title": S("Full detail", { es: "Detalle completo" }),
  "smart.narrative.title": S("Assisted narrative", { es: "Narrativa asistida" }),

  "smart.decision.follow": S("FOLLOW", { es: "SEGUIR" }),
  "smart.decision.monitor": S("MONITOR", { es: "MONITORIZAR" }),
  "smart.decision.ignore": S("IGNORE", { es: "IGNORAR" }),

  "smart.mobile.win": S("Win", { es: "Win" }),
  "smart.mobile.roi": S("ROI†", { es: "ROI†" }),
  "smart.mobile.trades": S("Trades", { es: "Trades" }),
  "smart.mobile.bestSignal": S("Best signal:", { es: "Mejor señal:" }),
  "smart.mobile.on": S("on", { es: "en" }),
  "smart.mobile.pnl30": S("30d", { es: "30d" }),

  "smart.activity.label": S("Recent activity", { es: "Actividad reciente" }),
  "smart.activity.refresh": S("Refresh feed", { es: "Actualizar feed" }),
  "smart.activity.loading": S("Loading latest touches…", { es: "Cargando últimos toques…" }),
  "smart.activity.error": S("Activity unavailable.", { es: "Actividad no disponible." }),
  "smart.activity.empty": S("No recent rows in smart_wallet_signals.", {
    es: "No hay filas recientes en smart_wallet_signals."
  })
};
