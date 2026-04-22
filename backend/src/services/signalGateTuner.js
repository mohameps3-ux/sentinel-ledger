"use strict";

const { getSignalPerformanceSummary } = require("./signalPerformance");
const { applySignalGateOverrides, getSignalGateOpsSnapshot } = require("./signalEmissionGate");

const LOOKBACK_HOURS = Math.max(24, Number(process.env.SIGNAL_GATE_ADAPTIVE_LOOKBACK_HOURS || 168));
const MAX_ROWS = Math.max(200, Number(process.env.SIGNAL_GATE_ADAPTIVE_MAX_ROWS || 3000));
const MIN_RESOLVED = Math.max(30, Number(process.env.SIGNAL_GATE_ADAPTIVE_MIN_RESOLVED || 80));
const ENABLED = String(process.env.SIGNAL_GATE_ADAPTIVE_ENABLED || "false").toLowerCase() === "true";
const REGIME_AWARE =
  String(process.env.SIGNAL_GATE_ADAPTIVE_REGIME_AWARE || "false").toLowerCase() === "true";
const MIN_PER_REGIME = Math.max(5, Number(process.env.SIGNAL_GATE_ADAPTIVE_MIN_PER_REGIME || 20));

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

function pickWorstRegime(regimes, minN) {
  const qualified = (regimes || []).filter(
    (r) => Number(r.total) >= minN && String(r.regime || "").toLowerCase() !== "legacy"
  );
  if (!qualified.length) return null;
  return [...qualified].sort((a, b) => {
    const wr = Number(a.winRatePct) - Number(b.winRatePct);
    if (Math.abs(wr) > 0.0001) return wr;
    return Number(a.profitFactor || 0) - Number(b.profitFactor || 0);
  })[0];
}

function tighterGateOverrides(a, b) {
  return {
    minConfidence: Math.max(Number(a.minConfidence), Number(b.minConfidence)),
    minUnifiedScore: Math.max(Number(a.minUnifiedScore), Number(b.minUnifiedScore)),
    maxRiskScore: Math.min(Number(a.maxRiskScore), Number(b.maxRiskScore))
  };
}

/** When the worst bucket says tighten, that wins over global hold/relax. */
function mergeGlobalAndRegime(globalSugg, regimeSugg) {
  if (regimeSugg.mode === "tighten") {
    if (globalSugg.mode === "tighten") {
      return {
        mode: "tighten",
        overrides: tighterGateOverrides(globalSugg.overrides, regimeSugg.overrides),
        evidence: { regimeBranch: "both_tighten_merged" }
      };
    }
    return {
      mode: "tighten",
      overrides: { ...regimeSugg.overrides },
      evidence: { regimeBranch: "regime_worst_bucket_tighten" }
    };
  }
  return {
    ...globalSugg,
    evidence: { ...(globalSugg.evidence || {}), regimeBranch: "global_metrics" }
  };
}

function buildSuggestion(summary, gateSnap) {
  const regimes = summary.regimes || [];
  const globalSugg = suggestFromMetrics(summary.metrics || {}, gateSnap);
  const resolved = Number(summary.resolvedRows || 0);

  const regimeTuning = {
    aware: REGIME_AWARE,
    minPerRegime: MIN_PER_REGIME,
    worstQualified: null,
    skipReason: null
  };

  if (!REGIME_AWARE) {
    regimeTuning.skipReason = "regime_aware_disabled";
    return {
      suggestion: {
        ...globalSugg,
        evidence: { ...(globalSugg.evidence || {}), regimeBranch: "global_only" }
      },
      regimes,
      regimeTuning
    };
  }
  if (resolved < MIN_RESOLVED) {
    regimeTuning.skipReason = "below_min_resolved_for_regime_logic";
    return {
      suggestion: {
        ...globalSugg,
        evidence: { ...(globalSugg.evidence || {}), regimeBranch: "global_only_insufficient_n" }
      },
      regimes,
      regimeTuning
    };
  }

  const worst = pickWorstRegime(regimes, MIN_PER_REGIME);
  if (!worst) {
    regimeTuning.skipReason = "no_regime_meets_min_per_regime";
    return {
      suggestion: {
        ...globalSugg,
        evidence: { ...(globalSugg.evidence || {}), regimeBranch: "global_only_no_regime_bucket" }
      },
      regimes,
      regimeTuning
    };
  }

  const wm = {
    winRatePct: worst.winRatePct,
    profitFactor: worst.profitFactor,
    maxDrawdownPct: worst.maxDrawdownPct
  };
  const regimeSugg = suggestFromMetrics(wm, gateSnap);
  const merged = mergeGlobalAndRegime(globalSugg, regimeSugg);
  regimeTuning.worstQualified = { regime: worst.regime, metrics: wm, regimeSuggestionMode: regimeSugg.mode };

  const evidence = {
    ...globalSugg.evidence,
    worstRegimeMetrics: wm,
    regimeSuggestionMode: regimeSugg.mode,
    ...merged.evidence
  };

  return {
    suggestion: { mode: merged.mode, overrides: merged.overrides, evidence },
    regimes,
    regimeTuning
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
    const built = buildSuggestion(summary, gateSnap);
    const suggestion = {
      mode: built.suggestion.mode,
      overrides: built.suggestion.overrides,
      evidence: built.suggestion.evidence || {}
    };

    const out = {
      ok: true,
      ranAt: startedAt,
      adaptiveEnabled: ENABLED,
      regimeAware: REGIME_AWARE,
      lookbackHours: LOOKBACK_HOURS,
      resolvedRows: resolved,
      minResolvedRows: MIN_RESOLVED,
      minPerRegime: MIN_PER_REGIME,
      metrics: summary.metrics || {},
      regimes: built.regimes,
      regimeTuning: built.regimeTuning,
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
      reason: `adaptive_${suggestion.mode}_${suggestion.evidence?.regimeBranch || "na"}`
    });
    out.applied = true;
    out.reason = `adaptive_${suggestion.mode}`;
    out.appliedConfig = applied.effectiveConfig;
    state.lastSuggestion = out;
    state.lastRunAt = startedAt;
    state.lastApplied = {
      at: startedAt,
      mode: suggestion.mode,
      overrides: suggestion.overrides,
      regimeBranch: suggestion.evidence?.regimeBranch
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
    regimeAware: REGIME_AWARE,
    minPerRegime: MIN_PER_REGIME,
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
