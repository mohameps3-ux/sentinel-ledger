"use strict";

const { getSignalPerformanceSummary } = require("./signalPerformance");

const CONFIG = {
  lookbackHours: Number(process.env.SIGNAL_CALIBRATOR_LOOKBACK_HOURS || 72),
  minSamplesPerSignal: Number(process.env.SIGNAL_CALIBRATOR_MIN_SAMPLES || 30),
  maxDeltaPct: Number(process.env.SIGNAL_CALIBRATOR_MAX_DELTA_PCT || 0.35),
  minWeight: Number(process.env.SIGNAL_CALIBRATOR_MIN_WEIGHT || 0.6),
  maxWeight: Number(process.env.SIGNAL_CALIBRATOR_MAX_WEIGHT || 1.6)
};

const BASELINE_WEIGHTS = {
  whale_accumulation: 1.0,
  cluster_buy: 1.0,
  velocity_spike: 1.0,
  liquidity_shock: 1.0,
  new_wallet_confidence: 1.0
};

let lastCalibration = null;

function clamp(n, lo, hi) {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

function toWeight(avgOutcomePct, samples, minSamples, maxDeltaPct) {
  const edge = Number(avgOutcomePct);
  const support = clamp(Math.sqrt(Math.max(0, samples) / Math.max(1, minSamples)), 0, 1);
  // Scale edge into [-maxDeltaPct, +maxDeltaPct] with support dampening.
  const delta = clamp((edge / 10) * support, -maxDeltaPct, maxDeltaPct);
  return 1 + delta;
}

async function runCalibrationOnce(options = {}) {
  const lookbackHours = Number(options.lookbackHours || CONFIG.lookbackHours);
  const minSamples = Math.max(5, Number(options.minSamplesPerSignal || CONFIG.minSamplesPerSignal));
  const maxDeltaPct = clamp(Number(options.maxDeltaPct || CONFIG.maxDeltaPct), 0.05, 0.8);

  const summary = await getSignalPerformanceSummary({ lookbackHours, maxRows: 5000 });
  if (!summary?.ok) {
    lastCalibration = {
      at: Date.now(),
      ok: false,
      reason: summary?.error || "summary_unavailable",
      lookbackHours
    };
    return lastCalibration;
  }

  const proposals = [];
  for (const s of summary.signals || []) {
    const base = Number(BASELINE_WEIGHTS[s.signal] || 1);
    const candidateMult = toWeight(s.avgOutcomePct, s.total, minSamples, maxDeltaPct);
    const unbounded = base * candidateMult;
    const bounded = clamp(unbounded, CONFIG.minWeight, CONFIG.maxWeight);
    proposals.push({
      signal: s.signal,
      samples: s.total,
      winRatePct: s.winRatePct,
      avgOutcomePct: s.avgOutcomePct,
      baselineWeight: base,
      suggestedWeight: Math.round(bounded * 10000) / 10000,
      deltaPct: Math.round(((bounded - base) / base) * 10000) / 10000,
      eligible: s.total >= minSamples
    });
  }

  // Keep only strongest supported candidates first, but include all known signals.
  proposals.sort((a, b) => {
    if (Number(b.eligible) !== Number(a.eligible)) return Number(b.eligible) - Number(a.eligible);
    return b.samples - a.samples;
  });

  lastCalibration = {
    at: Date.now(),
    ok: true,
    lookbackHours,
    minSamplesPerSignal: minSamples,
    maxDeltaPct,
    metrics: summary.metrics,
    proposals,
    topCombos: (summary.combos || []).slice(0, 10)
  };
  return lastCalibration;
}

function getCalibrationSnapshot() {
  return {
    config: { ...CONFIG },
    baselineWeights: { ...BASELINE_WEIGHTS },
    lastCalibration
  };
}

module.exports = {
  runCalibrationOnce,
  getCalibrationSnapshot
};

