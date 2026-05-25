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

/** Minimum hours between adaptive applies (0 = off). Relax uses × RELAX_COOLDOWN_MULT. */
const MIN_HOURS_BETWEEN_APPLY = Math.max(
  0,
  Number(process.env.SIGNAL_GATE_ADAPTIVE_MIN_HOURS_BETWEEN_APPLY ?? 48)
);
const RELAX_COOLDOWN_MULT = Math.max(1, Number(process.env.SIGNAL_GATE_ADAPTIVE_RELAX_COOLDOWN_MULT ?? 2));
const COOLDOWN_BYPASS_ON_TIGHTEN =
  String(process.env.SIGNAL_GATE_ADAPTIVE_COOLDOWN_BYPASS_ON_TIGHTEN ?? "true").toLowerCase() !== "false";
const ALLOW_RELAX =
  String(process.env.SIGNAL_GATE_ADAPTIVE_ALLOW_RELAX ?? "true").toLowerCase() !== "false";

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

function hoursSinceIso(iso) {
  const t = Date.parse(String(iso || ""));
  if (!Number.isFinite(t)) return Infinity;
  return (Date.now() - t) / 3600000;
}

/**
 * Skip pointless applies when suggested knobs match effective gate within epsilon.
 */
function overridesMaterialChange(suggested, current) {
  if (!suggested || !current) return true;
  const mc = Number(suggested.minConfidence);
  const cc = Number(current.minConfidence);
  const mu = Number(suggested.minUnifiedScore);
  const cu = Number(current.minUnifiedScore);
  const mr = Number(suggested.maxRiskScore);
  const cr = Number(current.maxRiskScore);
  if (
    !Number.isFinite(mc) ||
    !Number.isFinite(cc) ||
    !Number.isFinite(mu) ||
    !Number.isFinite(cu) ||
    !Number.isFinite(mr) ||
    !Number.isFinite(cr)
  ) {
    return true;
  }
  const epsConf = Math.max(0, Number(process.env.SIGNAL_GATE_ADAPTIVE_MATERIAL_EPS_CONFIDENCE ?? 0.08));
  const epsUni = Math.max(0, Number(process.env.SIGNAL_GATE_ADAPTIVE_MATERIAL_EPS_UNIFIED ?? 0.003));
  const epsRisk = Math.max(0, Number(process.env.SIGNAL_GATE_ADAPTIVE_MATERIAL_EPS_RISK ?? 0.08));
  return (
    Math.abs(mc - cc) > epsConf ||
    Math.abs(mu - cu) > epsUni ||
    Math.abs(mr - cr) > epsRisk
  );
}

/**
 * Conservative gates: avoid oscillation, pointless writes, and rapid relax cycles.
 */
function adaptiveApplyGuardReason({ suggestion, gateSnap, lastApplied }) {
  if (suggestion.mode === "hold") {
    return { skip: true, reason: "hold_no_adjustment_needed" };
  }
  if (suggestion.mode === "relax" && !ALLOW_RELAX) {
    return { skip: true, reason: "relax_disabled_by_env" };
  }

  const cur = gateSnap?.config || {};
  const o = suggestion.overrides || {};
  if (!overridesMaterialChange(o, cur)) {
    return { skip: true, reason: "no_material_change_vs_effective_gate" };
  }

  if (MIN_HOURS_BETWEEN_APPLY <= 0 || !lastApplied?.at) {
    return { skip: false };
  }

  const elapsed = hoursSinceIso(lastApplied.at);
  const needRelax = suggestion.mode === "relax";
  const requiredHours = MIN_HOURS_BETWEEN_APPLY * (needRelax ? RELAX_COOLDOWN_MULT : 1);

  if (COOLDOWN_BYPASS_ON_TIGHTEN && suggestion.mode === "tighten") {
    return { skip: false };
  }

  if (elapsed < requiredHours) {
    return {
      skip: true,
      reason: "cooldown_active",
      cooldown: {
        elapsedHours: Math.round(elapsed * 100) / 100,
        requiredHours,
        mode: suggestion.mode
      }
    };
  }

  return { skip: false };
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
  // Exclude regimes that are already gated or whose data would corrupt the base:
  //   calm     — hard-blocked by Phase 1 (SIGNAL_GATE_REGIME_CALM_MIN_CONFIDENCE=101).
  //              Pre-Phase-1 calm data is poisoned; using it as worst bucket bleeds
  //              into volatile/trending thresholds via base config.
  //   trending — WR 15.74%, PF 0.39 — below-average but NOT the actionable edge.
  //              volatile is the only regime with real edge (WR 33%, PF 0.81).
  //              Tightening base from trending data restricts volatile emissions,
  //              which is the opposite of what Phase 1 achieved. Exclude until
  //              trending accumulates enough Phase-1-clean data to trust (~72h).
  const EXCLUDED_REGIMES = new Set(["legacy", "calm", "trending"]);
  const qualified = (regimes || []).filter(
    (r) => Number(r.total) >= minN && !EXCLUDED_REGIMES.has(String(r.regime || "").toLowerCase())
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

  // When off, return the same shape as pre–regime-aware: no evidence.regimeBranch so
  // applySignalGateOverrides reason stays adaptive_<mode>_na (stable logs / parsers).
  if (!REGIME_AWARE) {
    regimeTuning.skipReason = "regime_aware_disabled";
    return {
      suggestion: { ...globalSugg },
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

  // Safety floor: don't let the tuner tighten a bucket that is actually performing.
  // After Phase 1 excluded calm+trending, volatile is the only remaining bucket.
  // With volatile WR ~33% and PF ~0.80, tightening would undo Phase 1's unlocking.
  // A regime with WR ≥ 20% is doing well — hold, don't tighten.
  const TIGHTEN_FLOOR_WR = Number(process.env.SIGNAL_GATE_ADAPTIVE_TIGHTEN_FLOOR_WR ?? 20);
  const worstWr = Number(worst.winRatePct || 0);
  if (worstWr >= TIGHTEN_FLOOR_WR) {
    regimeTuning.skipReason = `worst_bucket_above_floor_wr_${TIGHTEN_FLOOR_WR}pct`;
    regimeTuning.worstQualified = { regime: worst.regime, metrics: { winRatePct: worstWr }, regimeSuggestionMode: "hold_floor" };
    return {
      suggestion: {
        mode: "hold",
        overrides: {},
        evidence: { ...(globalSugg.evidence || {}), regimeBranch: "worst_above_floor_hold" }
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

    const guard = adaptiveApplyGuardReason({
      suggestion,
      gateSnap,
      lastApplied: state.lastApplied
    });
    if (guard.skip) {
      out.applied = false;
      out.reason = guard.reason;
      out.applySkipped = guard.cooldown
        ? { reason: guard.reason, cooldown: guard.cooldown }
        : { reason: guard.reason };
      state.lastSuggestion = out;
      state.lastRunAt = startedAt;
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
    applyGuardrails: {
      minHoursBetweenApply: MIN_HOURS_BETWEEN_APPLY,
      relaxCooldownMult: RELAX_COOLDOWN_MULT,
      cooldownBypassOnTighten: COOLDOWN_BYPASS_ON_TIGHTEN,
      allowRelax: ALLOW_RELAX
    },
    lastRunAt: state.lastRunAt,
    lastApplied: state.lastApplied,
    lastSuggestion: state.lastSuggestion,
    lastError: state.lastError
  };
}

/**
 * Same math as a tuner run but no in-memory state updates and no applySignalGateOverrides.
 * Safe to call from Ops / CI any time.
 */
async function previewSignalGateTuner(options = {}) {
  const lookbackHours =
    options.lookbackHours != null
      ? Math.max(1, Math.min(24 * 30, Number(options.lookbackHours)))
      : LOOKBACK_HOURS;
  const maxRows =
    options.maxRows != null
      ? Math.max(200, Math.min(5000, Number(options.maxRows)))
      : MAX_ROWS;

  const summary = await getSignalPerformanceSummary({ lookbackHours, maxRows });
  if (!summary?.ok) {
    return { ok: false, readOnly: true, reason: summary?.error || "summary_unavailable" };
  }

  const gateSnap = getSignalGateOpsSnapshot();
  const built = buildSuggestion(summary, gateSnap);
  const resolved = Number(summary.resolvedRows || 0);
  const suggestion = {
    mode: built.suggestion.mode,
    overrides: built.suggestion.overrides,
    evidence: built.suggestion.evidence || {}
  };

  const out = {
    ok: true,
    readOnly: true,
    previewAt: new Date().toISOString(),
    wouldApply: false,
    adaptiveEnabled: ENABLED,
    regimeAware: REGIME_AWARE,
    lookbackHours,
    maxRows,
    resolvedRows: resolved,
    minResolvedRows: MIN_RESOLVED,
    minPerRegime: MIN_PER_REGIME,
    metrics: summary.metrics || {},
    regimes: built.regimes,
    regimeTuning: built.regimeTuning,
    suggestion
  };

  if (resolved < MIN_RESOLVED) {
    out.reason = "insufficient_resolved_sample";
    return out;
  }
  if (!ENABLED) {
    out.reason = "adaptive_disabled";
    return out;
  }

  const guard = adaptiveApplyGuardReason({
    suggestion,
    gateSnap,
    lastApplied: state.lastApplied
  });
  if (guard.skip) {
    out.wouldApply = false;
    out.reason = guard.reason;
    out.applySkipped = guard.cooldown
      ? { reason: guard.reason, cooldown: guard.cooldown }
      : { reason: guard.reason };
    return out;
  }

  out.wouldApply = true;
  out.reason = `adaptive_${suggestion.mode}_preview`;
  return out;
}

module.exports = {
  runSignalGateTunerOnce,
  getSignalGateTunerStatus,
  buildSuggestion,
  previewSignalGateTuner
};
