"use strict";

/**
 * Offline checks for regime-aware adaptive tuner (no DB).
 * Run: node scripts/verifySignalGateTunerRegimeAware.js
 */

const path = require("path");

function loadTuner() {
  const resolvedPath = path.join(__dirname, "../src/services/signalGateTuner.js");
  delete require.cache[require.resolve(resolvedPath)];
  return require(resolvedPath);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

const gateSnap = {
  config: { minConfidence: 55, minUnifiedScore: 0.58, maxRiskScore: 85 }
};

function main() {
  process.env.SIGNAL_GATE_ADAPTIVE_MIN_RESOLVED = "30";
  process.env.SIGNAL_GATE_ADAPTIVE_MIN_PER_REGIME = "8";

  process.env.SIGNAL_GATE_ADAPTIVE_REGIME_AWARE = "false";
  let { buildSuggestion } = loadTuner();
  let built = buildSuggestion(
    {
      resolvedRows: 200,
      metrics: { winRatePct: 55, profitFactor: 1.1, maxDrawdownPct: 15 },
      regimes: [{ regime: "volatile", total: 50, winRatePct: 40, profitFactor: 0.8, maxDrawdownPct: 30 }]
    },
    gateSnap
  );
  assert(built.regimeTuning.skipReason === "regime_aware_disabled", "off: skipReason");
  assert(built.suggestion.evidence?.regimeBranch === undefined, "off: no regimeBranch on suggestion");

  process.env.SIGNAL_GATE_ADAPTIVE_REGIME_AWARE = "true";
  ({ buildSuggestion } = loadTuner());
  built = buildSuggestion(
    {
      resolvedRows: 29,
      metrics: { winRatePct: 55, profitFactor: 1.1, maxDrawdownPct: 15 },
      regimes: [{ regime: "volatile", total: 20, winRatePct: 40, profitFactor: 0.8, maxDrawdownPct: 30 }]
    },
    gateSnap
  );
  assert(built.regimeTuning.skipReason === "below_min_resolved_for_regime_logic", "low n: skip");
  assert(String(built.suggestion.evidence?.regimeBranch || "").includes("global"), "low n: global branch");

  ({ buildSuggestion } = loadTuner());
  built = buildSuggestion(
    {
      resolvedRows: 100,
      metrics: { winRatePct: 60, profitFactor: 1.2, maxDrawdownPct: 10 },
      regimes: [
        { regime: "legacy", total: 100, winRatePct: 30, profitFactor: 0.5, maxDrawdownPct: 40 },
        { regime: "calm", total: 5, winRatePct: 20, profitFactor: 0.5, maxDrawdownPct: 40 }
      ]
    },
    gateSnap
  );
  assert(built.regimeTuning.skipReason === "no_regime_meets_min_per_regime", "no non-legacy bucket >= min n");
  assert(built.suggestion.evidence?.regimeBranch === "global_only_no_regime_bucket");

  ({ buildSuggestion } = loadTuner());
  built = buildSuggestion(
    {
      resolvedRows: 100,
      metrics: { winRatePct: 60, profitFactor: 1.2, maxDrawdownPct: 10 },
      regimes: [
        { regime: "calm", total: 25, winRatePct: 60, profitFactor: 1.3, maxDrawdownPct: 10 },
        { regime: "volatile", total: 25, winRatePct: 48, profitFactor: 0.9, maxDrawdownPct: 20 }
      ]
    },
    gateSnap
  );
  assert(built.regimeTuning.worstQualified?.regime === "volatile", "worst bucket volatile");
  assert(built.suggestion.mode === "tighten", "regime tighten wins over global hold");
  assert(built.suggestion.evidence?.regimeBranch === "regime_worst_bucket_tighten");

  ({ buildSuggestion } = loadTuner());
  built = buildSuggestion(
    {
      resolvedRows: 100,
      metrics: { winRatePct: 40, profitFactor: 0.85, maxDrawdownPct: 22 },
      regimes: [
        { regime: "calm", total: 25, winRatePct: 40, profitFactor: 0.85, maxDrawdownPct: 22 },
        { regime: "volatile", total: 25, winRatePct: 40, profitFactor: 0.7, maxDrawdownPct: 22 }
      ]
    },
    gateSnap
  );
  assert(built.suggestion.mode === "tighten", "both tighten");
  assert(built.suggestion.evidence?.regimeBranch === "both_tighten_merged");
  const o = built.suggestion.overrides;
  assert(o.minConfidence >= 58, "merged conf stricter");
  assert(o.minUnifiedScore >= 0.61, "merged unified stricter");
  assert(o.maxRiskScore <= 82, "merged risk lower");

  ({ buildSuggestion } = loadTuner());
  built = buildSuggestion(
    {
      resolvedRows: 100,
      metrics: { winRatePct: 60, profitFactor: 1.2, maxDrawdownPct: 10 },
      regimes: [
        { regime: "trending", total: 20, winRatePct: 50, profitFactor: 1.05, maxDrawdownPct: 12 },
        { regime: "volatile", total: 20, winRatePct: 50, profitFactor: 0.95, maxDrawdownPct: 12 }
      ]
    },
    gateSnap
  );
  assert(built.regimeTuning.worstQualified?.regime === "volatile", "PF tie-break");

  console.log("verifySignalGateTunerRegimeAware: all checks passed.");
}

main();
