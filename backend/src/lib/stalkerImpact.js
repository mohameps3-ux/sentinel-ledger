/**
 * Wallet Stalker — F0/F1 (Sentinel Ledger)
 *
 * F0: canonical shape of `enrichment` on socket `wallet-stalk` (documented also in heliusWebhook.js).
 * F1: pool impact from Dex memo — build ONLY via exports below; thresholds live here alone.
 *
 * Contract: `wallet-stalk` payload may include `enrichment` built ONLY here.
 * Frontend must not recompute impactPoolPct / impactLevel (single source of truth).
 *
 * F4 Double Down: baseline updates consider only net BUY / position-increase
 * legs (`type === 'buy'` or agreed swap semantics). Ignore sells, partial exits, and
 * rebalance noise to avoid false DOUBLE_DOWN.
 *
 * @typedef {Object} StalkerEnrichment
 * @property {number|null} amountUsd
 * @property {number|null} liquidityUsd
 * @property {number|null} impactPoolPct  — share of pool liquidity absorbed (est.), capped for safety
 * @property {'LIGHT'|'STANDARD'|'AGGRESSIVE'|'UNKNOWN'} impactLevel
 * @property {'dex_memo'|'none'} marketSource
 * @property {'DOUBLE_DOWN'|undefined} [conviction]  — F4, server-only, when 017 applied
 * @property {number|undefined} [convictionMultiplier]  — current/ first notional (≥3)
 */

"use strict";

/** Max stored % to avoid absurd payloads / client DoS on malformed upstream data. */
const IMPACT_POOL_PCT_CAP = 1_000_000;

const UNKNOWN_ENRICHMENT = Object.freeze({
  amountUsd: null,
  liquidityUsd: null,
  impactPoolPct: null,
  impactLevel: "UNKNOWN",
  marketSource: "none"
});

/**
 * @param {number|null|undefined} pct
 * @returns {'LIGHT'|'STANDARD'|'AGGRESSIVE'|'UNKNOWN'}
 */
function calculateImpactLevelFromPoolPct(pct) {
  if (pct == null || typeof pct !== "number" || !Number.isFinite(pct) || pct < 0) return "UNKNOWN";
  if (pct < 1) return "LIGHT";
  if (pct <= 3) return "STANDARD";
  return "AGGRESSIVE";
}

/**
 * Pure builder from normalized numbers (after caller reads Dex memo).
 * @param {{ tokenAmount: number, priceUsd: number|null, liquidityUsd: number|null }} input
 * @returns {StalkerEnrichment}
 */
function buildStalkerEnrichmentFromMarket(input) {
  const amt = Number(input?.tokenAmount);
  const price = input?.priceUsd != null ? Number(input.priceUsd) : NaN;
  const liqRaw = input?.liquidityUsd != null ? Number(input.liquidityUsd) : NaN;

  const hasAmt = Number.isFinite(amt) && amt > 0;
  const hasPrice = Number.isFinite(price) && price > 0;
  const liquidityUsd = Number.isFinite(liqRaw) && liqRaw > 0 ? liqRaw : null;

  const amountUsd = hasAmt && hasPrice ? Math.round(amt * price * 100) / 100 : null;

  let impactPoolPct = null;
  if (amountUsd != null && liquidityUsd != null && liquidityUsd > 0) {
    const raw = (amountUsd / liquidityUsd) * 100;
    if (Number.isFinite(raw)) {
      impactPoolPct = raw > IMPACT_POOL_PCT_CAP ? null : Math.round(raw * 1000) / 1000;
    }
  }

  const impactLevel = calculateImpactLevelFromPoolPct(impactPoolPct);
  const marketSource = hasPrice ? "dex_memo" : "none";

  return {
    amountUsd,
    liquidityUsd,
    impactPoolPct,
    impactLevel,
    marketSource
  };
}

/** Use when getMarketData throws or times out — never blocks stalk emit. */
function buildStalkerEnrichmentFallback() {
  return { ...UNKNOWN_ENRICHMENT };
}

module.exports = {
  IMPACT_POOL_PCT_CAP,
  UNKNOWN_ENRICHMENT,
  calculateImpactLevelFromPoolPct,
  buildStalkerEnrichmentFromMarket,
  buildStalkerEnrichmentFallback
};
