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
  process.env.GATE_BLOCK_R03_CALM = "false";
  process.env.GATE_FILTER_WALLET_QUALITY = "false";
  process.env.RULE_NEWWALLET_ENABLED = "false";
}

module.exports = { profile };
