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
- Git push, Vercel, Railway, SQL arbitrario, edición masiva de tablas: **no** están cableados aquí; describe el procedimiento exacto o el PR que haría falta.

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

CONTEXTO LIVE (JSON; es parcial — no es el repo completo):
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
