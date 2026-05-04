import { S } from "./stringRow";

/** @type {Record<string, Record<string, string>>} */
export const MEDIUM_PAGES_STRINGS = {
  "scanner.pageTitle": S("Solana Token Scanner — Sentinel Ledger", {
    es: "Escáner de tokens Solana — Sentinel Ledger",
    fr: "Scanner de tokens Solana — Sentinel Ledger",
    de: "Solana-Token-Scanner — Sentinel Ledger",
    pt: "Scanner de tokens Solana — Sentinel Ledger"
  }),
  "scanner.pageDesc": S(
    "Analyze any Solana token: cluster heat, smart money flow, and entry signal.",
    {
      es: "Analiza cualquier token de Solana: calor del clúster, flujo de smart money y señal de entrada."
    }
  ),
  "scanner.label": S("Scanner", { es: "Escáner", fr: "Scanner", de: "Scanner", zh: "扫描", ko: "스캐너", ja: "スキャナ", pt: "Scanner" }),
  "scanner.h1": S("One-click token scan", { es: "Escaneo de token en un clic", fr: "Scan token en un clic", de: "Token-Scan mit einem Klick" }),
  "scanner.body": S(
    "Paste any Solana mint. Sentinel opens a full Decision Engine breakdown with score, red flags, and live flow.",
    {
      es: "Pega cualquier mint de Solana. Sentinel abre el Decision Engine completo con puntuación, banderas rojas y flujo en vivo."
    }
  ),
  "scanner.errorMint": S("Paste a valid Solana mint (32-64 chars).", {
    es: "Pega un mint válido de Solana (32-64 caracteres)."
  }),
  "scanner.scanBtn": S("Scan token", { es: "Escanear token", fr: "Scanner le jeton", de: "Token scannen" }),
  "scanner.backDashboard": S("Back to dashboard", {
    es: "Volver al panel",
    fr: "Retour au tableau de bord",
    de: "Zurück zum Dashboard",
    pt: "Voltar ao painel"
  }),
  "scanner.narrativeLabel": S("MARKET NARRATIVES", {
    es: "NARRATIVAS DE MERCADO",
    fr: "NARRATIFS DE MARCHÉ",
    de: "MARKT-NARRATIVE",
    pt: "NARRATIVAS DE MERCADO"
  }),
  "scanner.narrativeH2": S("Thematic cluster filter · live universe", {
    es: "Filtro por clúster temático · universo en vivo",
    fr: "Filtre par cluster thématique · univers temps réel",
    de: "Thematischer Cluster-Filter · Live-Universum",
    pt: "Filtro de cluster temático · universo ao vivo"
  }),
  "scanner.filter.all": S("ALL", { es: "TODOS" }),
  "scanner.filter.pump": S("PUMP.FUN", { es: "PUMP.FUN" }),
  "scanner.filter.raydium": S("RAYDIUM", { es: "RAYDIUM" }),
  "scanner.filter.new24h": S("NEW <24H", { es: "<24H NUEVO", fr: "NEUF <24H", de: "NEU <24H" }),
  "scanner.filter.highScore": S("HIGH SCORE", { es: "ALTO SCORE" }),

  "scanner.focus.emptyLabel": S("NO FOCUS", { es: "SIN FOCO", de: "KEIN FOKUS" }),
  "scanner.focus.emptyBody": S("Select a row in the universe table to load decision context.", {
    es: "Selecciona una fila en la tabla del universo para cargar el contexto de decisión.",
    de: "Wählen Sie eine Zeile in der Universumstabelle."
  }),
  "scanner.focus.tokenLabel": S("TOKEN:", { es: "TOKEN:", de: "TOKEN:" }),
  "scanner.focus.scoreLabel": S("SCORE:", { es: "SCORE:", de: "SCORE:" }),
  "scanner.focus.statusLabel": S("STATUS:", { es: "ESTADO:", de: "STATUS:" }),

  "scanner.conviction.high": S("HIGH CONVICTION", { es: "ALTA CONVICCIÓN", de: "HOHE ÜBERZEUGUNG" }),
  "scanner.conviction.neutral": S("NEUTRAL", { es: "NEUTRAL", de: "NEUTRAL" }),
  "scanner.conviction.avoid": S("AVOID", { es: "EVITAR", de: "MEIDEN" }),

  "scanner.metric.liquidity": S("Liquidity", { es: "Liquidez", de: "Liquidität" }),
  "scanner.metric.volume": S("Volume", { es: "Volumen", de: "Volumen" }),
  "scanner.metric.momentum": S("Momentum", { es: "Momentum", de: "Momentum" }),
  "scanner.metric.confidence": S("Confidence", { es: "Confianza", de: "Konfidenz" }),

  "scanner.signal.system": S("SYSTEM SIGNAL", { es: "SEÑAL DE SISTEMA", de: "SYSTEMSIGNAL" }),
  "scanner.signal.risk": S("RISK LEVEL", { es: "NIVEL DE RIESGO", de: "RISIKOSTUFE" }),
  "scanner.signal.horizon": S("TIME HORIZON", { es: "HORIZONTE", de: "ZEITHORIZONT" }),
  "scanner.signal.longBias": S("LONG BIAS", { es: "SESGO LONG", de: "LONG-BIAS" }),
  "scanner.signal.neutralStance": S("NEUTRAL STANCE", { es: "POSTURA NEUTRAL", de: "NEUTRALE HALTUNG" }),
  "scanner.signal.avoidExposure": S("AVOID EXPOSURE", { es: "EVITAR EXPOSICIÓN", de: "KEINE EXPOSITION" }),

  "scanner.risk.high": S("HIGH", { es: "ALTO", de: "HOCH" }),
  "scanner.risk.medium": S("MEDIUM", { es: "MEDIO", de: "MITTEL" }),
  "scanner.risk.low": S("LOW", { es: "BAJO", de: "NIEDRIG" }),

  "scanner.horizon.10m": S("10m", { es: "10m", de: "10m" }),
  "scanner.horizon.4h": S("4h", { es: "4h", de: "4h" }),
  "scanner.horizon.24h": S("24h", { es: "24h", de: "24h" }),
  "scanner.horizon.minutes": S("{{m}}m", { es: "{{m}}m", de: "{{m}}m" }),

  "scanner.narrative.line.pumpOrigin": S("Pump.fun origin (launchpad exposure)", {
    es: "Origen Pump.fun (exposición a launchpad)",
    de: "Pump.fun-Ursprung"
  }),
  "scanner.narrative.line.new24h": S("New pool — under 24h on-chain age", {
    es: "Pool nuevo — menos de 24h de antigüedad",
    de: "Neuer Pool <24h"
  }),
  "scanner.narrative.line.highVelocity": S("High velocity volume vs liquidity", {
    es: "Alto volumen relativo a la liquidez",
    de: "Hohe Volumen-Geschwindigkeit"
  }),
  "scanner.narrative.line.fallback": S("Insufficient structured narrative tags — verify on token terminal.", {
    es: "Etiquetas de narrativa insuficientes — verificar en la ficha del token.",
    de: "Keine Narrativ-Tags — Token-Terminal prüfen."
  }),

  "scanner.table.token": S("Token", { es: "Token", de: "Token" }),
  "scanner.table.score": S("Score", { es: "Score", de: "Score" }),
  "scanner.table.liquidity": S("Liquidity", { es: "Liq.", de: "Liq." }),
  "scanner.table.volume": S("Volume", { es: "Vol.", de: "Vol." }),
  "scanner.table.change": S("Change", { es: "Δ%", de: "Δ%" }),
  "scanner.table.route": S("Route", { es: "Ruta", de: "Route" }),
  "scanner.table.intel": S("Intel", { es: "Intel", de: "Intel" }),
  "scanner.table.empty": S("No tokens in this universe slice.", {
    es: "Sin tokens en este corte del universo.",
    de: "Keine Tokens in diesem Universumssegment."
  }),

  "scanner.universe.title": S("UNIVERSE", { es: "UNIVERSO", de: "UNIVERSUM" }),
  "scanner.universe.sub": S("Comparison grid · capped rows", {
    es: "Cuadrícula de comparación · filas limitadas",
    de: "Vergleichsraster"
  }),

  "scanner.narrative.needFocus": S("Focus a token from the table to load narrative context.", {
    es: "Enfoca un token desde la tabla para cargar el contexto narrativo.",
    de: "Token aus der Tabelle wählen."
  }),

  "scanner.filters.heading": S("Universe filters", { es: "Filtros de universo", de: "Universumsfilter" }),

  "results.pageTitle": S("Verified Results — Sentinel Ledger", {
    es: "Resultados verificados — Sentinel Ledger",
    fr: "Résultats vérifiés — Sentinel Ledger",
    de: "Verifizierte Ergebnisse — Sentinel Ledger"
  }),
  "results.pageDesc": S("Real win rate of Sentinel Ledger signals. On-chain data, not promises.", {
    es: "Win rate real de las señales de Sentinel Ledger. Datos on-chain, no promesas."
  }),
  "results.label": S("Transparency", { es: "Transparencia", fr: "Transparence", de: "Transparenz" }),
  "results.h1": S("LIVE SIGNALS — VERIFIED ON-CHAIN RESULTS", {
    es: "SEÑALES EN VIVO — RESULTADOS ON-CHAIN VERIFICADOS"
  }),
  "results.sub": S("Not predictions. Real outcomes from signals tied to wallets that move markets.", {
    es: "No predicciones. Resultados reales de señales ligadas a wallets que mueven mercados."
  }),
  "results.filter.all": S("All", { es: "Todos", fr: "Tous", de: "Alle" }),
  "results.filter.win": S("WIN only", { es: "Solo WIN", fr: "WIN uniquement" }),
  "results.filter.loss": S("LOSS only", { es: "Solo LOSS", fr: "LOSS uniquement" }),
  "results.filter.24h": S("Last 24h", { es: "Últimas 24 h", fr: "24 dernières h" }),
  "results.filter.week": S("Last week", { es: "Última semana", fr: "Semaine dernière", de: "Letzte Woche" }),
  "results.loading": S("Loading…", { es: "Cargando…", fr: "Chargement…", de: "Laden…" }),
  "results.th.token": S("Token", { es: "Token" }),
  "results.th.signalTime": S("Signal time", { es: "Hora de la señal", fr: "Heure du signal" }),
  "results.th.entry": S("Entry", { es: "Entrada", fr: "Entrée", de: "Einstieg" }),
  "results.th.1h": S("1h", { es: "1 h" }),
  "results.th.4h": S("4h", { es: "4 h" }),
  "results.th.result": S("Result", { es: "Resultado", fr: "Résultat", de: "Ergebnis" }),
  "results.th.status": S("Status", { es: "Estado", fr: "Statut", de: "Status" }),
  "results.empty": S(
    "No signals yet. Run public_surface_enhancements.sql and backfill prices, or wait for live inserts.",
    {
      es: "Aún no hay señales. Ejecuta public_surface_enhancements.sql y rellena precios, o espera inserciones en vivo."
    }
  ),
  "results.stickyLine": S("Want signals before they pump? → PRO from $9.99/mo", {
    es: "¿Quieres señales antes del pump? → PRO desde 9,99 $/mes"
  }),
  "results.upgradePro": S("Upgrade to PRO", { es: "Pasarte a PRO", fr: "Passer à PRO", de: "Auf PRO upgraden" }),
  "results.status.win": S("✅ WIN", { es: "✅ WIN" }),
  "results.status.loss": S("❌ LOSS", { es: "❌ LOSS" }),
  "results.status.pending": S("⏳ PENDING", { es: "⏳ PENDIENTE" }),
  "results.badge.empty": S("Win rate last 7 days: — (no resolved signals yet)", {
    es: "Win rate últimos 7 días: — (aún no hay señales resueltas)"
  }),
  "results.badge.withData": S("Win rate last 7 days: {{wr}}% ({{n}} signals)", {
    es: "Win rate últimos 7 días: {{wr}}% ({{n}} señales)"
  }),
  "results.mobile.entryLine": S("Entry {{e}} · 1h {{h1}} · 4h {{h4}}", {
    es: "Entrada {{e}} · 1 h {{h1}} · 4 h {{h4}}"
  }),

  "portfolio.pageTitle": S("Portfolio — Sentinel Ledger", {
    es: "Cartera — Sentinel Ledger",
    fr: "Portefeuille — Sentinel Ledger",
    de: "Portfolio — Sentinel Ledger"
  }),
  "portfolio.descSignedOut": S("Track your Solana positions and edge once you connect a wallet session.", {
    es: "Sigue posiciones y ventaja en Solana cuando conectes una sesión de wallet."
  }),
  "portfolio.desc": S("Watchlist tokens with real market snapshots only; no invented ROI or P&L.", {
    es: "Tokens de la watchlist con snapshots reales de mercado; sin ROI ni P&L inventado."
  }),
  "portfolio.label": S("Portfolio", { es: "Cartera", fr: "Portefeuille", de: "Portfolio", zh: "投资组合", ko: "포트폴리오", ja: "ポートフォリオ", pt: "Carteira" }),
  "portfolio.h1SignedOut": S("Connect wallet to unlock portfolio", {
    es: "Conecta la wallet para desbloquear la cartera",
    fr: "Connectez le portefeuille pour débloquer le portefeuille"
  }),
  "portfolio.pSignedOut": S("Your portfolio view requires a signed wallet session.", {
    es: "La vista de cartera requiere una sesión de wallet firmada."
  }),
  "portfolio.goDashboard": S("Go to dashboard", {
    es: "Ir al panel",
    fr: "Aller au tableau de bord",
    de: "Zum Dashboard"
  }),
  "portfolio.h1": S("P&L reality check", { es: "Reality check de P&L", fr: "Vérification P&L" }),
  "portfolio.sub": S(
    "Cold credibility: worked / failed uses real 24h market movement only. Personal P&L stays unverified until fills, balances, quantities and cost basis exist.",
    {
      es: "Credibilidad fría: worked / failed usa solo movimiento real de mercado 24 h. El P&L personal queda sin verificar hasta tener fills, saldos, cantidades y coste base."
    }
  ),
  "portfolio.realityTitle": S("Reality layer", { es: "Capa de realidad", pt: "Camada de realidade" }),
  "portfolio.realityBody": S(
    "This page refuses synthetic ROI. It compares live market snapshots and explicitly marks personal P&L as unverified.",
    {
      es: "Esta página rechaza ROI sintético. Compara snapshots reales de mercado y marca explícitamente el P&L personal como no verificado.",
      pt: "Esta página recusa ROI sintético. Compara snapshots reais de mercado e marca P&L pessoal como não verificado."
    }
  ),
  "portfolio.worked": S("Worked", { es: "Funcionó", pt: "Funcionou" }),
  "portfolio.failed": S("Failed", { es: "Falló", pt: "Falhou" }),
  "portfolio.unverified": S("Unverified", { es: "No verificado", pt: "Não verificado" }),
  "portfolio.refresh": S("Refresh", { es: "Actualizar", fr: "Actualiser", de: "Aktualisieren" }),
  "portfolio.loadingMarkets": S("Loading watchlist markets…", {
    es: "Cargando mercados de la watchlist…",
    fr: "Chargement des marchés de la watchlist…"
  }),
  "portfolio.error": S("Could not load portfolio: {{err}}", {
    es: "No se pudo cargar la cartera: {{err}}"
  }),
  "portfolio.empty": S("No watchlist tokens yet.", { es: "Aún no hay tokens en la watchlist." }),
  "portfolio.openWatchlist": S("Open watchlist", { es: "Abrir watchlist", fr: "Ouvrir la watchlist" }),
  "portfolio.score": S("Score {{s}}", { es: "Puntuación {{s}}" }),
  "portfolio.price": S("Price", { es: "Precio", fr: "Prix", de: "Preis" }),
  "portfolio.liq": S("Liq", { es: "Liq", fr: "Liq" }),
  "portfolio.change24h": S("24h:", { es: "24 h:", fr: "24 h :" }),
  "portfolio.outcome.worked": S("Worked 24h", { es: "Funcionó 24 h", pt: "Funcionou 24 h" }),
  "portfolio.outcome.failed": S("Failed 24h", { es: "Falló 24 h", pt: "Falhou 24 h" }),
  "portfolio.outcome.flat": S("Flat 24h", { es: "Plano 24 h", pt: "Plano 24 h" }),
  "portfolio.outcome.unknown": S("Unknown", { es: "Desconocido", pt: "Desconhecido" }),
  "portfolio.pnlReality": S("Personal P&L", { es: "P&L personal", pt: "P&L pessoal" }),
  "portfolio.pnlUnverified": S("Unverified — no balance, fills, quantity or cost basis in this endpoint.", {
    es: "No verificado — este endpoint no tiene saldo, fills, cantidad ni coste base.",
    pt: "Não verificado — este endpoint não tem saldo, fills, quantidade nem custo base."
  }),
  "portfolio.openToken": S("Open token", { es: "Abrir token", fr: "Ouvrir le jeton" }),

  "watchlist.pageTitle": S("Watchlist — Sentinel Ledger", {
    es: "Watchlist — Sentinel Ledger",
    fr: "Watchlist — Sentinel Ledger",
    de: "Watchlist — Sentinel Ledger"
  }),
  "watchlist.pageDesc": S("Tracked Solana tokens with notes. Syncs to your account when signed in.", {
    es: "Tokens Solana seguidos con notas. Se sincroniza con tu cuenta si inicias sesión."
  }),
  "watchlist.label": S("Watchlist", { es: "Watchlist", fr: "Watchlist", zh: "自选", ko: "관심목록", ja: "ウォッチリスト", pt: "Watchlist" }),
  "watchlist.h1": S("Tracked tokens", { es: "Tokens seguidos", fr: "Jetons suivis" }),
  "watchlist.subLive": S("Live from your account.", { es: "En vivo desde tu cuenta.", fr: "En direct depuis votre compte." }),
  "watchlist.subLocal": S("No signed session: showing local cached watchlist only.", {
    es: "Sin sesión firmada: solo watchlist local en caché.",
    fr: "Pas de session : watchlist locale en cache uniquement."
  }),
  "watchlist.loading": S("Loading watchlist...", { es: "Cargando watchlist...", fr: "Chargement de la watchlist..." }),
  "watchlist.error": S("Could not load watchlist: {{err}}", {
    es: "No se pudo cargar la watchlist: {{err}}"
  }),
  "watchlist.empty": S("No tokens yet. Add one from any token page.", {
    es: "Aún no hay tokens. Añade uno desde cualquier página de token."
  }),
  "watchlist.open": S("Open", { es: "Abrir", fr: "Ouvrir", de: "Öffnen", pt: "Abrir" })
};
