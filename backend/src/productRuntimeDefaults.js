"use strict";

const profile = String(process.env.SENTINEL_GATE_PROFILE || "product").trim().toLowerCase();

if (profile !== "strict") {
  process.env.SIGNAL_GATE_MIN_LIQUIDITY_USD = "5000";
  process.env.SIGNAL_EMISSION_MINT_COOLDOWN_MIN = "3";
  process.env.GATE_MIN_SIGNALS = "1";
  process.env.GATE_FILTER_WALLET_QUALITY = "false";
  process.env.RULE_NEWWALLET_ENABLED = "false";
  process.env.SIGNAL_GATE_ADAPTIVE_ENABLED = "true";
  process.env.SIGNAL_GATE_ADAPTIVE_REGIME_AWARE = "true";
  process.env.SIGNAL_GATE_REGIME_ENABLED = "true";

  // ─── Phase 1: Regime gate surgery (May 2026) ────────────────────────────
  //
  // Data (998 resolved signals):
  //   calm     WR  4.72%  PF 0.31  → do NOT emit here
  //   volatile WR 31.00%  PF 0.77  → the only regime with edge — unlock it
  //   trending WR 15.32%  PF 0.39  → keep current thresholds, monitor
  //
  // Root cause: defaultRegimePatch added +7 conf to volatile (backwards).
  // Env overrides win over code defaults — no gate-logic edits needed.

  // Block calm entirely. confidence is capped at 100, so 101 never passes.
  process.env.SIGNAL_GATE_REGIME_CALM_MIN_CONFIDENCE = "101";
  // Belt-and-suspenders: also block R03 (cluster_buy) in calm explicitly.
  process.env.GATE_BLOCK_R03_CALM = "true";

  // Unlock volatile: lower every threshold below the base so R03+volatile passes.
  // Base values: minConf=25, minUnified=0.25, minLiq=5000.
  process.env.SIGNAL_GATE_REGIME_VOLATILE_MIN_CONFIDENCE = "20";
  process.env.SIGNAL_GATE_REGIME_VOLATILE_MIN_UNIFIED_SCORE = "0.18";
  process.env.SIGNAL_GATE_REGIME_VOLATILE_MIN_LIQUIDITY_USD = "3000";

  // Kill R05 velocity_spike: WR 11.2%, AVG -0.6% (already off per engineer).
  process.env.VELOCITY_SPIKE_ENABLED = "false";
  // Kill R02 liquidity_shock: WR 17.8%, AVG -1.5% — net negative, stop emitting.
  process.env.RULE_LIQUIDITYSHOCK_ENABLED = "false";

  // ─── Trending feed thresholds ────────────────────────────────────────────
  process.env.TRENDING_STRICT_MIN_LIQUIDITY_USD = "2000";
  process.env.TRENDING_STRICT_MIN_VOLUME_24H_USD = "1000";
  process.env.TRENDING_RELAXED_MIN_LIQUIDITY_USD = "250";
  process.env.TRENDING_RELAXED_MIN_VOLUME_24H_USD = "100";
  process.env.TRENDING_STRICT_POOL_ONLY = "false";

  process.env.WALLET_BEHAVIOR_TICK_MS = "900000";
  process.env.WALLET_BEHAVIOR_MAX_WALLETS = "1000";
}

module.exports = { profile };
