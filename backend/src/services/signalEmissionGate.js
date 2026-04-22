"use strict";

function clamp(n, lo, hi) {
  const v = Number(n);
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

const BASE_CONFIG = {
  enabled: String(process.env.SIGNAL_GATE_ENABLED || "true").toLowerCase() !== "false",
  minConfidence: Math.max(1, Number(process.env.SIGNAL_GATE_MIN_CONFIDENCE || 55)),
  minUnifiedScore: clamp(Number(process.env.SIGNAL_GATE_MIN_UNIFIED_SCORE || 0.58), 0, 1),
  minLiquidityUsd: Math.max(0, Number(process.env.SIGNAL_GATE_MIN_LIQUIDITY_USD || 20_000)),
  maxRiskScore: clamp(Number(process.env.SIGNAL_GATE_MAX_RISK_SCORE || 85), 0, 100),
  minSignalsFired: Math.max(0, Number(process.env.SIGNAL_GATE_MIN_SIGNALS_FIRED || 1)),
  historyMax: Math.max(20, Number(process.env.SIGNAL_GATE_HISTORY_MAX || 300))
};

const REGIME_ENABLED =
  String(process.env.SIGNAL_GATE_REGIME_ENABLED || "false").toLowerCase() === "true";

const USE_CALIBRATED_CONFIDENCE =
  String(process.env.SIGNAL_GATE_USE_CALIBRATED_CONFIDENCE || "false").toLowerCase() === "true";
const MIN_EV_PROXY = clamp(Number(process.env.SIGNAL_GATE_MIN_EV_PROXY || 0), 0, 1);
const MAX_SLIPPAGE_RISK = clamp(Number(process.env.SIGNAL_GATE_MAX_SLIPPAGE_RISK || 1), 0, 1);
const BLOCK_META_LABEL_SKIP =
  String(process.env.SIGNAL_GATE_META_BLOCK_SKIP || "false").toLowerCase() === "true";
const BLOCK_META_LABEL_CAUTION =
  String(process.env.SIGNAL_GATE_META_BLOCK_CAUTION || "false").toLowerCase() === "true";

function regimeClassifierParams() {
  return {
    volatileAbsPct: Math.max(0, Number(process.env.SIGNAL_GATE_REGIME_VOLATILE_ABS_PCT || 12)),
    trendingAbsPct: Math.max(0, Number(process.env.SIGNAL_GATE_REGIME_TRENDING_ABS_PCT || 5)),
    volatileVolLiqRatio: Math.max(0, Number(process.env.SIGNAL_GATE_REGIME_VOLATILE_VOL_LIQ_RATIO || 10))
  };
}

const dynamic = {
  overrides: null,
  lastOverrideAt: null,
  lastOverrideReason: null,
  tuningHistory: []
};

function emptyRegimeStats() {
  return { decisions: 0, emitted: 0, blocked: 0 };
}

const state = {
  startedAt: new Date().toISOString(),
  decisions: 0,
  emitted: 0,
  blocked: 0,
  blockedByReason: {},
  lastDecisionAt: null,
  recent: [],
  byRegime: {
    calm: emptyRegimeStats(),
    trending: emptyRegimeStats(),
    volatile: emptyRegimeStats(),
    unknown: emptyRegimeStats()
  }
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

function liquidityNorm(liqUsd, minRefUsd) {
  const liq = Number(liqUsd);
  if (!Number.isFinite(liq) || liq <= 0) return 0;
  const ref = Math.max(1, Number(minRefUsd) || 1);
  return clamp(liq / ref, 0, 1);
}

function computeUnifiedScore(score, ctx = {}, minLiquidityUsd) {
  const refLiq = Number.isFinite(Number(minLiquidityUsd))
    ? Number(minLiquidityUsd)
    : BASE_CONFIG.minLiquidityUsd;
  const q = qualityFromScore(score);
  const c = clamp(Number(score?.confidence || 0) / 100, 0, 1);
  const p = perfWeightNorm(score);
  const l = liquidityNorm(ctx?.liquidityUsd, refLiq);
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

function classifyMarketRegime(ctx = {}) {
  const liq = Number(ctx?.liquidityUsd);
  const vol = Number(ctx?.volume24h);
  const chg = ctx?.priceChange24h;
  const absChg = Number.isFinite(Number(chg)) ? Math.abs(Number(chg)) : null;
  const volLiq =
    Number.isFinite(vol) && Number.isFinite(liq) && liq > 0 ? vol / liq : null;

  const { volatileAbsPct, trendingAbsPct, volatileVolLiqRatio } = regimeClassifierParams();

  if (!Number.isFinite(liq) || liq <= 0) {
    return { key: "unknown", absChange24hPct: absChg, volumeLiquidityRatio: volLiq };
  }

  if (
    (absChg != null && absChg >= volatileAbsPct) ||
    (volLiq != null && volLiq >= volatileVolLiqRatio)
  ) {
    return { key: "volatile", absChange24hPct: absChg, volumeLiquidityRatio: volLiq };
  }
  if (absChg != null && absChg >= trendingAbsPct) {
    return { key: "trending", absChange24hPct: absChg, volumeLiquidityRatio: volLiq };
  }
  return { key: "calm", absChange24hPct: absChg, volumeLiquidityRatio: volLiq };
}

const REGIME_ENV_KEYS = [
  ["minConfidence", "MIN_CONFIDENCE"],
  ["minUnifiedScore", "MIN_UNIFIED_SCORE"],
  ["maxRiskScore", "MAX_RISK_SCORE"],
  ["minLiquidityUsd", "MIN_LIQUIDITY_USD"],
  ["minSignalsFired", "MIN_SIGNALS_FIRED"]
];

function readRegimeEnvOverrides(regimeUpper) {
  const out = {};
  for (const [field, suffix] of REGIME_ENV_KEYS) {
    const raw = process.env[`SIGNAL_GATE_REGIME_${regimeUpper}_${suffix}`];
    if (raw == null || raw === "") continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    out[field] = n;
  }
  return out;
}

function defaultRegimePatch(regimeKey, baseCfg) {
  const b = baseCfg;
  if (regimeKey === "volatile") {
    return {
      minConfidence: Math.min(99, b.minConfidence + 7),
      minUnifiedScore: clamp(b.minUnifiedScore + 0.05, 0, 1),
      maxRiskScore: clamp(b.maxRiskScore - 5, 0, 100)
    };
  }
  if (regimeKey === "trending") {
    return {
      minConfidence: Math.min(99, b.minConfidence + 3),
      minUnifiedScore: clamp(b.minUnifiedScore + 0.02, 0, 1)
    };
  }
  return {};
}

function computeRegimePatch(regimeKey, baseCfg) {
  if (!REGIME_ENABLED) return {};
  if (regimeKey === "unknown") return {};
  const envU = String(regimeKey || "unknown").toUpperCase();
  const defaults = defaultRegimePatch(regimeKey, baseCfg);
  const fromEnv = readRegimeEnvOverrides(envU);
  return { ...defaults, ...fromEnv };
}

function bumpRegime(regimeKey, allow) {
  const k = state.byRegime[regimeKey] ? regimeKey : "unknown";
  state.byRegime[k].decisions += 1;
  if (allow) state.byRegime[k].emitted += 1;
  else state.byRegime[k].blocked += 1;
}

function pushRecent(entry) {
  state.recent.unshift(entry);
  if (state.recent.length > BASE_CONFIG.historyMax) state.recent.length = BASE_CONFIG.historyMax;
}

function bumpBlocked(reason) {
  const key = String(reason || "unknown");
  state.blockedByReason[key] = (state.blockedByReason[key] || 0) + 1;
}

function activeConfig() {
  if (!dynamic.overrides) return { ...BASE_CONFIG };
  return {
    ...BASE_CONFIG,
    ...dynamic.overrides
  };
}

function applySignalGateOverrides(overrides = {}, meta = {}) {
  const next = {};
  if (overrides.minConfidence != null) {
    next.minConfidence = clamp(Number(overrides.minConfidence), 1, 99);
  }
  if (overrides.minUnifiedScore != null) {
    next.minUnifiedScore = clamp(Number(overrides.minUnifiedScore), 0, 1);
  }
  if (overrides.minLiquidityUsd != null) {
    next.minLiquidityUsd = Math.max(0, Number(overrides.minLiquidityUsd));
  }
  if (overrides.maxRiskScore != null) {
    next.maxRiskScore = clamp(Number(overrides.maxRiskScore), 0, 100);
  }
  if (overrides.minSignalsFired != null) {
    next.minSignalsFired = Math.max(0, Number(overrides.minSignalsFired));
  }
  dynamic.overrides = Object.keys(next).length ? next : null;
  dynamic.lastOverrideAt = new Date().toISOString();
  dynamic.lastOverrideReason = String(meta.reason || "manual_or_tuner");
  dynamic.tuningHistory.unshift({
    at: dynamic.lastOverrideAt,
    reason: dynamic.lastOverrideReason,
    overrides: dynamic.overrides
  });
  if (dynamic.tuningHistory.length > 120) dynamic.tuningHistory.length = 120;
  return {
    ok: true,
    overrides: dynamic.overrides,
    effectiveConfig: activeConfig()
  };
}

function effectiveConfidenceForGate(score) {
  if (!USE_CALIBRATED_CONFIDENCE) return clamp(Number(score?.confidence || 0), 0, 100);
  const al = score?.meta?.alphaLayer;
  const cc = al && Number(al.calibratedConfidence);
  if (Number.isFinite(cc)) return clamp(cc, 0, 100);
  return clamp(Number(score?.confidence || 0), 0, 100);
}

function appendAlphaLayerGateReasons(score, reasons) {
  const al = score?.meta?.alphaLayer;
  if (!al || typeof al !== "object") return;
  if (MIN_EV_PROXY > 0) {
    const ev = Number(al.evProxy);
    if (!Number.isFinite(ev) || ev < MIN_EV_PROXY) reasons.push("low_ev_proxy");
  }
  if (MAX_SLIPPAGE_RISK < 1) {
    const s = Number(al.slippageRisk);
    if (!Number.isFinite(s) || s > MAX_SLIPPAGE_RISK) reasons.push("slippage_too_high");
  }
  if (BLOCK_META_LABEL_SKIP && al.metaLabel === "skip") reasons.push("meta_label_skip");
  if (BLOCK_META_LABEL_CAUTION && al.metaLabel === "caution") reasons.push("meta_label_caution");
}

function alphaGateConfigSnapshot() {
  return {
    useCalibratedConfidence: USE_CALIBRATED_CONFIDENCE,
    minEvProxy: MIN_EV_PROXY,
    maxSlippageRisk: MAX_SLIPPAGE_RISK,
    blockMetaLabelSkip: BLOCK_META_LABEL_SKIP,
    blockMetaLabelCaution: BLOCK_META_LABEL_CAUTION
  };
}

function evaluateSignalEmission(score, ctx = {}) {
  const baseMerged = activeConfig();
  const regime = classifyMarketRegime(ctx);
  const regimePatch = computeRegimePatch(regime.key, baseMerged);
  const cfg = { ...baseMerged, ...regimePatch };
  const nowIso = new Date().toISOString();
  const signals = Array.isArray(score?.signals) ? score.signals.length : 0;
  const confidence = clamp(Number(score?.confidence || 0), 0, 100);
  const confGate = effectiveConfidenceForGate(score);
  const risk = clamp(Number(score?.scores?.risk || 0), 0, 100);
  const liqUsd = Number(ctx?.liquidityUsd);
  const us = computeUnifiedScore(score, ctx, cfg.minLiquidityUsd);
  const reasons = [];

  if (cfg.enabled) {
    if (signals < cfg.minSignalsFired) reasons.push("insufficient_signals");
    if (confGate < cfg.minConfidence) reasons.push("low_confidence");
    if (risk > cfg.maxRiskScore) reasons.push("risk_too_high");
    if (cfg.minLiquidityUsd > 0 && (!Number.isFinite(liqUsd) || liqUsd < cfg.minLiquidityUsd)) {
      reasons.push("low_liquidity");
    }
    if (us.unified < cfg.minUnifiedScore) reasons.push("low_unified_score");
    appendAlphaLayerGateReasons(score, reasons);
  }

  const allow = !cfg.enabled || reasons.length === 0;
  const entry = {
    at: nowIso,
    asset: String(score?.asset || ""),
    allow,
    reasons,
    confidence,
    confidenceGated: confGate,
    risk,
    liquidityUsd: Number.isFinite(liqUsd) ? liqUsd : null,
    unifiedScore: us.unified,
    metaLabel: score?.meta?.alphaLayer?.metaLabel || null,
    evProxy: score?.meta?.alphaLayer?.evProxy ?? null,
    regime: {
      key: regime.key,
      classifierEnabled: REGIME_ENABLED,
      inputs: {
        absChange24hPct: regime.absChange24hPct,
        volumeLiquidityRatio: regime.volumeLiquidityRatio
      },
      patchKeys: Object.keys(regimePatch)
    }
  };

  state.decisions += 1;
  state.lastDecisionAt = nowIso;
  bumpRegime(regime.key, allow);
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
    components: us.components,
    regime: entry.regime,
    effectiveGate: {
      minConfidence: cfg.minConfidence,
      minUnifiedScore: cfg.minUnifiedScore,
      maxRiskScore: cfg.maxRiskScore,
      minLiquidityUsd: cfg.minLiquidityUsd,
      minSignalsFired: cfg.minSignalsFired
    }
  };
}

function previewEffectiveByRegime() {
  const base = activeConfig();
  const keys = ["calm", "trending", "volatile", "unknown"];
  const out = {};
  for (const k of keys) {
    const patch = computeRegimePatch(k, base);
    out[k] = {
      patch,
      effective: { ...base, ...patch }
    };
  }
  return out;
}

function getSignalGateOpsSnapshot() {
  const rate = state.decisions > 0 ? state.emitted / state.decisions : 0;
  return {
    config: {
      ...activeConfig()
    },
    baseConfig: {
      ...BASE_CONFIG
    },
    overrides: dynamic.overrides,
    overrideMeta: {
      lastOverrideAt: dynamic.lastOverrideAt,
      lastOverrideReason: dynamic.lastOverrideReason
    },
    regime: {
      enabled: REGIME_ENABLED,
      classifier: regimeClassifierParams(),
      byRegime: state.byRegime,
      effectivePreview: previewEffectiveByRegime()
    },
    alpha: alphaGateConfigSnapshot(),
    stats: {
      startedAt: state.startedAt,
      decisions: state.decisions,
      emitted: state.emitted,
      blocked: state.blocked,
      emitRate: Number(rate.toFixed(4)),
      blockedByReason: state.blockedByReason,
      lastDecisionAt: state.lastDecisionAt
    },
    recent: state.recent.slice(0, 40),
    tuningHistory: dynamic.tuningHistory.slice(0, 40)
  };
}

module.exports = {
  evaluateSignalEmission,
  getSignalGateOpsSnapshot,
  applySignalGateOverrides
};
