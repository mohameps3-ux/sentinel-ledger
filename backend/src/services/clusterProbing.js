"use strict";

const { createHash } = require("crypto");
const WINDOW_MS = 120_000;
const MIN_WALLETS = 3;
/** Min relative price difference across observed fills to flag skew (e.g. 0.015 = 1.5%). */
const MIN_PRICE_SKEW = Number(process.env.CLUSTER_PROBE_MIN_PRICE_SKEW || 0.015);
/** Max skew — above this, treat as late/chasing entry (e.g. 0.025 = 2.5%). */
const MAX_PRICE_SKEW = Number(process.env.CLUSTER_PROBE_MAX_PRICE_SKEW || 0.025);

const probesByMint = new Map();

function clusterHash(wallets) {
  const sig = [...wallets].sort().join("|");
  return createHash("sha1").update(sig).digest("hex").slice(0, 32);
}

function prune(mint, now) {
  const rows = probesByMint.get(mint) || [];
  const kept = rows.filter((r) => now - r.ts <= WINDOW_MS);
  probesByMint.set(mint, kept);
  return kept;
}

/**
 * @param {string} mint
 * @param {string} wallet
 * @param {number|null} priceUsd
 * @returns {Promise<object|null>}
 */
async function evaluateIntent(mint, wallet, priceUsd) {
  const m = String(mint || "").trim();
  const w = String(wallet || "").trim();
  if (!m || !w) return null;

  const now = Date.now();
  const price = Number(priceUsd);
  const row = {
    wallet: w,
    price: Number.isFinite(price) && price > 0 ? price : null,
    ts: now
  };

  const prev = probesByMint.get(m) || [];
  prev.push(row);
  probesByMint.set(m, prev);

  const windowRows = prune(m, now);
  const wallets = [...new Set(windowRows.map((r) => r.wallet))].filter(Boolean);
  if (wallets.length < MIN_WALLETS) {
    return { action: "observe", mint: m, wallets, reason: "insufficient_wallets" };
  }

  const withPrice = windowRows.filter((r) => r.price != null && r.price > 0);
  if (withPrice.length < 2) {
    return { action: "observe", mint: m, wallets, reason: "insufficient_prices" };
  }
  const prices = withPrice.map((r) => r.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const mid = (minP + maxP) / 2;
  const priceSkew = mid > 0 ? (maxP - minP) / mid : 0;

  if (priceSkew < MIN_PRICE_SKEW) {
    return { action: "observe", mint: m, wallets, priceSkew, reason: "low_skew" };
  }

  if (priceSkew > MAX_PRICE_SKEW) {
    return { action: "observe", mint: m, wallets, priceSkew, reason: "skew_too_high" };
  }

  const sorted = [...wallets].sort();
  const clusterSig = clusterHash(sorted);
  const confidence = Math.min(95, 55 + Math.round(priceSkew * 800));

  return {
    action: "CLUSTER_ACTIVATION",
    mint: m,
    confidence,
    wallets: sorted,
    priceSkew,
    clusterSig,
    reason: "multi_wallet_price_skew"
  };
}

function getActiveProbes() {
  const now = Date.now();
  let totalRows = 0;
  for (const [mint, rows] of probesByMint.entries()) {
    const kept = rows.filter((r) => now - r.ts <= WINDOW_MS);
    probesByMint.set(mint, kept);
    totalRows += kept.length;
  }
  return {
    mintsTracked: probesByMint.size,
    probeRows: totalRows,
    windowMs: WINDOW_MS
  };
}

module.exports = { evaluateIntent, getActiveProbes, clusterHash };
