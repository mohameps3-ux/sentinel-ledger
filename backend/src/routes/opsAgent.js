"use strict";

/**
 * /ops/agent — Sentinel Senior Architect Agent (Anthropic Messages API).
 * Ops console only. Protected by OMNI_BOT_OPS_KEY.
 */

const express = require("express");
const rateLimit = require("express-rate-limit");
const { runCalibrationOnce, getCalibrationSnapshot } = require("../services/signalCalibrator");
const { runSignalGateTunerTick } = require("../jobs/signalGateTunerCron");
const { getSupabase } = require("../lib/supabase");
const { getOpsPostgresPool } = require("../lib/opsPostgresPool");
const { insertOpsAuditLog } = require("../lib/opsAuditLog");
const opsToolsRouter = require("./opsTools");
const { isToolUseEnabled, runOpsAgentLoop, getAutonomyMode, isFullAutonomyMode } = require("../services/opsAgentLoop");
const { OPS_AGENT_TOOLS } = require("../services/opsAgentTools");

const router = express.Router();

const SIGNAL_PERF_SUCCESS_MIN_PCT = Number(process.env.SIGNAL_PERF_SUCCESS_MIN_PCT || 1.0);

/** Single user message to POST /ops/agent/message (default 20k; cap 100k). */
const OPS_AGENT_MAX_MESSAGE_CHARS = (() => {
  const n = Number(process.env.OPS_AGENT_MAX_MESSAGE_CHARS || 20_000);
  return Number.isFinite(n) ? Math.min(100_000, Math.max(2_000, Math.floor(n))) : 20_000;
})();

/** Per history turn content sent to the ops LLM (default 8k; cap 32k). */
const OPS_AGENT_HISTORY_CONTENT_CHARS = (() => {
  const n = Number(process.env.OPS_AGENT_HISTORY_CONTENT_CHARS || 8_000);
  return Number.isFinite(n) ? Math.min(32_000, Math.max(500, Math.floor(n))) : 8_000;
})();

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
        "useSmartWalletsLeaderboard→/api/v1/public/smart-wallets-leaderboard (por defecto excluye total_trades=0; ?includeZeroTrade=1 para radar vacío) | useSmartMoneyActivity→/api/v1/public/smart-money-activity | useWalletLabels→/api/v1/public/wallet-labels | useWalletFavorites (local/persistido cliente)"
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
    read:
      "SELECT único (sin ; ni comentarios). preview:true luego confirm:true.",
    write:
      "DML (INSERT/UPDATE/DELETE/MERGE): requiere confirm:true + allowWrite:true; timeout 30s; se registra en public.ops_audit_log (aplicar migración 030).",
    dangerous:
      "DDL (DROP/TRUNCATE/ALTER/CREATE/GRANT/REVOKE): requiere confirm:true + allowDangerous:true (+ audita). Riesgo alto — no asumas rollback.",
    implication:
      "Sin flags explícitos el servidor sigue rechazando mutaciones; con flags el operador asume responsabilidad y debe usar preview antes."
  },
  deploy: {
    vercelRailway:
      "POST /api/v1/ops/tools/deploy con confirm:true (VERCEL_TOKEN, VERCEL_PROJECT_ID, VERCEL_ORG_ID, RAILWAY_TOKEN, RAILWAY_PROJECT_ID, RAILWAY_SERVICE_ID, GITHUB_REPOSITORY para Vercel gitSource). Polling best-effort hasta READY.",
    checklistHint:
      "workflow_dispatch sigue disponible en /ops/tools/github/workflow; env/update puede disparar autoRedeploy (flag) pero redeploy real depende de integración."
  },
  bulkDataEdits: {
    rule:
      "POST /api/v1/ops/tools/bulk-update — tablas whitelist (signal_outcomes, signal_performance, smart_wallet_signals, rule_performance), dryRun + confirm, chunks 500.",
    noImplicitApproval:
      "Sin 'sí' vago para DML masivo; dryRun primero luego confirm:true."
  },
  githubCodeWrite: {
    endpoint: "POST /api/v1/ops/tools/github/commit",
    requires: "confirm:true, GITHUB_TOKEN (repo contents:write), GITHUB_REPOSITORY, body.branch, body.message, body.files[]",
    whitelist:
      "Solo rutas bajo prefijos OPS_GITHUB_WRITE_ALLOW_PREFIXES (por defecto frontend/, backend/src/, docs/, .github/workflows/). Bloqueados: .env*, segmentos node_modules/.next/.git, extensiones tipo .pem.",
    behavior:
      "Un commit Git atómico (árbol) sobre rama nueva desde baseBranch o encima de rama existente con updateExistingBranch. createPR abre PR hacia baseBranch. allowDirectPushDefault:true solo para fast-forward explícito a la rama por defecto."
  }
};

/** Mapa único de límites + confirmación (español, sin relleno). Siempre va en el JSON del agente. */
const SENTINEL_DIRECTOR_MAP = {
  vigencia: "2026-05",
  confirmacionOperador: [
    "GitHub/SQL efectivos: el operador dispara HTTP con confirm:true (o equivalente en su script); tú no ejecutas sola.",
    "Calibración manual: OK EJECUTAR + palabras clave. Auto: solo si OPS_AUTO_EXECUTE_CALIBRATION=true y sin veto del operador.",
    "Sin 'sí' ambiguo para DML, push a default, ni borrar datos; pide texto/JSON explícito o checklist."
  ],
  limitaciones: {
    "1_sql_escritura":
      "POST /api/v1/ops/tools/sql (DML/DDL con confirm + allowWrite/allowDangerous) y POST /api/v1/ops/tools/sql/auto para DML/DDL auditado (auto_executed). Sin flags el servidor rechaza mutaciones.",
    "2_codigo":
      "Lectura: repo/read source=local (disco OPS_REPO_ROOT) o source=github|auto (API GitHub mismo árbol que remoto; auto + OPS_REPO_READ_FALLBACK_GITHUB=1 si en Railway no está el monorepo en disco). Escritura remota: github/commit + confirm + whitelist.",
    "3_deploy":
      "POST /api/v1/ops/tools/deploy (Vercel/Railway tokens en env) o github/workflow workflow_dispatch.",
    "4_batch_datos":
      "POST /api/v1/ops/tools/bulk-update con tablas whitelist, dryRun y confirm.",
    "5_env_produccion":
      "POST /api/v1/ops/tools/env/update (Vercel/Railway) con confirm; envConfig en JSON del agente sigue siendo vista parcial del proceso.",
    "6_monitor_proactivo":
      "POST /api/v1/ops/alerts/inbound (HMAC WEBHOOK_SECRET) escala a ops_alerts y opcionalmente agente/Telegram."
  },
  verificacionEntorno: "En el repo: cd backend && npm run ops:verify-director-stack (añade --strict en CI para fallar si falta clave).",
  herramientasQueSiExisten: [
    "POST /api/v1/ops/tools/repo/read — body: { path, source?: local|github|auto, ref? }; auto+fallback lee GitHub si falta en disco",
    "POST /api/v1/ops/tools/sql (SELECT + confirm; DML/DDL con flags)",
    "POST /api/v1/ops/tools/sql/auto — DML/DDL auditado (intent, estimatedRows, dangerConfirm si >1000 filas)",
    "POST /api/v1/ops/tools/bulk-update — batch whitelist dryRun+confirm",
    "POST /api/v1/ops/tools/deploy — Vercel/Railway (env tokens)",
    "POST /api/v1/ops/tools/env/update — variables cloud + audit",
    "POST /api/v1/ops/tools/rollback — calibration Redis backup (target previous|timestamp:...)",
    "POST /api/v1/ops/alerts/inbound — webhooks firmados",
    "POST /api/v1/ops/tools/github/commit (confirm + rama + whitelist)",
    "POST /api/v1/ops/tools/github/workflow (confirm + inputs)",
    "OK EJECUTAR calibración | OK EJECUTAR tuner (mismo mensaje); OPS_AUTO_EXECUTE_CALIBRATION=true puede disparar calibración si >24h sin éxito y sin veto"
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
    if (r?.action === "auto_calibration" || r?.action === "auto_calibration_skipped") {
      const d = r.detail || {};
      return { action: r.action, ok: r.ok, detail: d };
    }
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
 * Regex/keyword intent for autonomy (no external LLM).
 * @returns {{ autoApproveLowRisk: boolean, requiresLiteralProdDeploy: boolean, destructiveBlocked: boolean, ambiguous: boolean, detail: string }}
 */
function classifyOperatorIntent(userMessage) {
  const m = String(userMessage || "");
  const out = {
    autoApproveLowRisk: false,
    requiresLiteralProdDeploy: false,
    destructiveBlocked: false,
    ambiguous: false,
    detail: ""
  };
  if (/(borra|delete|drop|truncate)/i.test(m)) {
    out.destructiveBlocked = true;
    out.detail = "destructive_keywords_require_explicit_confirm_json";
    return out;
  }
  if (/(deploy|push).*(prod|production)/i.test(m)) {
    out.requiresLiteralProdDeploy = true;
    out.detail = "prod_deploy_requires_literal_CONFIRM_DEPLOY_PROD";
  }
  if (/(hazlo|ejecuta|run|go)\s+(ya|now|ahora)\b/i.test(m)) {
    out.autoApproveLowRisk = true;
    out.detail = out.detail || "auto_approve_low_risk_phrase";
  }
  const t = m.trim();
  if (/^(s[ií]|y(es)?)\s*$/i.test(t)) {
    out.ambiguous = true;
    out.detail = "yes_only_ambiguous";
  }
  return out;
}

async function logIntentClassification(classification, rawMessage) {
  const pool = getOpsPostgresPool();
  if (!pool) return;
  const client = await pool.connect();
  try {
    await insertOpsAuditLog(client, {
      operation: "intent_classification",
      sql_statement: String(rawMessage || "").slice(0, 12_000),
      affected_rows: 0,
      executed_by: "ops-agent",
      error: null,
      metadata: { classification },
      auto_executed: false
    });
  } catch (_) {
    /* ignore audit failures */
  } finally {
    client.release();
  }
}

async function maybeAutoCalibration(message) {
  const ran = [];
  if (String(process.env.OPS_AUTO_EXECUTE_CALIBRATION || "").toLowerCase() !== "true") {
    return { ran };
  }
  const m = String(message || "");
  const veto =
    /\bno\s+toques\b/i.test(m) && (/\bpesos\b/i.test(m) || /\bweights?\b/i.test(m));
  if (veto) {
    ran.push({ action: "auto_calibration_skipped", ok: true, detail: "operator_veto" });
    return { ran };
  }
  const snap = getCalibrationSnapshot();
  const last = snap?.lastCalibration;
  const lastAt = last?.ok ? last.at : null;
  const stale = !Number.isFinite(lastAt) || Date.now() - lastAt > 24 * 3600 * 1000;
  if (!stale) return { ran };
  try {
    const out = await runCalibrationOnce({});
    ran.push({ action: "auto_calibration", ok: !!out?.ok, detail: out });
    const pool = getOpsPostgresPool();
    if (pool) {
      const client = await pool.connect();
      try {
        await insertOpsAuditLog(client, {
          operation: "auto_calibration",
          sql_statement: JSON.stringify(out || {}).slice(0, 50_000),
          affected_rows: 0,
          executed_by: "ops-agent",
          error: out?.ok === false ? String(out?.reason || "calibration_failed") : null,
          metadata: { lookbackHours: out?.lookbackHours },
          auto_executed: true
        });
      } finally {
        client.release();
      }
    }
  } catch (e) {
    ran.push({ action: "auto_calibration", ok: false, detail: { error: e?.message || String(e) } });
  }
  return { ran };
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
  const autonomyMode = getAutonomyMode();
  const fullAutonomyBlock =
    autonomyMode === "full"
      ? `
AUTONOMY MODE: FULL.
Ejecuta cualquier tool necesaria sin pedir confirmación al operador.
No preguntes "¿quieres que…?". Ejecuta y reporta resultado.
Si una tool falla, intenta diagnóstico y fix por tu cuenta hasta agotar iteraciones.
El operador NO va a confirmar nada. No esperes input humano intermedio.
Respeta caps operativos del loop (max tools, SQL writes, deploys, commits); si un cap se alcanza, reporta qué se hizo y qué quedó pendiente sin pedir confirmación.
`
      : "";

  const toolUseBlock =
    autonomyMode === "full"
      ? `TOOL USE AGENTIC (OPS_AGENT_TOOL_USE_ENABLED=true, AUTONOMY=full):
- Tienes ${OPS_AGENT_TOOLS.length} herramientas; **todas** se ejecutan automáticamente en este turno.
- Invoca directamente: diagnóstico → fix → commit → deploy → verificación en la misma conversación cuando proceda.
- No devuelvas payloads JSON para que el operador dispare manualmente salvo que una tool falle por cap o circuit breaker.
`
      : `TOOL USE AGENTIC (cuando OPS_AGENT_TOOL_USE_ENABLED=true, AUTONOMY=strict):
- Tienes ${OPS_AGENT_TOOLS.length} herramientas invocables durante la misma petición.
- **Auto** (sin confirmación): repo_read, sql_select, health_probe, public_api_probe, redis_inspect, calibration_status, bulk_update_dry_run.
- **Requieren confirmación**: sql_write, sql_dangerous, bulk_update_apply, calibration_run, tuner_run, rollback_calibration, deploy, env_update, github_commit, github_workflow.
- Si una tool devuelve confirmation_required, pide al operador: \`OK EJECUTAR <acción>\`, \`CONFIRM TOOL <nombre>\`, o \`confirmTools: ["nombre"]\` en el body.
- No invoques tools destructivas sin confirmación explícita del operador en el mismo turno o vía confirmTools.`;

  const limitsContract =
    autonomyMode === "full"
      ? "CONTRATO DE LÍMITES: en modo FULL ejecutas tools directamente; el audit log registra todo. Caps del loop (iteraciones, SQL writes, deploys) son hard limits — no confirmación humana."
      : "CONTRATO DE LÍMITES (léelo antes de prometer): en el JSON, **sentinelDirectorMap** = mapa breve (mayo 2026): qué está bloqueado, qué sí existe, y que **siempre** hace falta confirmación explícita del operador para efectos.";

  return `Eres el **Director General / Arquitecto de Sentinel** (consola interna de ops). Ámbito mental: **todo el producto** — motor, ingestión, señales, smart money, wallets, track record, UI/UX, despliegues y datos — aunque aquí solo veas un subconjunto en el JSON.
${fullAutonomyBlock}
${limitsContract}

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

EJECUCIÓN AUTOMÁTICA (enganchada en este backend):
- **OK EJECUTAR** / **OK EXECUTE** + palabras clave en el **mismo mensaje**: calibración/pesos → **runCalibrationOnce**; tuner → **runSignalGateTunerTick**.
- Si \`OPS_AUTO_EXECUTE_CALIBRATION=true\` y la última calibración **exitosa** tiene >24h y el operador **no** vetó ("no toques pesos/weights"), puede ejecutarse **auto_calibration** antes del LLM (ver **EJECUCIÓN_EN_ESTA_PETICIÓN**).
- Resume solo lo que venga en **EJECUCIÓN_EN_ESTA_PETICIÓN**; no inventes otras ejecuciones.

${toolUseBlock}

CAPACIDADES OPS (HTTP + \`x-ops-key\`; ver JSON **opsConsoleLimits** y **herramientasQueSiExisten**):
- **SQL**: \`/ops/tools/sql\` (SELECT / DML / DDL con flags) y \`/ops/tools/sql/auto\` (DML/DDL auditado \`auto_executed\`, \`dangerConfirm\` si \`estimatedRows\`>1000).
- **Batch**: \`/ops/tools/bulk-update\` (tablas whitelist, \`dryRun\` + \`confirm\`, chunks).
- **Deploy**: \`/ops/tools/deploy\` (Vercel/Railway; tokens en env del backend).
- **ENV remoto**: \`/ops/tools/env/update\` (Vercel/Railway).
- **Rollback calibración**: \`/ops/tools/rollback\` \`type=calibration\`, \`target=previous\` (Redis backup 72h).
- **Alertas**: \`/ops/alerts/inbound\` (HMAC \`WEBHOOK_SECRET\` / \`OPS_WEBHOOK_SECRET\`).

LÍNEAS ROJAS (no prometer fuera de esto):
- Sin tokens/credenciales en el chat; sin asumir \`confirm:true\` del operador salvo mensaje/JSON explícito.
- Rollback SQL inverso automático y redeploy env **no** están completos: guía al operador o usa GitHub/workflow.

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
- POST /api/v1/ops/tools/repo/read — body: { "path": "frontend/pages/index.js", "source": "local"|"github"|"auto", "ref": "main" }. Valores github y auto usan API GitHub (mismas credenciales que commit). Modo auto + env OPS_REPO_READ_FALLBACK_GITHUB=1 intenta disco y luego GitHub si 404.
- POST /api/v1/ops/tools/sql — **lectura**: SELECT único; \`{ "preview": true, "sql": "SELECT 1" }\` luego \`{ "confirm": true, "sql": "..." }\`. **Escritura (DML)**: mismo flujo + \`allowWrite:true\`. **DDL peligroso**: + \`allowDangerous:true\`. Sin \`;\` ni comentarios. Auditoría: tabla \`public.ops_audit_log\` (migración 030+031).
  Plantillas: ops_health_counts | signal_performance_status_7d | outcomes_pending_sample (params opcional { "hours": 24 }).
- POST /api/v1/ops/tools/sql/auto — DML/DDL sin preview intermedio: \`{ "sql": "UPDATE …", "intent": "fix_null_outcomes", "estimatedRows": 150, "dangerConfirm": true }\` si \`estimatedRows\`>1000; opcional \`allowDangerous\` para DDL. Respuesta: \`affected_rows\`, \`execution_time_ms\`, \`audit_log_id\`.
- POST /api/v1/ops/tools/bulk-update — \`{ "table": "signal_outcomes", "where": {...}, "set": {...}, "dryRun": true }\` luego \`confirm:true\` y \`dryRun:false\`.
- POST /api/v1/ops/tools/deploy — \`{ "confirm": true, "service": "frontend"|"backend", "environment": "production"|"preview", "trigger": "immediate", "gitRef": "main" }\` (tokens Vercel/Railway en env).
- POST /api/v1/ops/tools/env/update — variables Vercel/Railway + \`confirm\`; \`autoRedeploy\` opcional (marca intento).
- POST /api/v1/ops/tools/rollback — \`type: calibration\`, \`target: previous\` (Redis backup).
- POST /api/v1/ops/alerts/inbound — JSON firmado (HMAC-SHA256 hex de \`source|severity|event|sortedStringify(metadata)\` en header \`x-ops-signature\` o campo \`signature\` con prefijo \`sha256=\`); requiere \`WEBHOOK_SECRET\` / \`OPS_WEBHOOK_SECRET\`.
- POST /api/v1/ops/tools/github/workflow — body: { "confirm": true, "workflow": "deploy-production.yml", "ref": "main", "inputs": { "environment": "production", "service": "frontend" } } — workflow_dispatch (GITHUB_TOKEN + GITHUB_REPOSITORY). El YAML debe existir en .github/workflows/.
- POST /api/v1/ops/tools/github/commit — body: { "confirm": true, "branch": "feature/ops-auto-123", "baseBranch": "main", "message": "feat: …", "files": [ { "path": "frontend/pages/foo.js", "content": "…", "action": "create|update|delete" } ], "createPR": true, "prTitle": "…", "prBody": "…" }. Opcional: updateExistingBranch, allowDirectPushDefault (peligro). Rutas solo bajo whitelist (env OPS_GITHUB_WRITE_ALLOW_PREFIXES).

CONTEXTO LIVE (JSON; es parcial — no es el repo completo). Orden sugerido: **sentinelDirectorMap** → **opsConsoleLimits** → **frontendSurface** → métricas/env.
${ctxStr}
${execStr ? `\nEJECUCIÓN_EN_ESTA_PETICIÓN (solo lectura; no inventes):\n${execStr}\n` : ""}`;
}

router.post("/message", requireOpsKey, agentLimiter, async (req, res) => {
  try {
    const { message, history = [], confirmTools = [], stream = false } = req.body || {};
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return res.status(400).json({ error: "Invalid message" });
    }
    if (message.length > OPS_AGENT_MAX_MESSAGE_CHARS) {
      return res.status(400).json({
        error: `Message too long (max ${OPS_AGENT_MAX_MESSAGE_CHARS} chars; set OPS_AGENT_MAX_MESSAGE_CHARS)`
      });
    }
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: "Agent unavailable — ANTHROPIC_API_KEY not set" });
    }
    const intent = classifyOperatorIntent(message);
    logIntentClassification(intent, message).catch(() => {});
    const autoCal = await maybeAutoCalibration(message);
    const execLog = await maybeExecuteAuthorizedOps(message);
    const ran = [...(autoCal.ran || []), ...(execLog.ran || [])];

    let userMsg = String(message).trim();
    const fullAutonomy = isFullAutonomyMode();
    if (!fullAutonomy && intent.ambiguous) {
      userMsg =
        'AUTONOMÍA: Si pedías confirmación, responde en texto explícito p. ej. "CONFIRM deploy" o pega el JSON con confirm:true; un "sí" solo es ambiguo.\n\n' +
        userMsg;
    }
    if (!fullAutonomy && intent.destructiveBlocked) {
      userMsg =
        "AUTONOMÍA: Hay lenguaje destructivo; DML/DDL requiere POST /api/v1/ops/tools/sql o /sql/auto con flags y confirm explícitos — no ejecutes por inferencia.\n\n" +
        userMsg;
    }
    if (!fullAutonomy && intent.requiresLiteralProdDeploy && !/\bCONFIRM\s+DEPLOY\s+PROD\b/i.test(message)) {
      userMsg =
        "AUTONOMÍA: Deploy a producción requiere la frase literal CONFIRM DEPLOY PROD en el mensaje del operador si vas a disparar /ops/tools/deploy.\n\n" +
        userMsg;
    }

    const ctx = await buildOpsContext();
    ctx.operatorIntent = intent;
    ctx.agentToolUseEnabled = isToolUseEnabled();
    ctx.agentAutonomyMode = getAutonomyMode();
    const systemPrompt = buildSystemPrompt(ctx, summarizeExecutionForPrompt(ran));
    const safeHistory = Array.isArray(history)
      ? history
          .filter((m) => m?.role && m?.content && typeof m.content === "string")
          .slice(-10)
          .map((m) => ({
            role: m.role,
            content: String(m.content).substring(0, OPS_AGENT_HISTORY_CONTENT_CHARS)
          }))
      : [];
    const messages = [...safeHistory, { role: "user", content: userMsg }];
    const model = process.env.ANTHROPIC_OPS_AGENT_MODEL || "claude-sonnet-4-5";

    const safeConfirmTools = Array.isArray(confirmTools)
      ? confirmTools.map((t) => String(t).trim()).filter(Boolean)
      : [];

    if (isToolUseEnabled()) {
      const runLoop = async (onEvent) =>
        runOpsAgentLoop({
          apiKey,
          model,
          systemPrompt,
          messages,
          userMessage: message,
          confirmTools: safeConfirmTools,
          onEvent
        });

      if (stream) {
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders?.();

        const writeEvent = (event, data) => {
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        };

        try {
          writeEvent("started", { model, toolUseEnabled: true, autonomyMode: getAutonomyMode() });
          const loopOut = await runLoop((ev) => writeEvent(ev.type, ev));
          writeEvent("done", {
            answer: loopOut.answer,
            model: loopOut.model,
            contextTimestamp: ctx.timestamp,
            executed: ran,
            toolInvocations: loopOut.toolInvocations,
            truncated: loopOut.truncated,
            stopReason: loopOut.stopReason,
            conversationId: loopOut.conversationId,
            autonomyMode: loopOut.autonomyMode
          });
          return res.end();
        } catch (err) {
          writeEvent("error", { error: err?.message || String(err) });
          return res.end();
        }
      }

      const loopOut = await runLoop();
      return res.json({
        answer: loopOut.answer,
        model: loopOut.model,
        contextTimestamp: ctx.timestamp,
        executed: ran,
        toolInvocations: loopOut.toolInvocations,
        truncated: loopOut.truncated,
        stopReason: loopOut.stopReason,
        conversationId: loopOut.conversationId,
        autonomyMode: loopOut.autonomyMode,
        toolUseEnabled: true
      });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model, max_tokens: 2200, system: systemPrompt, messages }),
    });
    const data = await response.json().catch(() => ({}));
    if (data.error) {
      console.error("[ops-agent] Claude error:", data.error);
      return res.status(502).json({
        error: "Agent error: " + (data.error?.message || data.error?.code || "unknown"),
      });
    }
    let assistantMessage = data.content?.[0]?.text || "";

    const sqlAutoExecRegex = /```sql\s+--\s*autoExecuteSQL\s*\n([\s\S]+?)```/g;
    let match;
    const autoResults = [];
    while ((match = sqlAutoExecRegex.exec(assistantMessage)) !== null) {
      const sql = match[1].trim();
      try {
        const execRes = await opsToolsRouter.runOpsReadOnlySelect(sql);
        if (!execRes.ok) throw new Error(execRes.error || "sql_exec_failed");
        autoResults.push({ sql, rows: execRes.rows, rowCount: execRes.rowCount });
      } catch (err) {
        autoResults.push({ sql, error: err?.message || String(err) });
      }
    }
    if (autoResults.length > 0) {
      assistantMessage += "\n\n**RESULTADOS AUTO-EJECUTADOS:**\n" + JSON.stringify(autoResults, null, 2);
    }

    return res.json({
      answer: assistantMessage,
      model,
      contextTimestamp: ctx.timestamp,
      executed: ran,
      toolUseEnabled: false
    });
  } catch (err) {
    console.error("[ops-agent] error:", err?.message || err);
    return res.status(500).json({ error: "Internal error" });
  }
});

module.exports = router;
