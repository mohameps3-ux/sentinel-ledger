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
  // Phase 4: enforce 48h cooldown even on tighten (default bypasses it).
  // Prevents the tuner from re-tightening every cron cycle based on
  // contaminated pre-Phase-1 calm data while volatile signals accumulate.
  process.env.SIGNAL_GATE_ADAPTIVE_COOLDOWN_BYPASS_ON_TIGHTEN = "false";

  // Phase 4b: WR floor — do not tighten any bucket with WR ≥ 20%.
  // After excluding calm+trending, volatile (WR 33%) is the only bucket.
  // Tightening volatile undoes Phase 1. Floor set to 20% so the tuner
  // only acts when things are genuinely bad.
  process.env.SIGNAL_GATE_ADAPTIVE_TIGHTEN_FLOOR_WR = "20";

  // ─── Phase 2: Outcome resolution horizon (May 2026) ────────────────────
  // Top wallets peak WR at 30m (Fuz4rV: 63.6%), not at 10m (18.2%).
  // Evaluating at 10m marks winners as losses → corrupts calibrator learning.
  // Only affects new signals; existing rows keep their stored resolve_after.
  process.env.SIGNAL_PERF_HORIZON_MIN = "30";

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
  // Reduced from 1000 → 100. With 1000, each tick took ~10min and often hung,
  // leaving "Last tick: —" in OPS. 100 completes in seconds and still covers
  // the most active wallets (prioritized by recent signal activity).
  process.env.WALLET_BEHAVIOR_MAX_WALLETS = "100";
}

module.exports = { profile };
