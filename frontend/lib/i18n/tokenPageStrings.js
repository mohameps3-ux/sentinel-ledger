import { S } from "./stringRow";

/** @type {Record<string, Record<string, string>>} */
export const TOKEN_PAGE_STRINGS = {
  "token.pageTitleShort": S("Token — Sentinel Ledger", { es: "Token — Sentinel Ledger" }),
  "token.pageDescMint": S(
    "Open a Solana mint to see grades, liquidity, smart money flow, and deployer intel.",
    {
      es: "Abre un mint de Solana para ver notas, liquidez, flujo de smart money e intel del deployer."
    }
  ),
  "token.pageDescRetry": S("Token intelligence for this Solana mint. Retry if data is temporarily unavailable.", {
    es: "Intel del token para este mint de Solana. Reintenta si los datos no están disponibles."
  }),
  "token.pageDescLive": S(
    "Live grade, liquidity, smart money flow, and deployer intel for {{symbol}} on Solana. Not financial advice.",
    {
      es: "Nota en vivo, liquidez, flujo de smart money e intel del deployer para {{symbol}} en Solana. No es asesoramiento financiero."
    }
  ),
  "token.invalidTitle": S("Invalid token URL", { es: "URL de token no válida" }),
  "token.invalidBody": S(
    "Use a full Solana mint in the path (for example /token/<mint>).",
    { es: "Usa un mint completo de Solana en la ruta (por ejemplo /token/<mint>)." }
  ),
  "token.errorTitle": S("Data unavailable", { es: "Datos no disponibles" }),
  "token.errorBody": S("We could not fetch token data right now. Please retry in a moment.", {
    es: "No pudimos obtener los datos del token ahora. Reintenta en un momento."
  }),
  "token.noDataTitle": S("No data available", { es: "Sin datos disponibles" }),
  "token.noDataBody": S("This token could not be resolved or has no market data yet.", {
    es: "No se pudo resolver el token o aún no hay datos de mercado."
  }),
  "token.incompleteTitle": S("Incomplete response", { es: "Respuesta incompleta" }),
  "token.incompleteBody": S(
    "The server returned a payload without market or analysis fields — you would otherwise see an endless loading state here. Retry, or confirm this mint has a live pair on supported venues (DexScreener path).",
    {
      es: "El servidor devolvió datos sin campos de mercado o análisis; sin esto verías carga infinita. Reintenta o confirma que el mint tiene par en vivo en venues soportados (ruta DexScreener)."
    }
  ),
  "token.retry": S("Retry", { es: "Reintentar", fr: "Réessayer" }),
  "token.retrying": S("Retrying…", { es: "Reintentando…" }),

  "token.conv.title": S("Convergence detected", { es: "Convergencia detectada" }),
  "token.conv.body": S("{{count}} smart wallets bought in ~{{minutes}}m:", {
    es: "{{count}} smart wallets compraron en ~{{minutes}} m:"
  }),

  "token.red.walletCoord": S("Wallet coordination", { es: "Coordinación de wallets" }),
  "token.red.abortNote": S("Cluster no longer met prepare criteria — stand down or reassess.", {
    es: "El clúster ya no cumple criterios de preparación — detén o reevalúa."
  }),

  "token.red.priorIntro": S("Prior same-cluster signals (other mints): {{a}}{{suffix}}.", {
    es: "Señales previas del mismo clúster (otros mints): {{a}}{{suffix}}."
  }),
  "token.red.priorSuffixMints": S(" across {{m}} distinct mints", { es: " en {{m}} mints distintos" }),
  "token.red.meanLeadPrior": S("Mean lead (prior): ~{{s}}s. ", {
    es: "Media de adelanto (previo): ~{{s}} s. "
  }),
  "token.red.windowLead": S("This window lead: {{s}}s. ", { es: "Adelanto en esta ventana: {{s}} s. " }),
  "token.red.priorMeanScore": S("Prior mean cluster score: {{s}}.", {
    es: "Puntuación media previa del clúster: {{s}}."
  }),

  "token.red.verifiedIntro": S(
    "With verified follow-through (T+N market vs entry at alert, min ≥{{pct}}%; legacy rows use signal_performance if no market row): {{pump}} of prior cluster alerts{{mintPart}}. ",
    {
      es: "Con seguimiento verificado (mercado T+N vs entrada en la alerta, mín. ≥{{pct}}%; filas legacy usan signal_performance si no hay fila de mercado): {{pump}} de alertas de clúster previas{{mintPart}}. "
    }
  ),
  "token.red.verifiedMints": S(", {{n}} distinct mints", { es: ", {{n}} mints distintos" }),
  "token.red.meanOutcome": S("Mean resolved outcome% on those: {{v}}%. ", {
    es: "Media de resultado % resuelto en esas: {{v}}%. "
  }),
  "token.red.meanLeadVerified": S("Mean lead when outcome verified: ~{{s}}s.", {
    es: "Media de adelanto con resultado verificado: ~{{s}} s."
  }),

  "token.status.connected": S("Connected", { es: "Conectado", fr: "Connecté" }),
  "token.status.reconnecting": S("Reconnecting", { es: "Reconectando", fr: "Reconnexion" }),
  "token.status.disconnected": S("Disconnected", { es: "Desconectado", fr: "Déconnecté" }),

  "token.soundOn": S("🔊 Sound On", { es: "🔊 Sonido on" }),
  "token.soundOff": S("🔈 Sound Off", { es: "🔈 Sonido off" }),

  "token.link.tgAlerts": S("Telegram alerts", { es: "Alertas Telegram" }),
  "token.link.proAlerts": S("PRO · alerts", { es: "PRO · alertas" }),
  "token.link.proAlertsShort": S("PRO alerts", { es: "Alertas PRO" }),

  "token.stat.liq": S("Liquidity", { es: "Liquidez", fr: "Liquidité" }),
  "token.stat.vol24": S("24h volume", { es: "Volumen 24 h", fr: "Volume 24 h" }),
  "token.stat.fdv": S("FDV", { es: "FDV" }),
  "token.stat.liveFeed": S("Live feed", { es: "Feed en vivo", fr: "Flux en direct" }),
  "token.stat.na": S("N/A", { es: "N/D" }),

  "token.panel.momentum": S("⚡ Momentum", { es: "⚡ Momentum" }),
  "token.panel.holders": S("👥 Holders Distribution", { es: "👥 Distribución de holders" }),
  "token.panel.deployer": S("🔍 Deployer Intelligence", { es: "🔍 Intel del deployer" }),
  "token.panel.liveTx": S("📡 Live Transactions", { es: "📡 Transacciones en vivo" }),
  "token.panel.smartMoney": S("🧠 Smart Money Activity", { es: "🧠 Actividad smart money" }),
  "token.panel.badgeTx": S("{{n}} tx", { es: "{{n}} tx" }),
  "token.panel.badgeIntel": S("intel", { es: "intel" }),

  "token.nav.chart": S("Chart", { es: "Gráfico", fr: "Graphique" }),
  "token.nav.intel": S("Intel", { es: "Intel" }),
  "token.nav.flow": S("Flow", { es: "Flujo", fr: "Flux" })
};
