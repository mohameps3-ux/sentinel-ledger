"use strict";

/**
 * Shared base Sentinel score for LIVE cards and emission persistence.
 * Single source of truth for wallet lookup + display score resolution.
 */

const BASE_SCORE_MIN = 35;
const BASE_SCORE_MAX = 100;

function clamp(n, lo, hi) {
  const v = Number(n);
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

/** Ranking score: DB smart_score if set, else spec blend win*0.4 + early*0.3 + cluster*0.2 + consistency*0.1 */
function computedSmartScore(row) {
  const wr = Number(row.win_rate || 0);
  const early = Number(row.early_entry_score);
  const cluster = Number(row.cluster_score);
  const consistency = Number(row.consistency_score);
  const db = Number(row.smart_score);
  if (Number.isFinite(db) && db > 0) return Math.min(100, Math.round(db));
  if ([early, cluster, consistency].every((n) => Number.isFinite(n))) {
    const blended = wr * 0.4 + early * 0.3 + cluster * 0.2 + consistency * 0.1;
    return Math.min(100, Math.max(BASE_SCORE_MIN, Math.round(blended)));
  }
  return Math.min(100, Math.max(BASE_SCORE_MIN, Math.round(wr)));
}

async function fetchWalletRows(supabase, addresses) {
  const uniq = [...new Set((addresses || []).filter(Boolean))].slice(0, 40);
  if (!uniq.length) return [];
  const { data, error } = await supabase.from("smart_wallets").select("*").in("wallet_address", uniq);
  if (error) throw error;
  return data || [];
}

function avgWalletSentinel(wallets) {
  if (!wallets.length) return null;
  const scores = wallets.map((w) => {
    const early = Number(w.early_entry_score);
    const cluster = Number(w.cluster_score);
    const consistency = Number(w.consistency_score);
    if ([early, cluster, consistency].every((n) => Number.isFinite(n))) {
      return (early + cluster + consistency) / 3;
    }
    return computedSmartScore(w);
  });
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.min(BASE_SCORE_MAX, Math.max(BASE_SCORE_MIN, Math.round(avg)));
}

function resolveWalletAddresses(walletAddresses, score) {
  const fromArg = Array.isArray(walletAddresses) ? walletAddresses : [];
  if (fromArg.length) return fromArg.filter(Boolean);
  const meta = score?.meta;
  if (Array.isArray(meta?.wallets) && meta.wallets.length) return meta.wallets.filter(Boolean);
  if (Array.isArray(meta?.clusterFullWallets) && meta.clusterFullWallets.length) {
    return meta.clusterFullWallets.filter(Boolean);
  }
  return [];
}

/**
 * Engine dimensions → 0–100 base score (primary fallback when wallet rows are missing).
 *
 * Weights match signalEmissionGate.qualityFromScore (smart 40%, momentum 35%, inverted risk 25%)
 * so the card aligns with the same “quality” axis the emission gate already uses in unified score.
 * Dimensions are 0–100; output is rounded and clamped to feed card bounds.
 */
function engineDimensionsBaseScore(score) {
  const dims = score?.scores;
  if (!dims || typeof dims !== "object") return null;
  const risk = Number(dims.risk);
  const smart = Number(dims.smart);
  const momentum = Number(dims.momentum);
  if (![risk, smart, momentum].some((n) => Number.isFinite(n))) return null;
  const riskC = clamp(Number.isFinite(risk) ? risk : 50, 0, 100);
  const smartC = clamp(Number.isFinite(smart) ? smart : 50, 0, 100);
  const momentumC = clamp(Number.isFinite(momentum) ? momentum : 50, 0, 100);
  const raw = smartC * 0.4 + momentumC * 0.35 + (100 - riskC) * 0.25;
  return Math.min(BASE_SCORE_MAX, Math.max(BASE_SCORE_MIN, Math.round(raw)));
}

/** Last-resort only — legacy feed fallback when wallets and engine dimensions are unavailable. */
function confidenceFallbackBaseScore(score) {
  const confidence = Number(score?.confidence);
  const base = Number.isFinite(confidence) ? confidence : 70;
  return Math.min(BASE_SCORE_MAX, Math.max(40, Math.round(base * 0.92)));
}

function clampBaseScore(n) {
  return Math.min(BASE_SCORE_MAX, Math.max(BASE_SCORE_MIN, Math.round(Number(n))));
}

/**
 * Resolve base Sentinel score (pre perf/recency stack) for persistence or feed display.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {object} score — scoring engine / probing payload
 * @param {string[]} [walletAddresses] — real wallet pubkeys at emission (preferred)
 * @returns {Promise<number>}
 */
async function resolveBaseSentinelScoreAtEmission(supabase, score, walletAddresses) {
  const addrs = resolveWalletAddresses(walletAddresses, score);
  if (addrs.length && supabase) {
    const wallets = await fetchWalletRows(supabase, addrs);
    const fromWallets = avgWalletSentinel(wallets);
    if (fromWallets != null && Number.isFinite(fromWallets)) {
      return clampBaseScore(fromWallets);
    }
  }

  const fromEngine = engineDimensionsBaseScore(score);
  if (fromEngine != null && Number.isFinite(fromEngine)) {
    return clampBaseScore(fromEngine);
  }

  return clampBaseScore(confidenceFallbackBaseScore(score));
}

module.exports = {
  BASE_SCORE_MIN,
  BASE_SCORE_MAX,
  computedSmartScore,
  fetchWalletRows,
  avgWalletSentinel,
  resolveWalletAddresses,
  engineDimensionsBaseScore,
  confidenceFallbackBaseScore,
  resolveBaseSentinelScoreAtEmission
};
