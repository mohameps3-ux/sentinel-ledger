"use strict";

function clamp(n, lo, hi) {
  const v = Number(n);
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

const CONFIG = {
  enabled: String(process.env.SIGNAL_GATE_ENABLED || "true").toLowerCase() !== "false",
  minConfidence: Math.max(1, Number(process.env.SIGNAL_GATE_MIN_CONFIDENCE || 55)),
  minUnifiedScore: clamp(Number(process.env.SIGNAL_GATE_MIN_UNIFIED_SCORE || 0.58), 0, 1),
  minLiquidityUsd: Math.max(0, Number(process.env.SIGNAL_GATE_MIN_LIQUIDITY_USD || 20_000)),
  maxRiskScore: clamp(Number(process.env.SIGNAL_GATE_MAX_RISK_SCORE || 85), 0, 100),
  minSignalsFired: Math.max(0, Number(process.env.SIGNAL_GATE_MIN_SIGNALS_FIRED || 1)),
  historyMax: Math.max(20, Number(process.env.SIGNAL_GATE_HISTORY_MAX || 300))
};

const state = {
  startedAt: new Date().toISOString(),
  decisions: 0,
  emitted: 0,
  blocked: 0,
  blockedByReason: {},
  lastDecisionAt: null,
  recent: []
};

function qualityFromScore(score) {
  const risk = clamp(Number(score?.scores?.risk || 0), 0, 100);
  const smart = clamp(Number(score?.scores?.smart || 0), 0, 100);
  const momentum = clamp(Number(score?.scores?.momentum || 0), 0, 100);
  const riskInv = 100 - risk;
  return clamp((smart * 0.4 + momentum * 0.35 + riskInv * 0.25) / 100, 0, 1);
}

function perfWeightNorm(score) {
  const w = Number(score?.meta?.signalQuality?.performanceWeight);
  if (!Number.isFinite(w) || w <= 0) return 0.75;
  return clamp(w / 1.25, 0, 1);
}

function liquidityNorm(liqUsd) {
  const liq = Number(liqUsd);
  if (!Number.isFinite(liq) || liq <= 0) return 0;
  const ref = Math.max(1, Number(CONFIG.minLiquidityUsd) || 1);
  return clamp(liq / ref, 0, 1);
}

function computeUnifiedScore(score, ctx = {}) {
  const q = qualityFromScore(score);
  const c = clamp(Number(score?.confidence || 0) / 100, 0, 1);
  const p = perfWeightNorm(score);
  const l = liquidityNorm(ctx?.liquidityUsd);
  const unified = clamp(0.45 * q + 0.25 * c + 0.2 * p + 0.1 * l, 0, 1);
  return {
    unified: Number(unified.toFixed(4)),
    components: {
      quality: Number(q.toFixed(4)),
      confidence: Number(c.toFixed(4)),
      performance: Number(p.toFixed(4)),
      liquidity: Number(l.toFixed(4))
    }
  };
}

function pushRecent(entry) {
  state.recent.unshift(entry);
  if (state.recent.length > CONFIG.historyMax) state.recent.length = CONFIG.historyMax;
}

function bumpBlocked(reason) {
  const key = String(reason || "unknown");
  state.blockedByReason[key] = (state.blockedByReason[key] || 0) + 1;
}

function evaluateSignalEmission(score, ctx = {}) {
  const nowIso = new Date().toISOString();
  const signals = Array.isArray(score?.signals) ? score.signals.length : 0;
  const confidence = clamp(Number(score?.confidence || 0), 0, 100);
  const risk = clamp(Number(score?.scores?.risk || 0), 0, 100);
  const liqUsd = Number(ctx?.liquidityUsd);
  const us = computeUnifiedScore(score, ctx);
  const reasons = [];

  if (CONFIG.enabled) {
    if (signals < CONFIG.minSignalsFired) reasons.push("insufficient_signals");
    if (confidence < CONFIG.minConfidence) reasons.push("low_confidence");
    if (risk > CONFIG.maxRiskScore) reasons.push("risk_too_high");
    if (CONFIG.minLiquidityUsd > 0 && (!Number.isFinite(liqUsd) || liqUsd < CONFIG.minLiquidityUsd)) {
      reasons.push("low_liquidity");
    }
    if (us.unified < CONFIG.minUnifiedScore) reasons.push("low_unified_score");
  }

  const allow = !CONFIG.enabled || reasons.length === 0;
  const entry = {
    at: nowIso,
    asset: String(score?.asset || ""),
    allow,
    reasons,
    confidence,
    risk,
    liquidityUsd: Number.isFinite(liqUsd) ? liqUsd : null,
    unifiedScore: us.unified
  };

  state.decisions += 1;
  state.lastDecisionAt = nowIso;
  if (allow) state.emitted += 1;
  else {
    state.blocked += 1;
    for (const r of reasons) bumpBlocked(r);
  }
  pushRecent(entry);

  return {
    allow,
    reasons,
    unifiedScore: us.unified,
    components: us.components
  };
}

function getSignalGateOpsSnapshot() {
  const rate = state.decisions > 0 ? state.emitted / state.decisions : 0;
  return {
    config: {
      ...CONFIG
    },
    stats: {
      startedAt: state.startedAt,
      decisions: state.decisions,
      emitted: state.emitted,
      blocked: state.blocked,
      emitRate: Number(rate.toFixed(4)),
      blockedByReason: state.blockedByReason,
      lastDecisionAt: state.lastDecisionAt
    },
    recent: state.recent.slice(0, 40)
  };
}

module.exports = {
  evaluateSignalEmission,
  getSignalGateOpsSnapshot
};

