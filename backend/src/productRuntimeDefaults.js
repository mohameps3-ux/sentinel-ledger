"use strict";

/**
 * Product-safe runtime defaults.
 *
 * This file is preloaded before server.js in production startup. It keeps the
 * trader-facing product alive without deleting the stricter research/ops gates.
 * Set SENTINEL_GATE_PROFILE=strict to opt out and let explicit env vars win.
 */

const profile = String(process.env.SENTINEL_GATE_PROFILE || "product").trim().toLowerCase();

if (profile !== "strict") {
  // Keep the live feed breathing for Solana micro-cap discovery. Hard risk
  // filters still remain in signalEmissionGate; this only replaces overly
  // conservative defaults that caused zero-emission windows.
  process.env.SIGNAL_GATE_MIN_LIQUIDITY_USD = "5000";
  process.env.SIGNAL_EMISSION_MINT_COOLDOWN_MIN = "3";
  process.env.GATE_BLOCK_R03_CALM = "false";
  process.env.GATE_FILTER_WALLET_QUALITY = "false";
  process.env.RULE_NEWWALLET_ENABLED = "false";

  // HOT / VELOCITY are discovery surfaces, not verified trade calls. Keep them
  // populated for real users while still requiring provider-backed market data.
  process.env.TRENDING_STRICT_MIN_LIQUIDITY_USD = "2000";
  process.env.TRENDING_STRICT_MIN_VOLUME_24H_USD = "1000";
  process.env.TRENDING_RELAXED_MIN_LIQUIDITY_USD = "250";
  process.env.TRENDING_RELAXED_MIN_VOLUME_24H_USD = "100";
  process.env.TRENDING_STRICT_POOL_ONLY = "false";
}

module.exports = { profile };
