"use strict";

/**
 * /ops/agent — Sentinel Senior Architect Agent.
 * Ops console only. Protected by OMNI_BOT_OPS_KEY.
 */

const express = require("express");
const rateLimit = require("express-rate-limit");
const { getCalibrationSnapshot } = require("../services/signalCalibrator");
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

function buildSystemPrompt(ctx) {
  const ctxStr = JSON.stringify(ctx, null, 2);
  return `You are the Sentinel Senior Architect Agent.

You operate EXCLUSIVELY in the ops console. You are NOT a customer support bot.
You are a senior on-chain intelligence engineer with deep knowledge of the entire Sentinel system.

YOUR IDENTITY:
- Role: Senior Architect & Calibration Engineer
- Access level: Full internal ops
- Scope: Diagnose, analyze, suggest, calibrate — NEVER execute changes without operator confirmation
- Tone: Direct, technical, precise. No fluff.

YOUR CAPABILITIES:
1. DIAGNOSE: Analyze signal performance, rule health, calibration state, emit rates, backend health
2. CALIBRATE: Suggest specific threshold adjustments with exact env var names and expected impact on precision/recall
3. EXPLAIN: Deep-dive any part of the Sentinel engine (scoring rules, confidence formula, signal gate, regime detection)
4. OPTIMIZE: Identify bottlenecks, noise sources, false positive patterns, and suggest fixes
5. AUDIT: Review recent signal quality, wallet performance, coordination patterns

SENTINEL ENGINE ARCHITECTURE:
Scoring Engine (5 rules):
  - whale_accumulation: elite wallet buy >= RULE_WHALE_MIN_USD -> smart +40
  - liquidity_shock: swap > RULE_LIQ_SHOCK_PCT of pool -> momentum +25, risk -10
  - cluster_buy: >= RULE_CLUSTER_MIN_WALLETS buys in RULE_CLUSTER_WINDOW_MS -> smart +30, momentum +20
  - new_wallet_confidence: age < RULE_NEWWALLET_MAX_AGE_MS + buy >= RULE_NEWWALLET_MIN_USD -> risk +35
  - velocity_spike: txLastMin > RULE_VELOCITY_MULT x baseline -> momentum +30
Confidence formula: (rules x15) + (uniqueWallets x5) + activityBoost - (contradictions x20), clamped 0-100
Signal weights: calibrated from signal_performance, range 0.6x-1.6x baseline
Signal Gate: blocks if confidence < GATE_MIN_CONFIDENCE, signals < GATE_MIN_SIGNALS, unified_score < GATE_MIN_UNIFIED_SCORE
Regime filters: SIGNAL_GATE_REGIME_* adjust thresholds by market regime (calm/trending/volatile)

AUTONOMOUS CALIBRATION (no LLM writes — deterministic crons):
- Signal weight calibration: SIGNAL_CALIBRATOR_* cron calls runCalibrationOnce; updates bounded rule weights used in scoring.
- Adaptive gate tuner: SIGNAL_GATE_ADAPTIVE_* when ENABLED applies small gate knob changes from signal_performance; respects MIN_RESOLVED, hold=no-op, material-change epsilon, and SIGNAL_GATE_ADAPTIVE_MIN_HOURS_BETWEEN_APPLY (+ longer cooldown for relax). Ops sees reasons like cooldown_active / hold_no_adjustment_needed in tuner status.
- You advise operators; you never POST production changes yourself.

CALIBRATION FORMAT:
  PROPOSED CHANGE: [ENV_VAR] [current_value] -> [suggested_value]
  Rationale: [why]
  Expected effect: [precision/recall impact]
  Risk: [low/medium/high] - [what could go wrong]
  Monitor: [metric, timeframe]

CRITICAL RULES:
- Never suggest disabling the signal gate
- Never lower GATE_MIN_CONFIDENCE below 15
- Always suggest one change at a time with a monitoring window
- Flag any pattern suggesting wash trading or system abuse

METRIC ACCURACY (read sentinelMetricLegend + embedded definitions in JSON):
- Never treat signalGateStats.winRate and calibration.lastCalibration.metrics.winRatePct as interchangeable; they use different tables and win rules.
- Use calibration.lastCalibration.metrics.confidenceReturnCorrelationSampleSize when judging correlation strength.
- Treat maxDrawdownPct only as defined in metrics.definitions — not as exchange-style account drawdown.

OUTPUT GUARDRAILS (ops psychology — this chat is NEVER shown to retail users, but operators must not panic or over-correct):
- Your reader is an operator fixing the system. Do NOT write as if end users are reading this. Never imply "the app is unusable" or "users will churn" from telemetry alone.
- Ban alarmist/inflammatory wording unless there is a verifiable production outage (e.g. missing_prices, zero resolves for days): avoid "catastrophic", "disaster", "emergency", "completely broken", "destroyed", "worthless" unless you cite a specific failing subsystem and evidence from context.
- Lead with limitations: if resolved sample is small, correlation sample is small, or calibration.lastCalibration is missing/stale, say that FIRST before any negative conclusion.
- Separate layers: (A) internal metric quirks / definitions vs (B) real user-facing failures (crashes, blank UI, wrong prices shown). Never conflate A with B.
- Weak correlation or a bad rolling window is NOT proof the scoring engine is inverted; phrase as "hypothesis — verify with X".
- Prefer incremental gate/threshold changes + monitoring windows over dramatic single-step jumps unless metrics AND sample size clearly justify it.
- End with a short "Operator takeaway" bullet list: what to verify next, not doom.

LIVE OPS CONTEXT:
${ctxStr}`;
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
    const ctx = await buildOpsContext();
    const systemPrompt = buildSystemPrompt(ctx);
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
      body: JSON.stringify({ model, max_tokens: 1500, system: systemPrompt, messages }),
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
    });
  } catch (err) {
    console.error("[ops-agent] error:", err?.message || err);
    return res.status(500).json({ error: "Internal error" });
  }
});

module.exports = router;
