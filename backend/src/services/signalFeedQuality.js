"use strict";

/**
 * Phase 5 — signal feed quality: recency decay, performance-weight blend, anomaly gate.
 * Pure helpers; no I/O.
 */

function asSignalTags(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((s) => String(s).trim()).filter(Boolean).slice(0, 16);
  if (typeof value === "string") {
    try {
      const p = JSON.parse(value);
      return asSignalTags(p);
    } catch (_) {
      return [];
    }
  }
  return [];
}

/**
 * Geometric mean of per-tag weights (stable vs arithmetic when tags disagree).
 * Unknown tags contribute 1.0 (neutral).
 */
function combinedPerformanceWeight(tags, weightMap) {
  const arr = asSignalTags(tags);
  if (!arr.length || !weightMap || typeof weightMap !== "object") return 1;
  let prod = 1;
  let n = 0;
  for (const t of arr) {
    const w = Number(weightMap[t]);
    if (Number.isFinite(w) && w > 0) {
      prod *= w;
      n += 1;
    }
  }
  if (!n) return 1;
  const geo = Math.pow(prod, 1 / n);
  const blend = Number(process.env.SIGNAL_FEED_PERF_WEIGHT_BLEND || 0.75);
  const b = Math.min(1, Math.max(0, Number.isFinite(blend) ? blend : 0.75));
  return 1 + (geo - 1) * b;
}

function clamp(n, lo, hi) {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Exponential decay from 1.0 toward floor as signal ages (minutes).
 */
function recencyMultiplier(createdAtIso, options = {}) {
  const tauMin = Math.max(5, Number(options.tauMin ?? process.env.SIGNAL_FEED_RECENCY_TAU_MIN ?? 120));
  const floor = clamp(Number(options.floor ?? process.env.SIGNAL_FEED_RECENCY_FLOOR ?? 0.82), 0.5, 0.99);
  const t = Date.parse(String(createdAtIso || ""));
  if (!Number.isFinite(t)) return 1;
  const ageMin = (Date.now() - t) / 60000;
  if (!Number.isFinite(ageMin) || ageMin <= 0) return 1;
  const x = ageMin / tauMin;
  const m = floor + (1 - floor) * Math.exp(-x);
  return clamp(m, floor, 1);
}

function recencyDecayLabel(createdAtIso, recencyMult) {
  const t = Date.parse(String(createdAtIso || ""));
  if (!Number.isFinite(t)) return "Recency: n/a";
  const ageMin = Math.max(0, (Date.now() - t) / 60000);
  const pct = Math.round(recencyMult * 1000) / 10;
  if (ageMin < 60) return `Recency: ${pct}% vs fresh (~${Math.round(ageMin)}m old)`;
  const h = (ageMin / 60).toFixed(1);
  return `Recency: ${pct}% vs fresh (~${h}h old)`;
}

/**
 * @param {number|null|undefined} pct
 * @param {number} threshold  abs pct above this → anomaly; 0 disables
 */
function isAnomalousOutcomePct(pct, threshold) {
  const th = Number(threshold);
  if (!Number.isFinite(th) || th <= 0) return false;
  const p = Number(pct);
  if (!Number.isFinite(p)) return false;
  return Math.abs(p) > th;
}

/**
 * Clamp multiplicative stack so one knob cannot collapse the card.
 */
function clampQualityStack(perfW, recW) {
  const minStack = Number(process.env.SIGNAL_FEED_QUALITY_STACK_MIN || 0.72);
  const maxStack = Number(process.env.SIGNAL_FEED_QUALITY_STACK_MAX || 1.12);
  const raw = perfW * recW;
  return clamp(raw, minStack, maxStack);
}

module.exports = {
  asSignalTags,
  combinedPerformanceWeight,
  recencyMultiplier,
  recencyDecayLabel,
  isAnomalousOutcomePct,
  clampQualityStack
};
