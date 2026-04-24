/**
 * URLBuilder (Sentinel TERMINAL-V1 — T0)
 *
 * Single execution surface for external trading / intel links.
 * - Validates Solana addresses via @solana/web3.js PublicKey.
 * - Never interpolates raw user text into hosts; only fixed templates + validated segments.
 *
 * Jupiter amount query: only appended when `amountSol` is a finite number > 0 (lamports).
 * Tier-2 URL params (e.g. slippage) stay gated until explicitly verified against Jupiter docs.
 */

import { PublicKey } from "@solana/web3.js";

/** Use on every `<a target="_blank">` built for these URLs. */
export const EXTERNAL_ANCHOR_REL = "noopener noreferrer";

const JUPITER_ORIGIN = "https://jup.ag";
const DEXSCREENER_ORIGIN = "https://dexscreener.com";
const SOLSCAN_ORIGIN = "https://solscan.io";
const PUMP_FUN_ORIGIN = "https://pump.fun";
const METEORA_ORIGIN = "https://app.meteora.ag";

/**
 * @param {unknown} s
 * @returns {string|null}
 */
export function sanitizeAddressInput(s) {
  if (typeof s !== "string") return null;
  const t = s.trim().split(/[\s\n,;]+/)[0];
  if (!t) return null;
  return t;
}

/**
 * @param {unknown} address
 * @returns {boolean}
 */
export function isValidSolanaAddress(address) {
  const s = sanitizeAddressInput(String(address ?? ""));
  if (!s || s.length < 32 || s.length > 44) return false;
  try {
    new PublicKey(s);
    return true;
  } catch {
    return false;
  }
}

/**
 * Jupiter SOL → mint. Invalid mint returns "#" so callers can disable UI.
 * @param {string} mint
 * @param {number} [amountSol]
 * @returns {string}
 */
export function buildJupiterSwapUrl(mint, amountSol) {
  const m = sanitizeAddressInput(mint);
  if (!m || !isValidSolanaAddress(m)) return "#";
  const path = `${JUPITER_ORIGIN}/swap/SOL-${encodeURIComponent(m)}`;
  const n = Number(amountSol);
  if (Number.isFinite(n) && n > 0) {
    const amountLamports = Math.round(n * 1_000_000_000);
    return `${path}?amount=${amountLamports}`;
  }
  return path;
}

/**
 * @param {string} mint
 * @returns {string}
 */
export function buildDexscreenerSolanaTokenUrl(mint) {
  const m = sanitizeAddressInput(mint);
  if (!m || !isValidSolanaAddress(m)) return "#";
  return `${DEXSCREENER_ORIGIN}/solana/${encodeURIComponent(m)}`;
}

/**
 * @param {string} mint
 * @returns {string}
 */
export function buildSolscanTokenUrl(mint) {
  const m = sanitizeAddressInput(mint);
  if (!m || !isValidSolanaAddress(m)) return "#";
  return `${SOLSCAN_ORIGIN}/token/${encodeURIComponent(m)}`;
}

/**
 * @param {string} wallet
 * @returns {string}
 */
export function buildSolscanAccountUrl(wallet) {
  const w = sanitizeAddressInput(wallet);
  if (!w || !isValidSolanaAddress(w)) return "#";
  return `${SOLSCAN_ORIGIN}/account/${encodeURIComponent(w)}`;
}

/**
 * @param {string} signature
 * @returns {string}
 */
export function buildSolscanTxUrl(signature) {
  const s = typeof signature === "string" ? signature.trim() : "";
  if (!s || s.length < 64) return "#";
  return `${SOLSCAN_ORIGIN}/tx/${encodeURIComponent(s)}`;
}

/**
 * @param {string} mint
 * @returns {string}
 */
export function buildPumpFunTokenUrl(mint) {
  const m = sanitizeAddressInput(mint);
  if (!m || !isValidSolanaAddress(m)) return "#";
  return `${PUMP_FUN_ORIGIN}/${encodeURIComponent(m)}`;
}

/**
 * Only when backend resolved a concrete pool id (never a generic Meteora home link).
 * @param {string} poolId
 * @returns {string|null} null if pool id is unusable
 */
export function buildMeteoraPoolUrl(poolId) {
  const p = typeof poolId === "string" ? poolId.trim() : "";
  if (!p || p.length < 32 || p.length > 48) return null;
  return `${METEORA_ORIGIN}/pools/${encodeURIComponent(p)}`;
}
