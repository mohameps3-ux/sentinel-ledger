"use strict";

const redis = require("../lib/cache");
const { getSignalPerformanceSummary } = require("./signalPerformance");

const CONFIG = {
  lookbackHours: Number(process.env.SIGNAL_CALIBRATOR_LOOKBACK_HOURS || 72),
  minSamplesPerSignal: Number(process.env.SIGNAL_CALIBRATOR_MIN_SAMPLES || 30),
  maxDeltaPct: Number(process.env.SIGNAL_CALIBRATOR_MAX_DELTA_PCT || 0.35),
  minWeight: Number(process.env.SIGNAL_CALIBRATOR_MIN_WEIGHT || 0.6),
  maxWeight: Number(process.env.SIGNAL_CALIBRATOR_MAX_WEIGHT || 1.6)
};

/** Shared active weights across Railway replicas; rollback = DEL key in Upstash. */
const SIGNAL_WEIGHTS_REDIS_KEY =
  String(process.env.SIGNAL_WEIGHTS_REDIS_KEY || "").trim() || "sentinel:signal_weights:v1";

const SIGNAL_WEIGHTS_REDIS_TTL_SEC = (() => {
  const n = Number(process.env.SIGNAL_WEIGHTS_REDIS_TTL_SEC);
  if (!Number.isFinite(n) || n < 300) return 60 * 60 * 24 * 90;
  return Math.min(60 * 60 * 24 * 365, Math.floor(n));
})();

const BASELINE_WEIGHTS = {
  whale_accumulation: 1.0,
  cluster_buy: 1.0,
  velocity_spike: 1.0,
  liquidity_shock: 1.0,
  new_wallet_confidence: 1.0
};

let lastCalibration = null;
/** Full map merged from baseline + eligible proposals; updated after each successful calib + Redis hydrate. */
let publishedWeights = null;
let lastRedisHydrateAt = null;
let lastRedisPersistAt = null;
let pollIntervalRef = null;

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
  await persistPublishedWeightsToRedis(lastCalibration);
  return lastCalibration;
}

function buildActiveWeightMapFromCalibration(lc) {
  const out = { ...BASELINE_WEIGHTS };
  if (!lc?.ok || !Array.isArray(lc.proposals)) return out;
  for (const p of lc.proposals) {
    if (!p?.signal || !p.eligible) continue;
    const w = Number(p.suggestedWeight);
    if (Number.isFinite(w)) {
      out[String(p.signal)] = clamp(w, CONFIG.minWeight, CONFIG.maxWeight);
    }
  }
  return out;
}

async function persistPublishedWeightsToRedis(lc) {
  const merged = buildActiveWeightMapFromCalibration(lc);
  publishedWeights = merged;
  const payload = {
    v: 1,
    savedAt: new Date().toISOString(),
    weights: merged,
    lookbackHours: lc.lookbackHours,
    minSamplesPerSignal: lc.minSamplesPerSignal
  };
  try {
    let oldRaw = null;
    try {
      oldRaw = await redis.get(SIGNAL_WEIGHTS_REDIS_KEY);
    } catch (_) {}
    if (oldRaw != null) {
      const backupKey = `${SIGNAL_WEIGHTS_REDIS_KEY}:backup:${Date.now()}`;
      await redis.set(backupKey, oldRaw, { ex: 72 * 3600 });
      await redis.set(`${SIGNAL_WEIGHTS_REDIS_KEY}:last_backup`, backupKey, { ex: 72 * 3600 });
    }
    await redis.set(SIGNAL_WEIGHTS_REDIS_KEY, JSON.stringify(payload), { ex: SIGNAL_WEIGHTS_REDIS_TTL_SEC });
    lastRedisPersistAt = Date.now();
  } catch (e) {
    console.warn("[signal-calibrator] redis persist failed:", e?.message || e);
  }
}

/**
 * Load published weights from Upstash so all replicas share the same map after cold start / leader change.
 */
async function hydratePublishedWeightsFromRedis() {
  try {
    const raw = await redis.get(SIGNAL_WEIGHTS_REDIS_KEY);
    if (raw == null) {
      publishedWeights = null;
      lastRedisHydrateAt = Date.now();
      return false;
    }
    const doc = typeof raw === "string" ? JSON.parse(raw) : raw;
    const w = doc?.weights;
    if (!w || typeof w !== "object") {
      lastRedisHydrateAt = Date.now();
      return false;
    }
    const next = { ...BASELINE_WEIGHTS };
    for (const key of Object.keys(BASELINE_WEIGHTS)) {
      const n = Number(w[key]);
      if (Number.isFinite(n)) {
        next[key] = clamp(n, CONFIG.minWeight, CONFIG.maxWeight);
      }
    }
    publishedWeights = next;
    lastRedisHydrateAt = Date.now();
    return true;
  } catch (e) {
    console.warn("[signal-calibrator] redis hydrate failed:", e?.message || e);
    return false;
  }
}

function startSignalWeightsRedisPoll() {
  if (pollIntervalRef) return;
  const msRaw = Number(process.env.SIGNAL_WEIGHTS_REDIS_POLL_MS);
  const ms = Number.isFinite(msRaw) && msRaw >= 5000 ? Math.floor(msRaw) : 60_000;
  pollIntervalRef = setInterval(() => {
    hydratePublishedWeightsFromRedis().catch(() => {});
  }, ms);
  if (pollIntervalRef && typeof pollIntervalRef.unref === "function") pollIntervalRef.unref();
}

function getCalibrationSnapshot() {
  return {
    config: { ...CONFIG },
    baselineWeights: { ...BASELINE_WEIGHTS },
    lastCalibration,
    publishedWeights: publishedWeights ? { ...publishedWeights } : null,
    redis: {
      key: SIGNAL_WEIGHTS_REDIS_KEY,
      lastHydrateAt: lastRedisHydrateAt,
      lastPersistAt: lastRedisPersistAt,
      ttlSec: SIGNAL_WEIGHTS_REDIS_TTL_SEC
    }
  };
}

/** Merged baseline + eligible calibration; prefers Redis-backed snapshot when present. */
function getActiveSignalWeightMap() {
  if (publishedWeights && typeof publishedWeights === "object") {
    const out = { ...BASELINE_WEIGHTS };
    for (const key of Object.keys(BASELINE_WEIGHTS)) {
      const w = publishedWeights[key];
      if (Number.isFinite(Number(w))) {
        out[key] = clamp(Number(w), CONFIG.minWeight, CONFIG.maxWeight);
      }
    }
    return out;
  }
  return buildActiveWeightMapFromCalibration(lastCalibration);
}

/**
 * Sample-weighted historical edge for a set of fired signal/rule names.
 *
 * Used by the narrative orchestrator so frontends can show statements like
 * "similar pattern → +12.4% avg (n=63)" — backed by `signal_performance`
 * via `runCalibrationOnce`. Pure read against `lastCalibration`; no I/O.
 *
 * Returns `null` when there is no eligible sample. That nullability is
 * intentional: callers fall back to their existing template (no UX
 * regression while the system is bootstrapping).
 *
 * @param {string[]} signalNames
 * @returns {{ avgOutcomePct:number, samples:number, winRatePct:number, signals:string[] } | null}
 */
function getHistoricalEdgeForSignals(signalNames) {
  if (!Array.isArray(signalNames) || signalNames.length === 0) return null;
  const lc = lastCalibration;
  if (!lc?.ok || !Array.isArray(lc.proposals)) return null;
  const set = new Set(
    signalNames
      .map((s) => String(s || "").trim())
      .filter((s) => s.length > 0)
  );
  if (set.size === 0) return null;

  const matched = lc.proposals.filter(
    (p) => p && p.eligible && set.has(String(p.signal))
  );
  if (matched.length === 0) return null;

  let totalSamples = 0;
  let weightedAvg = 0;
  let weightedWin = 0;
  const used = [];
  for (const p of matched) {
    const n = Number(p.samples);
    const a = Number(p.avgOutcomePct);
    const w = Number(p.winRatePct);
    if (!Number.isFinite(n) || n <= 0) continue;
    if (!Number.isFinite(a)) continue;
    totalSamples += n;
    weightedAvg += a * n;
    weightedWin += (Number.isFinite(w) ? w : 0) * n;
    used.push(String(p.signal));
  }
  if (totalSamples === 0) return null;

  return {
    avgOutcomePct: Math.round((weightedAvg / totalSamples) * 100) / 100,
    samples: totalSamples,
    winRatePct: Math.round((weightedWin / totalSamples) * 100) / 100,
    signals: used
  };
}

module.exports = {
  runCalibrationOnce,
  getCalibrationSnapshot,
  getActiveSignalWeightMap,
  getHistoricalEdgeForSignals,
  hydratePublishedWeightsFromRedis,
  startSignalWeightsRedisPoll
};

