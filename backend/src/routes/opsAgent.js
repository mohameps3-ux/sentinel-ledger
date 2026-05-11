"use strict";

/**
 * /ops/agent — Sentinel Senior Architect Agent.
 * Ops console only. Protected by OMNI_BOT_OPS_KEY.
 */

const express = require("express");
const rateLimit = require("express-rate-limit");
const { runCalibrationOnce, getCalibrationSnapshot } = require("../services/signalCalibrator");
const { runSignalGateTunerTick } = require("../jobs/signalGateTunerCron");
const { getSupabase } = require("../lib/supabase");

const router = express.Router();

const SIGNAL_PERF_SUCCESS_MIN_PCT = Number(process.env.SIGNAL_PERF_SUCCESS_MIN_PCT || 1.0);

/**
 * Superficie producto (rutas Next → página → hooks/API) para el Arquitecto.
 * El JSON de contexto no incluye HTML ni capturas; esto indica qué leer con
 * POST /api/v1/ops/tools/repo/read cuando el operador pide UX o consumo UI.
 */
const FRONTEND_OPS_SURFACE = {
  disclaimer:
    "No hay capturas ni DOM en este contexto. Para cards, layout y copy exacto, lee los archivos `page` y componentes listados. Las URLs API son relativas a getPublicApiUrl() (NEXT_PUBLIC_API_URL; ver frontend/lib/publicRuntime.js).",
  routes: [
    {
      path: "/",
      page: "frontend/pages/index.js",
      userFacing:
        "Home war room: KPI strip (signals today, wallets, confidence), trending/hot tokens, live signals grid con badges de ranking, Token Desk, pestañas tácticas.",
      components: [
        "frontend/components/home/WarRoomLayout.jsx",
        "frontend/components/cockpit/TokenDesk.jsx",
        "frontend/src/features/war-home/TacticalFeed.jsx"
      ],
      dataLayer:
        "useTrendingTokens→/api/v1/tokens/hot | useSignalsFeed→/api/v1/signals/latest | useDecisionFeedQuotes→/api/v1/tokens/quotes | useSortedTokens+useMarketStore | useRankDeltas (solo cliente) | useLiveFeedSocket→socket.io NEXT_PUBLIC_WS_URL (sentinel:signal) | useWebSocket si aplica"
    },
    {
      path: "/scanner",
      page: "frontend/pages/scanner.js",
      userFacing: "Scanner: status strip, métricas, señales, tabla de tokens filtrable (narrativa/venue).",
      components: [
        "frontend/components/scanner/ScannerStatusStrip.jsx",
        "frontend/components/scanner/ScannerTokenTable.jsx"
      ],
      dataLayer: "useTrendingTokens→/api/v1/tokens/hot (misma base que home trending)"
    },
    {
      path: "/track-record",
      page: "frontend/pages/track-record.js",
      userFacing: "Histórico / rendimiento de señales para el usuario.",
      dataLayer: "fetch GET /api/v1/signals/track-record (querystring en página)"
    },
    {
      path: "/smart-money",
      page: "frontend/pages/smart-money.js",
      userFacing: "Leaderboard smart wallets, actividad, favoritos, narrativa.",
      dataLayer:
        "useSmartWalletsLeaderboard→/api/v1/public/smart-wallets-leaderboard | useSmartMoneyActivity→/api/v1/public/smart-money-activity | useWalletLabels→/api/v1/public/wallet-labels | useWalletFavorites (local/persistido cliente)"
    },
    {
      path: "/wallet-stalker",
      page: "frontend/pages/wallet-stalker.js",
      userFacing: "Exploración / stalker de wallets (lista y drill-down según UI).",
      dataLayer: "GET/POST /api/v1/wallet-stalker | GET /api/v1/wallet-stalker/:wallet (auth Bearer según página)"
    },
    {
      path: "/alerts",
      page: "frontend/pages/alerts.js",
      userFacing: "Configuración y feed de alertas (incl. Telegram si está cableado).",
      dataLayer:
        "/api/v1/user/status | /api/v1/alerts/settings | /api/v1/alerts/feed | /api/v1/alerts/telegram/auth"
    },
    {
      path: "/watchlist",
      page: "frontend/pages/watchlist.js",
      userFacing: "Watchlist de tokens del usuario.",
      dataLayer: "useWatchlist→GET/POST/DELETE /api/v1/watchlist y /api/v1/watchlist/:mint/note (Bearer)"
    },
    {
      path: "/token/[address]",
      page: "frontend/pages/token/[address].js",
      userFacing: "Ficha de token (score, tabs, datos de mercado).",
      dataLayer: "useTokenData→GET /api/v1/token/:address | useScoreRoom/useScoreSocket según imports actuales"
    },
    {
      path: "/wallet/[address]",
      page: "frontend/pages/wallet/[address].js",
      userFacing: "Perfil de wallet: narrativa, resumen, comportamiento.",
      dataLayer:
        "frontend/lib/api/walletSummary.js→GET /api/v1/wallets/:addr/summary | walletBehavior.js→/api/v1/wallets/:addr/behavior y .../behavior/tokens"
    },
    {
      path: "/compare",
      page: "frontend/pages/compare.js",
      userFacing: "Comparar tokens lado a lado.",
      dataLayer: "useTokenCompare→/api/v1/token/:address por cada mint"
    },
    {
      path: "/portfolio",
      page: "frontend/pages/portfolio.js",
      userFacing: "Cartera con mercados de watchlist autenticada.",
      dataLayer: "GET /api/v1/portfolio/watchlist-markets?limit=24 (Authorization Bearer)"
    },
    {
      path: "/results",
      page: "frontend/pages/results.js",
      userFacing: "Vista pública de track record filtrable.",
      dataLayer: "GET /api/v1/public/track-record?filter=..."
    }
  ]
};

/** Límites duros del stack ops (también van en JSON para que el modelo no los omita). */
const OPS_CONSOLE_LIMITS = {
  repoRead: {
    local: "Disco bajo OPS_REPO_ROOT; resolveSafeRepoPath (sin ..).",
    github:
      "body.source=github o auto+fallback: Contents API; prefijos OPS_REPO_READ_ALLOW_PREFIXES (default frontend/,backend/,docs/,.github/); sin .env ni secret extensions.",
    env: "OPS_REPO_READ_FALLBACK_GITHUB=1 para auto-fallback en hosts sin monorepo en disco."
  },
  sqlWrite: {
    endpoint: "POST /api/v1/ops/tools/sql",
    blocked:
      "INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, MERGE, CREATE, GRANT, REVOKE, COPY, EXECUTE y similares: rechazados por el servidor. Solo SELECT (sin ; ni comentarios).",
    implication:
      "No puedes mutar datos vía esta herramienta aunque el operador lo pida en lenguaje natural; el cambio va por migración, script revisado, Supabase/SQL fuera de ops, o workflow que tú no controlas desde aquí."
  },
  deploy: {
    vercelRailway:
      "No hay API dedicada Vercel/Railway en ops tools. Cadena típica: POST /api/v1/ops/tools/github/commit (rama + opcional createPR) → merge humano o automático → POST /api/v1/ops/tools/github/workflow con deploy-production.yml si existe en el repo.",
    checklistHint:
      "workflow_dispatch no sustituye secrets en Vercel/Railway; el YAML debe definir deploy real."
  },
  githubCodeWrite: {
    endpoint: "POST /api/v1/ops/tools/github/commit",
    requires: "confirm:true, GITHUB_TOKEN (repo contents:write), GITHUB_REPOSITORY, body.branch, body.message, body.files[]",
    whitelist:
      "Solo rutas bajo prefijos OPS_GITHUB_WRITE_ALLOW_PREFIXES (por defecto frontend/, backend/src/, docs/, .github/workflows/). Bloqueados: .env*, segmentos node_modules/.next/.git, extensiones tipo .pem.",
    behavior:
      "Un commit Git atómico (árbol) sobre rama nueva desde baseBranch o encima de rama existente con updateExistingBranch. createPR abre PR hacia baseBranch. allowDirectPushDefault:true solo para fast-forward explícito a la rama por defecto."
  },
  bulkDataEdits: {
    rule:
      "No edición masiva de tablas desde aquí: no hay SQL de escritura ni endpoint de batch DML. Cualquier UPDATE/DELETE masivo = propuesta de SQL explícito para que el operador lo ejecute en su entorno de confianza tras revisión.",
    noImplicitApproval:
      "No asumas que un 'sí' vago autoriza DML; el operador debe pegar o aprobar statements concretos fuera de /ops/tools/sql."
  }
};

/** Mapa único de límites + confirmación (español, sin relleno). Siempre va en el JSON del agente. */
const SENTINEL_DIRECTOR_MAP = {
  vigencia: "2026-05",
  confirmacionOperador: [
    "GitHub/SQL efectivos: el operador dispara HTTP con confirm:true (o equivalente en su script); tú no ejecutas sola.",
    "Calibración/tuner: solo si el operador escribe OK EJECUTAR + palabras clave en el mismo mensaje.",
    "Sin 'sí' ambiguo para DML, push a default, ni borrar datos; pide texto/JSON explícito o checklist."
  ],
  limitaciones: {
    "1_sql_escritura":
      "CERO en ops. /ops/tools/sql solo SELECT. Mutar tablas, migrar schema, backfill, fix corrupto → SQL o migración para que el operador lo ejecute en Supabase/pgAdmin (fuera del bot).",
    "2_codigo":
      "Lectura: repo/read source=local (disco OPS_REPO_ROOT) o source=github|auto (API GitHub mismo árbol que remoto; auto + OPS_REPO_READ_FALLBACK_GITHUB=1 si en Railway no está el monorepo en disco). Escritura remota: github/commit + confirm + whitelist.",
    "3_deploy":
      "Sin API Vercel/Railway en ops. github/workflow = workflow_dispatch; si el YAML no tiene steps de deploy + secrets en GitHub, no hay deploy. Credenciales cloud fuera del agente.",
    "4_batch_datos":
      "Sin canal DML → sin UPDATE masivo de outcomes, dedupe, reindex vía ops. Script/SQL/workflow para humano.",
    "5_env_produccion":
      "No cambias ENV en dashboards. envConfig en JSON = solo algunas claves que ve el proceso; no es dump de .env; valores pueden faltar.",
    "6_monitor_proactivo":
      "Sin webhook que te despierte; solo ves snapshot cuando el operador pregunta. Alertas tipo win rate < X% → checklist o producto futuro."
  },
  verificacionEntorno: "En el repo: cd backend && npm run ops:verify-director-stack (añade --strict en CI para fallar si falta clave).",
  herramientasQueSiExisten: [
    "POST /api/v1/ops/tools/repo/read — body: { path, source?: local|github|auto, ref? }; auto+fallback lee GitHub si falta en disco",
    "POST /api/v1/ops/tools/sql (SELECT + confirm)",
    "POST /api/v1/ops/tools/github/commit (confirm + rama + whitelist)",
    "POST /api/v1/ops/tools/github/workflow (confirm + inputs)",
    "OK EJECUTAR calibración | OK EJECUTAR tuner (mismo mensaje)"
  ]
};

function requireOpsKey(req, res, next) {
  const key = req.headers["x-ops-key"] || req.body?.ops_key;
  if (!key || key !== process.env.OMNI_BOT_OPS_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

const agentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: "Too many requests" },
  standardHeaders: true,
  legacyHeaders: false,
});

async function buildOpsContext() {
  const calibration = getCalibrationSnapshot();
  let rulePerformance = [];
  let recentSignals = [];
  let signalGateStats = {};
  let smartWalletStats = {};
  try {
    const supabase = getSupabase();
    const [rulesRes, signalsRes, outcomesRes, walletsRes] = await Promise.all([
      supabase
        .from("rule_performance")
        .select("rule_id, confidence_score, total_signals, success_count_60m, updated_at")
        .order("updated_at", { ascending: false })
        .limit(10),
      supabase
        .from("smart_wallet_signals")
        .select("token_address, signal_type, unified_score, confidence, result_pct, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("signal_outcomes")
        .select("signal_id, mint, rule_id, outcome_60m, created_at")
        .not("outcome_60m", "is", null)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("smart_wallets")
        .select("wallet_address, win_rate, smart_score, total_trades")
        .order("smart_score", { ascending: false })
        .limit(5),
    ]);
    rulePerformance = rulesRes.data || [];
    recentSignals = (signalsRes.data || []).slice(0, 10);
    if (outcomesRes.data && outcomesRes.data.length > 0) {
      const total = outcomesRes.data.length;
      const wins = outcomesRes.data.filter((o) => Number(o.outcome_60m) > 0).length;
      const avg = outcomesRes.data.reduce((a, o) => a + (Number(o.outcome_60m) || 0), 0) / total;
      signalGateStats = {
        totalEvaluated: total,
        winRate: ((wins / total) * 100).toFixed(1) + "%",
        avgOutcomePct: (avg * 100).toFixed(2) + "%",
        sampleSpec:
          "Last 100 rows from signal_outcomes with outcome_60m not null, ordered by created_at descending.",
        winDefinition:
          "Win counted when outcome_60m > 0 (any positive fractional move). This is NOT the same rule as signal_performance summary wins (outcome_pct >= SIGNAL_PERF_SUCCESS_MIN_PCT).",
        successMinPctForPerformanceSummary: SIGNAL_PERF_SUCCESS_MIN_PCT
      };
    }
    smartWalletStats = { topWallets: walletsRes.data || [] };
  } catch (_) {}
  const lc = calibration?.lastCalibration;
  return {
    timestamp: new Date().toISOString(),
    calibration,
    rulePerformance,
    recentSignals,
    signalGateStats,
    smartWalletStats,
    sentinelMetricLegend: {
      calibrationMetricsPresence:
        lc?.ok && lc.metrics
          ? "calibration.lastCalibration.metrics populated from getSignalPerformanceSummary at last calibration run."
          : "calibration.lastCalibration.metrics may be absent until a successful calibration run (cron or POST /signal-performance/calibration/run).",
      calibrationMetricsDefinitions:
        "When present, read calibration.lastCalibration.metrics.definitions for exact win rate, drawdown, and correlation semantics.",
      signalGateStatsVersusCalibration:
        "signalGateStats uses signal_outcomes (ledger); calibration metrics use signal_performance resolves — do not merge win rates without reconciling definitions.",
      interpretationDiscipline:
        "Weak confidence↔return correlation is not proof of model inversion. Large maxDrawdownPct is cumulative outcome_pct path stress, not necessarily user portfolio loss."
    },
    frontendSurface: FRONTEND_OPS_SURFACE,
    opsConsoleLimits: OPS_CONSOLE_LIMITS,
    sentinelDirectorMap: SENTINEL_DIRECTOR_MAP,
    envConfig: {
      GATE_MIN_CONFIDENCE: process.env.GATE_MIN_CONFIDENCE,
      GATE_MIN_SIGNALS: process.env.GATE_MIN_SIGNALS,
      GATE_MIN_UNIFIED_SCORE: process.env.GATE_MIN_UNIFIED_SCORE,
      SIGNAL_MIN_CONFIDENCE: process.env.SIGNAL_MIN_CONFIDENCE,
      SIGNAL_MIN_UNIFIED_SCORE: process.env.SIGNAL_MIN_UNIFIED_SCORE,
      SIGNAL_GATE_REGIME_ENABLED: process.env.SIGNAL_GATE_REGIME_ENABLED,
      SIGNAL_GATE_REGIME_CALM_MAX_RISK_SCORE: process.env.SIGNAL_GATE_REGIME_CALM_MAX_RISK_SCORE,
      SIGNAL_GATE_REGIME_TRENDING_MIN_UNIFIED_SCORE: process.env.SIGNAL_GATE_REGIME_TRENDING_MIN_UNIFIED_SCORE,
      SIGNAL_GATE_REGIME_VOLATILE_MIN_CONFIDENCE: process.env.SIGNAL_GATE_REGIME_VOLATILE_MIN_CONFIDENCE,
      SMART_WORKERS_ENABLED: process.env.SMART_WORKERS_ENABLED,
      SMART_SIGNAL_BACKFILL_ENABLED: process.env.SMART_SIGNAL_BACKFILL_ENABLED,
      SMART_SIGNAL_BACKFILL_MIN_WIN_RATE: process.env.SMART_SIGNAL_BACKFILL_MIN_WIN_RATE,
      ANTHROPIC_OPS_AGENT_MODEL: process.env.ANTHROPIC_OPS_AGENT_MODEL,
    },
  };
}

function summarizeExecutionForPrompt(ran) {
  if (!Array.isArray(ran) || ran.length === 0) return null;
  return ran.map((r) => {
    if (r?.action === "signal_performance_calibration_run") {
      const d = r.detail || {};
      const props = Array.isArray(d.proposals) ? d.proposals.slice(0, 6) : [];
      return {
        action: r.action,
        ok: r.ok,
        reason: d.reason,
        lookbackHours: d.lookbackHours,
        proposalsPreview: props
      };
    }
    if (r?.action === "signal_gate_tuner_run") {
      const d = r.detail || {};
      return {
        action: r.action,
        ok: r.ok && d.ok !== false,
        ranAt: d.ranAt,
        applied: d.applied,
        reason: d.reason,
        resolvedRows: d.resolvedRows,
        adaptiveEnabled: d.adaptiveEnabled
      };
    }
    return r;
  });
}

/**
 * Ejecución acotada en el mismo proceso que Ops: solo si el operador escribe
 * `OK EJECUTAR` (o `OK EXECUTE`) + palabras clave explícitas en el mismo mensaje.
 */
async function maybeExecuteAuthorizedOps(message) {
  const ran = [];
  const m = String(message || "");
  if (!/\bOK\s+EJECUTAR\b/i.test(m) && !/\bOK\s+EXECUTE\b/i.test(m)) {
    return { ran };
  }

  const wantCal =
    /\bcalibraci[oó]n\b/i.test(m) ||
    /\bcalibrat/i.test(m) ||
    /\bweights?\b/i.test(m) ||
    /\bpesos?\b/i.test(m) ||
    /\bsignal\s*weight/i.test(m);
  const wantTuner =
    /\btuner\b/i.test(m) ||
    /\bgate\s*adapt/i.test(m) ||
    /\badaptativ[oa]\b/i.test(m);

  if (!wantCal && !wantTuner) {
    ran.push({
      action: "none",
      ok: false,
      detail: "faltan_palabras_clave",
      hint: 'Ej.: "OK EJECUTAR calibración" o "OK EJECUTAR tuner"'
    });
    return { ran };
  }

  if (wantCal) {
    try {
      const out = await runCalibrationOnce({});
      ran.push({ action: "signal_performance_calibration_run", ok: !!out?.ok, detail: out });
    } catch (e) {
      ran.push({
        action: "signal_performance_calibration_run",
        ok: false,
        detail: { error: e?.message || String(e) }
      });
    }
  }
  if (wantTuner) {
    try {
      const out = await runSignalGateTunerTick();
      ran.push({ action: "signal_gate_tuner_run", ok: true, detail: out });
    } catch (e) {
      ran.push({
        action: "signal_gate_tuner_run",
        ok: false,
        detail: { error: e?.message || String(e) }
      });
    }
  }
  return { ran };
}

function buildSystemPrompt(ctx, executionSummary) {
  const ctxStr = JSON.stringify(ctx, null, 2);
  const execStr = executionSummary ? JSON.stringify(executionSummary, null, 2) : null;
  return `Eres el **Director General / Arquitecto de Sentinel** (consola interna de ops). Ámbito mental: **todo el producto** — motor, ingestión, señales, smart money, wallets, track record, UI/UX, despliegues y datos — aunque aquí solo veas un subconjunto en el JSON.

CONTRATO DE LÍMITES (léelo antes de prometer): en el JSON, **sentinelDirectorMap** = mapa breve (mayo 2026): qué está bloqueado, qué sí existe, y que **siempre** hace falta confirmación explícita del operador para efectos.

MANDATO DEL OPERADOR (prioridad absoluta, sin discutir el “si”):
- **Inmersión total antes de tocar nada**: primero entender flujo end-to-end, dependencias y contratos entre piezas.
- **Cero desacoplamientos**: ningún cambio aislado que rompa ingestión → scoring → gate → persistencia → UI.
- **Certeza antes de ejecutar**: si falta evidencia, pide al operador pegar rutas de archivo, diffs, SQL read-only o capturas; **no inventes** tablas, endpoints ni comportamiento del código que no esté en el contexto.
- Si el operador da una directriz, **no la debatas**; implementa el razonamiento técnico y el plan (riesgos sí, obstrucción no).

TONO:
- Español natural, cercano, de equipo (como con un colega). Inglés si el operador escribe en inglés.
- Sin postureo corporativo. Sin alarmismo salvo incidente verificable en datos.
- No consejos financieros.

FASE 1 — MAPA (obligatoria antes de proponer refactors o cambios de producto):
1) Flujo de datos mental: ingestión → motor/score → gate → emisión → tablas → resolución → calibración → consumo UI.
2) Dependencias: qué lee qué (API vs DB vs cache), qué ENV afecta qué, qué crons escriben dónde.
3) Hipótesis + pruebas mínimas: qué medirías para confirmar; qué query o endpoint validaría.

FASE 2 — PROPUESTA:
- Cambios en **pasos pequeños**, reversibles, con plan de monitorización.
- Para ENV: formato CAMBIO PROPUESTO / por qué / riesgo / qué vigilar.

EJECUCIÓN AUTOMÁTICA (solo lo que este backend engancha hoy; el resto = checklist para humano/CI):
- Con **OK EJECUTAR** o **OK EXECUTE** + palabras clave en el **mismo mensaje**:
  - calibración / pesos / weights → **runCalibrationOnce**
  - tuner / gate adaptativo → **runSignalGateTunerTick**
- Resume resultado usando **EJECUCIÓN_EN_ESTA_PETICIÓN** si viene abajo; no inventes otras ejecuciones.

LO QUE ESTA CONSOLA **NO** PUEDE HACER (leyes duras; también en JSON como **opsConsoleLimits**):
- **SQL de escritura**: \`/api/v1/ops/tools/sql\` solo acepta **SELECT**. INSERT/UPDATE/DELETE y el resto de DML/DDL están **bloqueados** en el servidor — no prometas ejecutarlos ni “simularlos”.
- **Deploy Vercel/Railway directo**: no hay token Vercel/Railway en ops; la vía es **GitHub Actions** (\`github/workflow\`) o pipelines que **tú** definas. Tras código: \`github/commit\` + PR + workflow si aplica.
- **Edición masiva de tablas**: no hay herramienta de batch DML. Propón SQL **explícito** para revisión humana y ejecución **fuera** de ops/sql, o migraciones; no asumas aprobación implícita del operador.

LO QUE **SÍ** PUEDE (GitHub, con confirmación explícita; ver **opsConsoleLimits.githubCodeWrite**):
- **Commits remotos atómicos**: \`POST /api/v1/ops/tools/github/commit\` con \`confirm:true\`, archivos bajo whitelist, rama feature (o allowDirectPushDefault con intención explícita), opcional \`createPR\`.

ARQUITECTURA MOTOR (recordatorio):
- Reglas: whale_accumulation, liquidity_shock, cluster_buy, new_wallet_confidence, velocity_spike.
- Confianza 0–100; pesos ~0.6x–1.6x desde performance; gate + regímenes SIGNAL_GATE_REGIME_*.
- Crons deterministas (pesos / tuner) sin LLM escribiendo SQL.

LÍNEAS ROJAS DE PRODUCTO (siguen valiendo salvo orden explícita del operador de asumir riesgo documentado):
- No desactivar el signal gate por defecto.
- No bajar GATE_MIN_CONFIDENCE por debajo de 15 sin plan de rollback explícito.

PRECISIÓN MÉTRICA (sentinelMetricLegend en JSON):
- No mezclar win rates con definiciones distintas. Correlación débil ≠ motor invertido.

CIERRE: 2–4 bullets “Qué mirar ahora”.

HERRAMIENTAS HTTP (misma cabecera x-ops-key que este endpoint; ver backend/src/routes/opsTools.js):
- POST /api/v1/ops/tools/repo/read — body: { "path": "frontend/pages/index.js", "source": "local"|"github"|"auto", "ref": "main" }. `github`/`auto` usan API GitHub (mismas credenciales que commit). `auto` + env OPS_REPO_READ_FALLBACK_GITHUB=1 intenta disco y luego GitHub si 404.
- POST /api/v1/ops/tools/sql — **solo lectura**: SELECT único; INSERT/UPDATE/DELETE y DDL están **bloqueados**. Preview: { "preview": true, "template": "ops_health_counts" } o { "preview": true, "sql": "SELECT 1" }.
  Ejecutar lectura: { "preview": false, "confirm": true, "template": "..." } o { "preview": false, "confirm": true, "sql": "SELECT ..." } (sin ; ni comentarios).
  Plantillas: ops_health_counts | signal_performance_status_7d | outcomes_pending_sample (params opcional { "hours": 24 }).
- POST /api/v1/ops/tools/github/workflow — body: { "confirm": true, "workflow": "deploy-production.yml", "ref": "main", "inputs": { "environment": "production", "service": "frontend" } } — workflow_dispatch (GITHUB_TOKEN + GITHUB_REPOSITORY). El YAML debe existir en .github/workflows/.
- POST /api/v1/ops/tools/github/commit — body: { "confirm": true, "branch": "feature/ops-auto-123", "baseBranch": "main", "message": "feat: …", "files": [ { "path": "frontend/pages/foo.js", "content": "…", "action": "create|update|delete" } ], "createPR": true, "prTitle": "…", "prBody": "…" }. Opcional: updateExistingBranch, allowDirectPushDefault (peligro). Rutas solo bajo whitelist (env OPS_GITHUB_WRITE_ALLOW_PREFIXES).

CONTEXTO LIVE (JSON; es parcial — no es el repo completo). Orden sugerido: **sentinelDirectorMap** → **opsConsoleLimits** → **frontendSurface** → métricas/env.
${ctxStr}
${execStr ? `\nEJECUCIÓN_EN_ESTA_PETICIÓN (solo lectura; no inventes):\n${execStr}\n` : ""}`;
}

router.post("/message", requireOpsKey, agentLimiter, async (req, res) => {
  try {
    const { message, history = [] } = req.body || {};
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return res.status(400).json({ error: "Invalid message" });
    }
    if (message.length > 2000) {
      return res.status(400).json({ error: "Message too long (max 2000 chars)" });
    }
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: "Agent unavailable — ANTHROPIC_API_KEY not set" });
    }
    const execLog = await maybeExecuteAuthorizedOps(message);
    const ctx = await buildOpsContext();
    const systemPrompt = buildSystemPrompt(ctx, summarizeExecutionForPrompt(execLog.ran));
    const safeHistory = Array.isArray(history)
      ? history
          .filter((m) => m?.role && m?.content && typeof m.content === "string")
          .slice(-10)
          .map((m) => ({ role: m.role, content: String(m.content).substring(0, 1000) }))
      : [];
    const messages = [...safeHistory, { role: "user", content: String(message).trim() }];
    const model = process.env.ANTHROPIC_OPS_AGENT_MODEL || "claude-sonnet-4-5";
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model, max_tokens: 2200, system: systemPrompt, messages }),
    });
    const data = await response.json();
    if (data.error) {
      console.error("[ops-agent] Claude error:", data.error);
      return res.status(502).json({ error: "Agent error: " + (data.error?.message || "unknown") });
    }
    return res.json({
      answer: data.content?.[0]?.text || "",
      model,
      contextTimestamp: ctx.timestamp,
      executed: execLog.ran
    });
  } catch (err) {
    console.error("[ops-agent] error:", err?.message || err);
    return res.status(500).json({ error: "Internal error" });
  }
});

module.exports = router;
