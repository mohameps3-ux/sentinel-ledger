import { S } from "./stringRow";

/** @type {Record<string, Record<string, string>>} */
export const COMPARE_PAGE_STRINGS = {
  "compare.pageTitle": S("Token compare — Sentinel Ledger", {
    es: "Comparar tokens — Sentinel Ledger",
    fr: "Comparaison de tokens — Sentinel Ledger"
  }),
  "compare.pageDesc": S(
    "Side-by-side Solana token analysis: grades, liquidity, holders, deployer risk, and momentum.",
    {
      es: "Análisis lado a lado en Solana: notas, liquidez, holders, riesgo del deployer y momentum."
    }
  ),
  "compare.hero.label": S("Decision board", { es: "Tablero de decisión", fr: "Tableau de décision" }),
  "compare.hero.h1": S("Compare, choose, execute", { es: "Compara, elige, ejecuta", fr: "Comparer, choisir, exécuter" }),
  "compare.hero.body": S(
    "Load 2–4 mints. Sentinel ranks the setups, lets you choose one, trade the chosen token, or keep the rest on watch.",
    {
      es: "Carga 2–4 mints. Sentinel ordena los setups, te deja elegir uno, operar el elegido o mantener el resto en vigilancia."
    }
  ),
  "compare.form.tokenA": S("Token A", { es: "Token A" }),
  "compare.form.tokenB": S("Token B", { es: "Token B" }),
  "compare.form.slot": S("Slot {{n}}", { es: "Slot {{n}}", pt: "Slot {{n}}" }),
  "compare.form.placeholder": S("Mint address…", { es: "Dirección del mint…" }),
  "compare.form.submit": S("Load board", { es: "Cargar tablero", fr: "Charger le tableau" }),

  "compare.decision.title": S("Decision board", { es: "Tablero de decisión", pt: "Quadro de decisão" }),
  "compare.decision.body": S("Maximum four tokens. Rank the setup, choose one, trade the chosen, watch the rest.", {
    es: "Máximo cuatro tokens. Ordena el setup, elige uno, opera el elegido, vigila el resto.",
    pt: "Máximo quatro tokens. Ordena o setup, escolhe um, negocia o escolhido, vigia o resto."
  }),
  "compare.decision.empty": S("Load at least two valid mints to turn this into a choice, not a spreadsheet.", {
    es: "Carga al menos dos mints válidos para convertir esto en una elección, no en una hoja infinita.",
    pt: "Carrega pelo menos dois mints válidos para transformar isto numa escolha, não numa folha infinita."
  }),
  "compare.cta.choose": S("Choose", { es: "Elegir", pt: "Escolher" }),
  "compare.cta.chosen": S("Chosen", { es: "Elegido", pt: "Escolhido" }),
  "compare.cta.tradeChosen": S("Trade chosen", { es: "Operar elegido", pt: "Negociar escolhido" }),
  "compare.cta.watchBoth": S("Watch both", { es: "Vigilar ambos", pt: "Vigiar ambos" }),
  "compare.cta.watchAll": S("Watch all", { es: "Vigilar todos", pt: "Vigiar todos" }),

  "compare.watchlist.h2": S("Watchlist comparables", { es: "Comparables de la watchlist" }),
  "compare.watchlist.empty": S("No cached watchlist yet. Add tokens from compare cards below.", {
    es: "Aún no hay watchlist en caché. Añade tokens desde las tarjetas abajo."
  }),

  "compare.card.noData": S("No data available yet.", { es: "Aún no hay datos." }),
  "compare.card.symbol": S("Symbol", { es: "Símbolo", fr: "Symbole" }),
  "compare.card.score": S("Sentinel score", { es: "Puntuación Sentinel" }),
  "compare.card.grade": S("Grade", { es: "Nota", fr: "Note" }),
  "compare.card.confidence": S("Confidence", { es: "Confianza", fr: "Confiance" }),

  "compare.watch.remove": S("Remove from watchlist", { es: "Quitar de la watchlist" }),
  "compare.watch.add": S("Add to watchlist", { es: "Añadir a la watchlist" }),

  "compare.metrics.h2": S("Differential metrics", { es: "Métricas diferenciales" }),
  "compare.metrics.loadBoth": S("Load both tokens to see side-by-side metrics.", {
    es: "Carga ambos tokens para ver métricas lado a lado."
  }),
  "compare.metrics.th.metric": S("Metric", { es: "Métrica" }),
  "compare.metrics.th.a": S("A", { es: "A" }),
  "compare.metrics.th.b": S("B", { es: "B" }),

  "compare.metric.score": S("Sentinel score", { es: "Puntuación Sentinel" }),
  "compare.metric.confidence": S("Confidence", { es: "Confianza" }),
  "compare.metric.liquidity": S("Liquidity", { es: "Liquidez" }),
  "compare.metric.vol24": S("24h volume", { es: "Volumen 24 h" }),
  "compare.metric.top10": S("Top10 concentration (lower better)", {
    es: "Concentración top 10 (menor es mejor)"
  }),
  "compare.metric.deployer": S("Deployer risk (lower better)", {
    es: "Riesgo del deployer (menor es mejor)"
  }),

  "compare.benchmark.h2": S("Benchmark vs SOL / USDC", { es: "Referencia vs SOL / USDC" }),
  "compare.benchmark.loadBoth": S("Load both tokens to benchmark against majors.", {
    es: "Carga ambos tokens para comparar con los mayores."
  }),
  "compare.benchmark.th.edge": S("Relative edge", { es: "Ventaja relativa" }),
  "compare.benchmark.vsSol": S("vs SOL score delta", { es: "Delta de score vs SOL" }),
  "compare.benchmark.vsUsdc": S("vs USDC score delta", { es: "Delta de score vs USDC" }),

  "compare.ranking.h2": S("Entry / Exit ranking", { es: "Ranking entrada / salida" }),
  "compare.ranking.wait": S("Ranking appears after both tokens are loaded.", {
    es: "El ranking aparece cuando ambos tokens estén cargados."
  }),
  "compare.ranking.tie": S("Both setups are tied. Wait for new flow/volume confirmation.", {
    es: "Ambos setups empatan. Espera confirmación de flujo/volumen."
  }),
  "compare.ranking.preferBefore": S("Prefer", { es: "Prefiere", fr: "Préférer" }),
  "compare.ranking.preferAfter": S("for entry setup.", { es: "para la entrada.", fr: "pour l’entrée." }),
  "compare.ranking.weaker": S("Keep the weaker setup in watchlist and wait for confirmation before sizing.", {
    es: "Mantén el setup más débil en watchlist y espera confirmación antes de dimensionar."
  }),
  "compare.ranking.watchRest": S("Watch the rest; do not average into indecision.", {
    es: "Vigila el resto; no promedies la indecisión.",
    pt: "Vigia o resto; não faças média com indecisão."
  }),

  "compare.rotation.h2": S("Rotation Alerts", { es: "Alertas de rotación" }),
  "compare.rotation.empty": S("No rotation changes detected yet.", {
    es: "Aún no se detectan cambios de rotación."
  }),
  "compare.rotation.edgeTo": S("Edge rotated to", { es: "Ventaja rotó a" }),
  "compare.toast.rotation": S("Rotation alert: edge moved to {{symbol}}", {
    es: "Alerta de rotación: la ventaja pasó a {{symbol}}"
  }),
  "compare.toast.removed": S("Removed from watchlist.", { es: "Quitado de la watchlist." }),
  "compare.toast.added": S("Added to watchlist.", { es: "Añadido a la watchlist." }),
  "compare.toast.watchAll": S("Loaded setups added to watchlist.", {
    es: "Setups cargados añadidos a la watchlist.",
    pt: "Setups carregados adicionados à watchlist."
  }),
  "compare.toast.watchErr": S("Connect wallet/login for watchlist sync.", {
    es: "Conecta wallet o inicia sesión para sincronizar la watchlist."
  })
};
