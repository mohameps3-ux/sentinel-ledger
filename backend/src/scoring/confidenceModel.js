"use strict";

/**
 * CAL-4 confidence shadow (v2) — parallel to v1, no gate impact until promoted.
 * v1 = production formula (activity proxy). v2 = edge proxy (capped wallets,
 * inverted probe skew, late-entry penalty from absChange24h).
 */

const SHADOW_VERSION = "cal4-v2-shadow";

function clamp(n, lo, hi) {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

function readNum(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? n : fallback;
}

const V2 = {
  walletCap: Math.max(1, readNum("CONF_V2_WALLET_CAP", 4)),
  walletTerm: readNum("CONF_V2_WALLET_TERM", 5),
  ruleTerm: readNum("CONF_V2_RULE_TERM", 15),
  contradictionTerm: readNum("CONF_V2_CONTRADICTION_TERM", 20),
  latePenalty30: readNum("CONF_V2_LATE_PENALTY_30", 8),
  latePenalty50: readNum("CONF_V2_LATE_PENALTY_50", 15),
  latePenalty100: readNum("CONF_V2_LATE_PENALTY_100", 25),
  probeConfEarly: readNum("CONF_V2_PROBE_CONF_EARLY", 82),
  probeConfLate: readNum("CONF_V2_PROBE_CONF_LATE", 48)
};

function normalizeAbsChange24h(absChange24hPct) {
  const n = Number(absChange24hPct);
  if (!Number.isFinite(n)) return null;
  return Math.abs(n);
}

/** v1 engine formula (unchanged semantics). */
function computeConfidenceV1({
  rulesTriggered,
  uniqueWallets,
  recentActivityBoost,
  contradictions
}) {
  const raw =
    rulesTriggered * 15 +
    uniqueWallets * 5 +
    recentActivityBoost -
    contradictions * 20;
  return clamp(Math.round(raw), 0, 100);
}

function lateEntryPenalty(absChange24hPct) {
  const absChg = normalizeAbsChange24h(absChange24hPct);
  if (absChg == null || absChg <= 0) return 0;
  if (absChg >= 100) return V2.latePenalty100;
  if (absChg >= 50) return V2.latePenalty50;
  if (absChg >= 30) return V2.latePenalty30;
  return 0;
}

function cappedWalletCount(uniqueWallets) {
  const w = Math.max(0, Number(uniqueWallets) || 0);
  return Math.min(w, V2.walletCap);
}

function cappedWalletTerm(uniqueWallets) {
  return cappedWalletCount(uniqueWallets) * V2.walletTerm;
}

/** Raw ingredients persisted for post-hoc threshold tuning (SQL + env vars). */
function buildV2ComponentsRaw({
  rulesTriggered,
  uniqueWallets,
  recentActivityBoost,
  contradictions,
  absChange24hPct,
  priceSkew,
  perfStack
}) {
  const walletsRaw = Math.max(0, Number(uniqueWallets) || 0);
  const skewProvided = priceSkew != null && String(priceSkew).trim() !== "";
  const skewRaw = Number(priceSkew);
  return {
    rulesTriggered: Math.max(0, Number(rulesTriggered) || 0),
    uniqueWallets: walletsRaw,
    uniqueWalletsCapped: cappedWalletCount(walletsRaw),
    recentActivityBoost: Math.max(0, Number(recentActivityBoost) || 0),
    contradictions: Math.max(0, Number(contradictions) || 0),
    priceSkew: skewProvided && Number.isFinite(skewRaw) ? skewRaw : null,
    absChange24h: normalizeAbsChange24h(absChange24hPct),
    lateEntryPenaltyApplied: lateEntryPenalty(absChange24hPct),
    perfStack: Number.isFinite(Number(perfStack)) ? Number(perfStack) : 1
  };
}

/** v2 engine formula — edge proxy. */
function computeConfidenceV2({
  rulesTriggered,
  uniqueWallets,
  recentActivityBoost,
  contradictions,
  absChange24hPct,
  perfStack
}) {
  const components = buildV2ComponentsRaw({
    rulesTriggered,
    uniqueWallets,
    recentActivityBoost,
    contradictions,
    absChange24hPct,
    priceSkew: null,
    perfStack
  });
  const raw =
    components.rulesTriggered * V2.ruleTerm +
    components.uniqueWalletsCapped * V2.walletTerm +
    components.recentActivityBoost -
    components.contradictions * V2.contradictionTerm -
    components.lateEntryPenaltyApplied;
  return {
    value: clamp(Math.round(raw), 0, 100),
    components
  };
}

/** v1 cluster_probing (legacy — rewards high skew). */
function computeProbeConfidenceV1(priceSkew) {
  const skew = Number(priceSkew);
  if (!Number.isFinite(skew) || skew < 0) return 55;
  return clamp(Math.min(95, 55 + Math.round(skew * 800)), 0, 100);
}

/**
 * v2 cluster_probing — low skew (tight fills, early) = high confidence.
 * skewNorm: 0 at minSkew (best), 1 at maxSkew (late, still emit-eligible).
 */
function computeProbeConfidenceV2(priceSkew, minSkew = 0, maxSkew = 0.015) {
  const skew = Number(priceSkew);
  const minS = Number(minSkew);
  const maxS = Number(maxSkew);
  if (!Number.isFinite(skew) || skew < 0) {
    return { value: V2.probeConfLate, skewNorm: 1 };
  }
  const span = Math.max(1e-9, maxS - minS);
  const skewNorm = clamp((skew - minS) / span, 0, 1);
  const raw = V2.probeConfEarly - skewNorm * (V2.probeConfEarly - V2.probeConfLate);
  return {
    value: clamp(Math.round(raw), 0, 100),
    skewNorm: Number(skewNorm.toFixed(4))
  };
}

function applyPerfStack(confidence, perfStack) {
  const stack = Number(perfStack);
  if (!Number.isFinite(stack) || stack <= 0) return confidence;
  return clamp(Math.round(confidence * stack), 0, 100);
}

function buildEngineConfidenceShadow({
  rulesTriggered,
  uniqueWallets,
  recentActivityBoost,
  contradictions,
  absChange24hPct,
  perfStack
}) {
  const stack = Number.isFinite(Number(perfStack)) ? Number(perfStack) : 1;
  const v1Base = computeConfidenceV1({
    rulesTriggered,
    uniqueWallets,
    recentActivityBoost,
    contradictions
  });
  const v2 = computeConfidenceV2({
    rulesTriggered,
    uniqueWallets,
    recentActivityBoost,
    contradictions,
    absChange24hPct,
    perfStack: stack
  });
  const confidence_v1 = applyPerfStack(v1Base, stack);
  const confidence_v2 = applyPerfStack(v2.value, stack);
  return {
    confidence_v1,
    confidence_v2,
    shadowVersion: SHADOW_VERSION,
    source: "engine",
    perfStack: stack,
    v2Components: v2.components
  };
}

function buildProbeConfidenceShadow(
  priceSkew,
  { minSkew, maxSkew, absChange24hPct, uniqueWallets } = {}
) {
  const v1 = computeProbeConfidenceV1(priceSkew);
  const v2Probe = computeProbeConfidenceV2(priceSkew, minSkew, maxSkew);
  const components = buildV2ComponentsRaw({
    rulesTriggered: 1,
    uniqueWallets,
    recentActivityBoost: 0,
    contradictions: 0,
    absChange24hPct,
    priceSkew,
    perfStack: 1
  });
  const confidence_v2 = clamp(Math.round(v2Probe.value - components.lateEntryPenaltyApplied), 0, 100);
  return {
    confidence_v1: v1,
    confidence_v2,
    shadowVersion: SHADOW_VERSION,
    source: "cluster_probing",
    perfStack: 1,
    v2Components: components
  };
}

/** Merge into emission_gate.meta at persist / gate decision time. */
function buildEmissionConfidenceMeta(score) {
  const sh = score?.meta?.confidenceShadow;
  if (!sh || typeof sh !== "object") return null;
  const v1 = clamp(Number(score?.confidence ?? sh.confidence_v1), 0, 100);
  const v2 = clamp(Number(sh.confidence_v2), 0, 100);
  return {
    confidence_v1: v1,
    confidence_v2: v2,
    shadowVersion: sh.shadowVersion || SHADOW_VERSION,
    source: sh.source || "unknown",
    perfStack: sh.perfStack ?? sh.v2Components?.perfStack ?? null,
    clusterBoostApplied: sh.clusterBoostApplied ?? 0,
    v2Components: sh.v2Components || null
  };
}

function applyClusterBoostToShadow(score, boost) {
  const b = Number(boost);
  if (!Number.isFinite(b) || b <= 0 || !score?.meta?.confidenceShadow) return;
  const sh = score.meta.confidenceShadow;
  sh.clusterBoostApplied = b;
  sh.confidence_v2 = clamp(Math.round(Number(sh.confidence_v2) + b), 0, 100);
}

module.exports = {
  SHADOW_VERSION,
  V2,
  computeConfidenceV1,
  computeConfidenceV2,
  computeProbeConfidenceV1,
  computeProbeConfidenceV2,
  lateEntryPenalty,
  buildV2ComponentsRaw,
  buildEngineConfidenceShadow,
  buildProbeConfidenceShadow,
  buildEmissionConfidenceMeta,
  applyClusterBoostToShadow
};
