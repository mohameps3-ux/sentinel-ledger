"use strict";

/**
 * System mint denylist — single source of truth for "non-token" mints we never
 * want to score, validate or auto-discover wallets against.
 *
 * Rationale:
 *  - SentinelEvents on quote-side mints (WSOL, USDC, USDT) are systemic noise:
 *    they pollute `signal_outcomes`, distort `rule_performance`, and inflate
 *    deduplication windows.
 *  - This module is intentionally additive and side-effect free: callers decide
 *    when to apply it (scoring engine, validation oracle, auto-discovery).
 *
 * Constraints:
 *  - 0 new infra. Pure constants + helpers.
 *  - Override-able via `SENTINEL_SYSTEM_MINT_DENYLIST` (comma-separated mints)
 *    so we can iterate without redeploying.
 */

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const JITO_SOL_MINT = "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn";
const M_SOL_MINT = "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So";
const B_SOL_MINT = "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1";
const J_USDC_MINT = "FdmKUE4UMiJYFK5ogCngHzShuwKKCC4tQiMBjMTCkmWY";
const PYUSD_MINT = "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo";
const USDS_MINT = "USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA";
const BONK_MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

const BASE_DENYLIST = [
  SOL_MINT,
  USDC_MINT,
  USDT_MINT,
  JITO_SOL_MINT,
  M_SOL_MINT,
  B_SOL_MINT,
  J_USDC_MINT,
  PYUSD_MINT,
  USDS_MINT,
  BONK_MINT
];

function parseEnvDenylist(raw) {
  if (typeof raw !== "string" || !raw.trim()) return [];
  return raw
    .split(",")
    .map((s) => String(s || "").trim())
    .filter((s) => s.length >= 32 && s.length <= 44);
}

const ENV_EXTRA = parseEnvDenylist(process.env.SENTINEL_SYSTEM_MINT_DENYLIST);
const DENYLIST = new Set([...BASE_DENYLIST, ...ENV_EXTRA]);

/** True when a mint should never be treated as a target asset. */
function isSystemMint(mint) {
  if (typeof mint !== "string") return false;
  const m = mint.trim();
  if (!m) return false;
  return DENYLIST.has(m);
}

/** Snapshot for diagnostics / ops endpoints. */
function listSystemMints() {
  return Array.from(DENYLIST.values());
}

module.exports = {
  SOL_MINT,
  USDC_MINT,
  USDT_MINT,
  JITO_SOL_MINT,
  M_SOL_MINT,
  B_SOL_MINT,
  J_USDC_MINT,
  PYUSD_MINT,
  USDS_MINT,
  BONK_MINT,
  isSystemMint,
  listSystemMints
};
