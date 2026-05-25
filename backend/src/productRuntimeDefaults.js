"use strict";

const profile = String(process.env.SENTINEL_GATE_PROFILE || "product").trim().toLowerCase();

if (profile !== "strict") {
  process.env.SIGNAL_GATE_MIN_LIQUIDITY_USD = "5000";
  process.env.SIGNAL_EMISSION_MINT_COOLDOWN_MIN = "3";
  process.env.GATE_BLOCK_R03_CALM = "false";
  process.env.GATE_MIN_SIGNALS = "1";
  process.env.GATE_FILTER_WALLET_QUALITY = "false";
  process.env.RULE_NEWWALLET_ENABLED = "false";
  process.env.SIGNAL_GATE_ADAPTIVE_ENABLED = "true";
  process.env.SIGNAL_GATE_ADAPTIVE_REGIME_AWARE = "true";

  process.env.TRENDING_STRICT_MIN_LIQUIDITY_USD = "2000";
  process.env.TRENDING_STRICT_MIN_VOLUME_24H_USD = "1000";
  process.env.TRENDING_RELAXED_MIN_LIQUIDITY_USD = "250";
  process.env.TRENDING_RELAXED_MIN_VOLUME_24H_USD = "100";
  process.env.TRENDING_STRICT_POOL_ONLY = "false";

  process.env.WALLET_BEHAVIOR_TICK_MS = "900000";
  process.env.WALLET_BEHAVIOR_MAX_WALLETS = "1000";
}

module.exports = { profile };
