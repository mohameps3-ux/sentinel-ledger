"use strict";

/**
 * Sentinel Scoring Engine — v1.
 *
 * 5 Golden Rules as pure functions that consume a `ctx` and return RuleResult|null.
 * The orchestrator builds ctx from the SentinelEvent + existing services, runs all
 * rules, aggregates deltas into score dimensions, and computes a confidence value
 * out of "how much evidence we actually have" (not the score itself).
 *
 * Constraints:
 *  - No new DB tables. Latest score is cached in Redis under `scoring:latest:{asset}`
 *    so future read endpoints can serve it without re-evaluation.
 *  - No new external dependencies. Reuses convergenceService.isSmartWallet for the
 *    elite-wallet cohort (smart_wallets.win_rate >= 70 in the existing schema).
 *  - All thresholds are env-tunable so we can iterate without redeploys.
 *
 * @typedef {Object} RuleDelta
 * @property {number} [risk]
 * @property {number} [smart]
 * @property {number} [momentum]
 *
 * @typedef {Object} RuleResult
 * @property {RuleDelta} delta
 * @property {string} signal
 * @property {string} insight
 *
 * @typedef {Object} ScoringResult
 * @property {{ risk:number, smart:number, momentum:number }} scores  - clamped 0..100
 * @property {string[]} signals
 * @property {string[]} insights
 * @property {number} confidence  - clamped 0..100
 * @property {string} confidenceLabel - "Low" | "Medium" | "High"
 * @property {Object} meta
 */

const cache = require("../lib/cache");
const {
  recordAssetEvent,
  getAssetStats,
  touchWalletFirstSeen
} = require("./state");
const { isSmartWallet } = require("../services/convergenceService");
const { sign: signScoreResult } = require("../lib/scoreSigner");

const CONFIG = {
  whaleMinUsd: Number(process.env.RULE_WHALE_MIN_USD || 5_000),
  liquidityShockPct: Number(process.env.RULE_LIQ_SHOCK_PCT || 0.05),
  liquidityShockMinUsd: Number(process.env.RULE_LIQ_SHOCK_MIN_USD || 1_000),
  clusterMinWallets: Number(process.env.RULE_CLUSTER_MIN_WALLETS || 3),
  clusterWindowMs: Number(process.env.RULE_CLUSTER_WINDOW_MS || 40_000),
  clusterMinUsdEach: Number(process.env.RULE_CLUSTER_MIN_USD || 250),
  newWalletMaxAgeMs: Number(process.env.RULE_NEWWALLET_MAX_AGE_MS || 24 * 60 * 60 * 1000),
  newWalletMinUsd: Number(process.env.RULE_NEWWALLET_MIN_USD || 1_000),
  velocityMultiplier: Number(process.env.RULE_VELOCITY_MULT || 3),
  velocityMinBaseline: Number(process.env.RULE_VELOCITY_MIN_BASELINE || 1),
  cacheTtlSec: 600
};

const SCORE_BASELINE = { risk: 50, smart: 50, momentum: 50 };

function clamp(n, lo, hi) {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

function isBuyish(event) {
  if (!event) return false;
  if (event.type === "TRANSFER") return false;
  const labels = Array.isArray(event.metadata?.labels) ? event.metadata.labels : [];
  if (labels.includes("buy")) return true;
  if (labels.includes("swap")) return true;
  return event.type === "SWAP";
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Rules                                                                      */
/* ────────────────────────────────────────────────────────────────────────── */

/** 1. Elite (smart) wallet swap-buy above USD threshold. */
function ruleWhaleAccumulation(ctx) {
  if (!ctx.isElite) return null;
  if (!isBuyish(ctx.event)) return null;
  if (!(ctx.amountUsd >= CONFIG.whaleMinUsd)) return null;
  return {
    delta: { smart: 40 },
    signal: "whale_accumulation",
    insight: `Elite wallet ${shortAddr(ctx.event.data.actor)} acumulando posición relevante`
  };
}

/** 2. Swap moves > 5% of pool liquidity. Requires liquidity context (else null). */
function ruleLiquidityShock(ctx) {
  if (!ctx.amountUsd || !ctx.liquidityUsd) return null;
  if (ctx.amountUsd < CONFIG.liquidityShockMinUsd) return null;
  const pct = ctx.amountUsd / ctx.liquidityUsd;
  if (pct < CONFIG.liquidityShockPct) return null;
  const pctStr = (pct * 100).toFixed(1);
  return {
    delta: { momentum: 25, risk: -10 },
    signal: "liquidity_shock",
    insight: `Swap representa ${pctStr}% de la liquidez de la pool`
  };
}

/** 3. ≥ N distinct wallets buying same asset in short window. */
function ruleClusterBuy(ctx) {
  const stats = ctx.assetStats;
  if (!stats) return null;
  if (stats.uniqueWalletsInWindow < CONFIG.clusterMinWallets) return null;
  if (!isBuyish(ctx.event)) return null;
  return {
    delta: { smart: 30, momentum: 20 },
    signal: "cluster_buy",
    insight: `Cluster de ${stats.uniqueWalletsInWindow} wallets acumulando en ventana corta`
  };
}

/** 4. Brand-new wallet putting in significant size. Risk++ */
function ruleNewWalletConfidence(ctx) {
  if (ctx.walletAgeMs == null) return null;
  if (ctx.walletAgeMs > CONFIG.newWalletMaxAgeMs) return null;
  if (!(ctx.amountUsd >= CONFIG.newWalletMinUsd)) return null;
  return {
    delta: { risk: 35 },
    signal: "new_wallet_confidence",
    insight: `Wallet nueva (<24h) tomando posición grande`
  };
}

/** 5. Tx/min currently > Nx baseline over the last 30 min. */
function ruleVelocitySpike(ctx) {
  const stats = ctx.assetStats;
  if (!stats) return null;
  if (stats.baselinePerMin < CONFIG.velocityMinBaseline) return null;
  const ratio = stats.txLastMin / stats.baselinePerMin;
  if (!Number.isFinite(ratio) || ratio < CONFIG.velocityMultiplier) return null;
  return {
    delta: { momentum: 30 },
    signal: "velocity_spike",
    insight: `Velocidad de transacciones ${ratio.toFixed(1)}× por encima de la media reciente`
  };
}

const RULES = [
  ruleWhaleAccumulation,
  ruleLiquidityShock,
  ruleClusterBuy,
  ruleNewWalletConfidence,
  ruleVelocitySpike
];

/* ────────────────────────────────────────────────────────────────────────── */
/* Confidence                                                                 */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * confidence = (rules×15) + (uniqueWallets×5) + recentActivityBoost − (contradictions×20)
 * Clamped 0..100. Contradictions = signals that move dimensions in opposite directions
 * (currently: risk++ AND smart++ on the same event ⇒ +1 contradiction).
 */
function computeConfidence({ rulesTriggered, uniqueWallets, recentActivityBoost, contradictions }) {
  const raw =
    rulesTriggered * 15 +
    uniqueWallets * 5 +
    recentActivityBoost -
    contradictions * 20;
  return clamp(Math.round(raw), 0, 100);
}

function confidenceLabel(c) {
  if (c >= 70) return "High";
  if (c >= 40) return "Medium";
  return "Low";
}

function shortAddr(a) {
  if (!a || typeof a !== "string") return "wallet";
  return a.length > 8 ? `${a.slice(0, 4)}…${a.slice(-3)}` : a;
}

function applyDeltas(scores, delta) {
  if (!delta) return;
  if (Number.isFinite(delta.risk)) scores.risk += delta.risk;
  if (Number.isFinite(delta.smart)) scores.smart += delta.smart;
  if (Number.isFinite(delta.momentum)) scores.momentum += delta.momentum;
}

function detectContradictions(results) {
  let n = 0;
  let sumRisk = 0;
  let sumSmart = 0;
  for (const r of results) {
    if (r.delta.risk) sumRisk += r.delta.risk;
    if (r.delta.smart) sumSmart += r.delta.smart;
  }
  if (sumRisk > 0 && sumSmart > 0) n += 1;
  return n;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Orchestrator                                                               */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Evaluate one SentinelEvent. Caller may pass `ctx.liquidityUsd` and `ctx.amountUsd`
 * pre-computed (from marketData / dex quotes). If absent, the corresponding rules
 * gracefully skip rather than mis-fire.
 *
 * Side-effects:
 *  - Records event into per-asset rolling window (state.recordAssetEvent).
 *  - Caches the resulting score under `scoring:latest:{asset}` in Redis.
 *
 * @param {import("../ingestion/sentinelEvent").SentinelEvent} event
 * @param {{ amountUsd?: number, liquidityUsd?: number }} [extraCtx]
 * @returns {Promise<ScoringResult>}
 */
async function evaluate(event, extraCtx = {}) {
  if (!event || !event.data || !event.data.asset) {
    return null;
  }

  // Record before stats so the current event participates in the window.
  recordAssetEvent(event);

  const [eliteFlag, walletAge] = await Promise.all([
    safeIsElite(event.data.actor),
    touchWalletFirstSeen(event.data.actor, event.timestamp)
  ]);

  const assetStats = getAssetStats(event.data.asset, {
    nowMs: event.timestamp || Date.now(),
    clusterWindowMs: CONFIG.clusterWindowMs
  });

  const amountUsd = Number.isFinite(extraCtx.amountUsd)
    ? Number(extraCtx.amountUsd)
    : inferAmountUsd(event);

  const ctx = {
    event,
    isElite: Boolean(eliteFlag),
    walletAgeMs: walletAge.ageMs,
    walletFirstSighting: walletAge.isFirstSighting,
    assetStats,
    amountUsd,
    liquidityUsd: Number.isFinite(extraCtx.liquidityUsd) ? Number(extraCtx.liquidityUsd) : null
  };

  const fired = [];
  for (const rule of RULES) {
    let r = null;
    try {
      r = rule(ctx);
    } catch (_) {
      r = null;
    }
    if (r && r.signal && r.delta) fired.push(r);
  }

  const scores = { ...SCORE_BASELINE };
  for (const r of fired) applyDeltas(scores, r.delta);
  scores.risk = clamp(Math.round(scores.risk), 0, 100);
  scores.smart = clamp(Math.round(scores.smart), 0, 100);
  scores.momentum = clamp(Math.round(scores.momentum), 0, 100);

  const recentActivityBoost = Math.min(
    25,
    Math.round(Math.log10(1 + (assetStats.eventsInWindow || 0)) * 12)
  );
  const confidence = computeConfidence({
    rulesTriggered: fired.length,
    uniqueWallets: assetStats.uniqueWalletsInWindow,
    recentActivityBoost,
    contradictions: detectContradictions(fired)
  });

  const result = {
    asset: event.data.asset,
    network: event.network,
    // Server-side evaluation time. Clients use it to compute score age
    // independent of socket delivery latency or client clock skew. Stamped
    // here so the cached payload (read via GET /api/v1/scoring/latest/:asset)
    // is byte-identical to what we emit over the socket.
    timestamp: new Date().toISOString(),
    scores,
    signals: fired.map((r) => r.signal),
    insights: fired.map((r) => r.insight),
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    meta: {
      lastEventId: event.id,
      lastEventAt: event.timestamp,
      uniqueWalletsInWindow: assetStats.uniqueWalletsInWindow,
      txLastMin: assetStats.txLastMin,
      baselinePerMin: Number(assetStats.baselinePerMin.toFixed(2)),
      liquidityProvided: ctx.liquidityUsd != null,
      amountUsdProvided: ctx.amountUsd != null
    }
  };

  // Cryptographic signature (Ed25519). Signs only the stable subset of the
  // result, not `meta`; the canonical form lives in lib/scoreSigner.js and is
  // byte-identical across every consumer. Failure here is unrecoverable —
  // we MUST ship signed scores or nothing — so we let the error propagate.
  const signedResult = signScoreResult(result);

  // Best-effort cache; never blocks emission. Socket payload and cache entry
  // are byte-identical so the verifier produces the same result regardless
  // of how the client obtained the score.
  cache
    .set(`scoring:latest:${event.data.asset}`, JSON.stringify(signedResult), {
      ex: CONFIG.cacheTtlSec
    })
    .catch(() => {});

  return signedResult;
}

async function safeIsElite(wallet) {
  try {
    return await isSmartWallet(wallet);
  } catch (_) {
    return false;
  }
}

/** USD inference — uses `quoteAmount` when the source provides it; otherwise null. */
function inferAmountUsd(event) {
  const q = Number(event?.data?.quoteAmount);
  return Number.isFinite(q) && q > 0 ? q : null;
}

module.exports = {
  evaluate,
  // Exposed for unit tests; not used at runtime.
  _rules: {
    ruleWhaleAccumulation,
    ruleLiquidityShock,
    ruleClusterBuy,
    ruleNewWalletConfidence,
    ruleVelocitySpike
  },
  _computeConfidence: computeConfidence,
  _confidenceLabel: confidenceLabel,
  _CONFIG: CONFIG
};
