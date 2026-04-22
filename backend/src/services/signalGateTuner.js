"use strict";

const { getSignalPerformanceSummary } = require("./signalPerformance");
const { applySignalGateOverrides, getSignalGateOpsSnapshot } = require("./signalEmissionGate");

const LOOKBACK_HOURS = Math.max(24, Number(process.env.SIGNAL_GATE_ADAPTIVE_LOOKBACK_HOURS || 168));
const MAX_ROWS = Math.max(200, Number(process.env.SIGNAL_GATE_ADAPTIVE_MAX_ROWS || 3000));
const MIN_RESOLVED = Math.max(30, Number(process.env.SIGNAL_GATE_ADAPTIVE_MIN_RESOLVED || 80));
const ENABLED = String(process.env.SIGNAL_GATE_ADAPTIVE_ENABLED || "false").toLowerCase() === "true";

const state = {
  lastRunAt: null,
  lastSuggestion: null,
  lastApplied: null,
  lastError: null
};

function clamp(n, lo, hi) {
  const v = Number(n);
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

function suggestFromMetrics(metrics = {}, gate = {}) {
  const baseMinConf = Number(gate?.config?.minConfidence || 55);
  const baseMinUnified = Number(gate?.config?.minUnifiedScore || 0.58);
  const baseMaxRisk = Number(gate?.config?.maxRiskScore || 85);

  const winRate = Number(metrics.winRatePct || 0);
  const profitFactor = Number(metrics.profitFactor || 0);
  const maxDd = Number(metrics.maxDrawdownPct || 0);

  let conf = baseMinConf;
  let unified = baseMinUnified;
  let risk = baseMaxRisk;
  let mode = "hold";

  if (profitFactor < 1 || winRate < 50 || maxDd > 25) {
    // Tighten conservatively when live quality degrades.
    conf = clamp(baseMinConf + 3, 45, 85);
    unified = clamp(baseMinUnified + 0.03, 0.45, 0.9);
    risk = clamp(baseMaxRisk - 3, 45, 95);
    mode = "tighten";
  } else if (profitFactor >= 1.35 && winRate >= 58 && maxDd <= 14) {
    // Relax slightly when quality is strong to recover recall.
    conf = clamp(baseMinConf - 2, 45, 85);
    unified = clamp(baseMinUnified - 0.02, 0.45, 0.9);
    risk = clamp(baseMaxRisk + 2, 45, 95);
    mode = "relax";
  }

  return {
    mode,
    overrides: {
      minConfidence: conf,
      minUnifiedScore: Number(unified.toFixed(4)),
      maxRiskScore: risk
    },
    evidence: {
      winRatePct: winRate,
      profitFactor,
      maxDrawdownPct: maxDd
    }
  };
}

async function runSignalGateTunerOnce() {
  const startedAt = new Date().toISOString();
  try {
    const summary = await getSignalPerformanceSummary({
      lookbackHours: LOOKBACK_HOURS,
      maxRows: MAX_ROWS
    });
    if (!summary?.ok) {
      state.lastRunAt = startedAt;
      state.lastError = summary?.error || "summary_unavailable";
      return { ok: false, reason: state.lastError };
    }
    const resolved = Number(summary.resolvedRows || 0);
    const gateSnap = getSignalGateOpsSnapshot();
    const suggestion = suggestFromMetrics(summary.metrics || {}, gateSnap);
    const out = {
      ok: true,
      ranAt: startedAt,
      adaptiveEnabled: ENABLED,
      lookbackHours: LOOKBACK_HOURS,
      resolvedRows: resolved,
      minResolvedRows: MIN_RESOLVED,
      metrics: summary.metrics || {},
      suggestion
    };

    if (resolved < MIN_RESOLVED) {
      out.applied = false;
      out.reason = "insufficient_resolved_sample";
      state.lastSuggestion = out;
      state.lastRunAt = startedAt;
      state.lastApplied = null;
      state.lastError = null;
      return out;
    }

    if (!ENABLED) {
      out.applied = false;
      out.reason = "adaptive_disabled";
      state.lastSuggestion = out;
      state.lastRunAt = startedAt;
      state.lastApplied = null;
      state.lastError = null;
      return out;
    }

    const applied = applySignalGateOverrides(suggestion.overrides, {
      reason: `adaptive_${suggestion.mode}`
    });
    out.applied = true;
    out.reason = `adaptive_${suggestion.mode}`;
    out.appliedConfig = applied.effectiveConfig;
    state.lastSuggestion = out;
    state.lastRunAt = startedAt;
    state.lastApplied = {
      at: startedAt,
      mode: suggestion.mode,
      overrides: suggestion.overrides
    };
    state.lastError = null;
    return out;
  } catch (e) {
    state.lastRunAt = startedAt;
    state.lastError = e?.message || "tuner_failed";
    return { ok: false, reason: state.lastError };
  }
}

function getSignalGateTunerStatus() {
  return {
    adaptiveEnabled: ENABLED,
    lookbackHours: LOOKBACK_HOURS,
    maxRows: MAX_ROWS,
    minResolvedRows: MIN_RESOLVED,
    lastRunAt: state.lastRunAt,
    lastApplied: state.lastApplied,
    lastSuggestion: state.lastSuggestion,
    lastError: state.lastError
  };
}

module.exports = {
  runSignalGateTunerOnce,
  getSignalGateTunerStatus
};

