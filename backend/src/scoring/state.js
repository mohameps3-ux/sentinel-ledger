"use strict";

/**
 * Per-asset activity tracker (process-local, in-memory) + per-wallet first-seen
 * tracker (Redis with in-memory fallback via lib/cache).
 *
 * Used by the scoring engine to evaluate the 5 Golden Rules without adding any
 * new DB tables. Trackers are intentionally minimal: they only store what the
 * rules need (velocity, unique wallets in a window, wallet age).
 */

const cache = require("../lib/cache");

const FIRST_SEEN_PREFIX = "sentinel:firstseen:";
const FIRST_SEEN_TTL_SEC = 7 * 24 * 60 * 60; // 7 days — enough to evaluate "<24h old".
const HISTORY_WINDOW_MS = 30 * 60 * 1000; // 30 min rolling window per asset.
const MAX_EVENTS_PER_ASSET = 1500; // hard cap to bound memory.

// asset -> { events: [{tsMs, wallet, type, amount, quoteAmount}], lastTrim }
const assetHistory = new Map();

function trim(asset, nowMs) {
  const bucket = assetHistory.get(asset);
  if (!bucket) return;
  const cutoff = nowMs - HISTORY_WINDOW_MS;
  let i = 0;
  while (i < bucket.events.length && bucket.events[i].tsMs < cutoff) i += 1;
  if (i > 0) bucket.events.splice(0, i);
  if (bucket.events.length > MAX_EVENTS_PER_ASSET) {
    bucket.events.splice(0, bucket.events.length - MAX_EVENTS_PER_ASSET);
  }
  bucket.lastTrim = nowMs;
}

/**
 * Record a normalized SentinelEvent into the per-asset rolling window.
 * Caller passes the SentinelEvent directly; we only keep what rules need.
 */
function recordAssetEvent(event) {
  if (!event || !event.data || !event.data.asset) return;
  const asset = event.data.asset;
  const tsMs = Number(event.timestamp) || Date.now();
  let bucket = assetHistory.get(asset);
  if (!bucket) {
    bucket = { events: [], lastTrim: tsMs };
    assetHistory.set(asset, bucket);
  }
  bucket.events.push({
    tsMs,
    wallet: event.data.actor,
    type: event.type,
    direction:
      Array.isArray(event.metadata?.labels) && event.metadata.labels.includes("buy")
        ? "buy"
        : Array.isArray(event.metadata?.labels) && event.metadata.labels.includes("sell")
          ? "sell"
          : "swap",
    amount: event.data.amount,
    quoteAmount: event.data.quoteAmount || null
  });
  if (tsMs - bucket.lastTrim > 5_000) trim(asset, tsMs);
}

/**
 * Stats used by `rule_velocity_spike` and `rule_cluster_buy`.
 *  - txLastMin:        events in the last 60s
 *  - baselinePerMin:   events/min averaged over [now-30min, now-1min]
 *  - uniqueWalletsInWindowMs: distinct wallets in last `clusterWindowMs`
 *  - eventsInWindow:   raw count in the same window
 */
function getAssetStats(asset, opts = {}) {
  const nowMs = opts.nowMs || Date.now();
  const clusterWindowMs = Number(opts.clusterWindowMs) || 40_000;
  const bucket = assetHistory.get(asset);
  if (!bucket || !bucket.events.length) {
    return {
      txLastMin: 0,
      baselinePerMin: 0,
      uniqueWalletsInWindow: 0,
      eventsInWindow: 0,
      buyersInWindow: []
    };
  }
  trim(asset, nowMs);

  const minuteCutoff = nowMs - 60_000;
  const baselineFrom = nowMs - HISTORY_WINDOW_MS;
  const baselineTo = nowMs - 60_000;
  const clusterCutoff = nowMs - clusterWindowMs;

  let txLastMin = 0;
  let baselineCount = 0;
  let eventsInWindow = 0;
  const buyers = new Set();

  for (const e of bucket.events) {
    if (e.tsMs >= minuteCutoff) txLastMin += 1;
    if (e.tsMs >= baselineFrom && e.tsMs < baselineTo) baselineCount += 1;
    if (e.tsMs >= clusterCutoff) {
      eventsInWindow += 1;
      if (e.wallet && (e.direction === "buy" || e.direction === "swap")) {
        buyers.add(e.wallet);
      }
    }
  }

  // baseline averaged over (HISTORY_WINDOW_MS - 60s) expressed in minutes
  const baselineMinutes = Math.max(1, (HISTORY_WINDOW_MS - 60_000) / 60_000);
  const baselinePerMin = baselineCount / baselineMinutes;

  return {
    txLastMin,
    baselinePerMin,
    uniqueWalletsInWindow: buyers.size,
    eventsInWindow,
    buyersInWindow: Array.from(buyers).slice(0, 12)
  };
}

/**
 * First-seen wallet tracker. Returns:
 *   { ageMs: number, isFirstSighting: boolean }
 *
 * - On first sighting we write `now` and return ageMs=0.
 * - On subsequent sightings we return the age based on the stored timestamp.
 * - On Redis failure we degrade to ageMs=null (rule must skip rather than mis-fire).
 */
async function touchWalletFirstSeen(wallet, nowMs) {
  if (!wallet) return { ageMs: null, isFirstSighting: false };
  const now = nowMs || Date.now();
  const key = FIRST_SEEN_PREFIX + wallet;
  try {
    const stored = await cache.get(key);
    if (stored != null) {
      const ts = Number(stored);
      if (Number.isFinite(ts) && ts > 0) {
        return { ageMs: Math.max(0, now - ts), isFirstSighting: false };
      }
    }
    await cache.set(key, String(now), { ex: FIRST_SEEN_TTL_SEC });
    return { ageMs: 0, isFirstSighting: true };
  } catch (_) {
    return { ageMs: null, isFirstSighting: false };
  }
}

function _resetScoringState() {
  assetHistory.clear();
}

module.exports = {
  recordAssetEvent,
  getAssetStats,
  touchWalletFirstSeen,
  _resetScoringState,
  FIRST_SEEN_PREFIX,
  HISTORY_WINDOW_MS
};
