/**
 * Pure risk / anti-signal helpers for home feed cards and future calibrators.
 */

import { formatUsdWhole } from "../../lib/formatStable";

/**
 * @param {unknown} sig — home “signal” row (API envelope or synthetic).
 * @returns {string[]} Human-readable flag lines for UI chips.
 */
export function redFlagsForSignal(sig) {
  const api = sig?._api;
  if (Array.isArray(api?.redFlags) && api.redFlags.length) return api.redFlags;
  const signalStrength = Number(sig?.signalStrength || 0);
  const token = sig?.token || {};
  const out = [];
  if (Number(token?.liquidity || 0) < 50000) out.push("⚠️ Low liquidity");
  if (signalStrength < 72) out.push("⚠️ Cluster conviction low");
  if (Number(token?.change || 0) < 0) out.push("⚠️ Momentum fading");
  return out;
}

/**
 * Demo / narrative lines for the “system risk” strip (not on-chain truth).
 * @param {number} signalStrength
 * @param {object} [token]
 * @returns {string[]}
 */
export function redFlagsLines(signalStrength, token) {
  const liq = Number(token?.liquidity || 0);
  const liqLabel = liq < 50000 ? `$${formatUsdWhole(Math.max(8000, Math.round(liq)))}` : "$12k+";
  return [`Low liquidity ${liqLabel}`, "Dev holding 20%", "Honeypot risk YES"];
}

/**
 * Extensible “anti-rug” scan from *market snapshot* fields (no network).
 *
 * @param {string | null} mint
 * @param {{
 *   isMintSuspended?: boolean,
 *   liquidity?: number,
 *   topHoldersPercent?: number,
 *   topHolderPct?: number,
 *   ageMinutes?: number,
 *   ageMins?: number
 * }} [marketData]
 * @returns {{
 *   hasRisk: boolean,
 *   severity: 'NONE'|'WARNING'|'CRITICAL',
 *   signals: string[]
 * }}
 */
export function getRedFlagsForMint(mint, marketData = {}) {
  const flags = [];
  if (!mint || typeof mint !== "string") {
    return { hasRisk: false, severity: "NONE", signals: [] };
  }
  if (marketData.isMintSuspended) flags.push("MINT_SUSPENDED");
  const liq = Number(marketData.liquidity ?? 0);
  if (Number.isFinite(liq) && liq < 1000) flags.push("ILLIQUID_THRESHOLD");
  const topPct = Number(marketData.topHoldersPercent ?? marketData.topHolderPct ?? 0);
  if (Number.isFinite(topPct) && topPct > 50) flags.push("CENTRALIZED_RISK");
  const ageM = Number(marketData.ageMinutes ?? marketData.ageMins ?? NaN);
  if (Number.isFinite(ageM) && ageM < 10) flags.push("EXTREME_NEW_TOKEN");

  return {
    hasRisk: flags.length > 0,
    severity: flags.length > 2 ? "CRITICAL" : flags.length ? "WARNING" : "NONE",
    signals: flags
  };
}
