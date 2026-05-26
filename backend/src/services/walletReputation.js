"use strict";

/**
 * Stable wallet reputation layer built on `wallet_behavior_stats`.
 *
 * Unlike `smart_wallets.smart_score` (overwritten by analyzeWallet / promotion /
 * Flipside snapshots), reputation here prefers the behavior memory table which
 * Sentinel already maintains (77k+ profile syncs in Ops = cumulative cron updates).
 *
 * Goal: keep proven winners visible, rank by observed outcomes, and give the
 * engine a single place to ask "is this wallet actually good?"
 */

const MIN_RESOLVED_FOR_REPUTATION = Math.max(
  1,
  Number(process.env.WALLET_REPUTATION_MIN_RESOLVED || 3)
);
const ELITE_WIN_RATE = Math.max(
  50,
  Number(process.env.WALLET_REPUTATION_ELITE_WIN_RATE || 55)
);
const ELITE_MIN_RESOLVED = Math.max(
  3,
  Number(process.env.WALLET_REPUTATION_ELITE_MIN_RESOLVED || 5)
);

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function sampleConfidence(resolved) {
  const r = Math.max(0, Math.floor(num(resolved)));
  // Saturates at 30 resolved signals — enough to trust the wallet.
  return Math.min(1, r / 30);
}

/**
 * Composite 0–100 reputation from behavior summary + optional smart_wallets row.
 * Behavior stats win when we have enough resolved outcomes.
 */
function computeReputationScore({ behavior = null, smartWallet = null } = {}) {
  const resolved = Math.floor(num(behavior?.resolved_signals));
  const wrReal = num(behavior?.win_rate_real);
  const conf = sampleConfidence(resolved);

  if (behavior && resolved >= MIN_RESOLVED_FOR_REPUTATION) {
    const ant = Math.min(1, Math.max(0, num(behavior.anticipatory_buy_ratio)));
    const grp = Math.min(1, Math.max(0, num(behavior.group_buy_ratio)));
    const styleBoost =
      behavior.style_label === "anticipatory_sniper"
        ? 4
        : behavior.style_label === "cluster_trader"
          ? 2
          : 0;
    const base = wrReal * 0.55 + conf * 100 * 0.25 + ant * 100 * 0.1 + grp * 100 * 0.1;
    return Math.min(100, Math.max(0, Math.round(base + styleBoost)));
  }

  const smartScore = num(smartWallet?.smart_score ?? smartWallet?.smartScore);
  if (smartScore > 0) return Math.min(100, Math.max(0, Math.round(smartScore)));

  const wr = num(smartWallet?.win_rate ?? smartWallet?.winRate);
  if (wr > 0) return Math.min(100, Math.max(0, Math.round(wr)));

  return 0;
}

/** Elite = enough resolved outcomes + strong observed win rate (behavior-first). */
function isEliteWallet({ behavior = null, smartWallet = null } = {}) {
  const resolved = Math.floor(num(behavior?.resolved_signals));
  if (behavior && resolved >= ELITE_MIN_RESOLVED) {
    return num(behavior.win_rate_real) >= ELITE_WIN_RATE;
  }
  return num(smartWallet?.win_rate ?? smartWallet?.winRate) >= 70;
}

/**
 * Leaderboard ranking score: reputation × inactivity decay.
 * Uses behavior `computed_at` as freshness anchor when present.
 */
function rankingScoreFromReputation({
  behavior = null,
  smartWallet = null,
  decayMultiplier = 1
} = {}) {
  const rep = computeReputationScore({ behavior, smartWallet });
  const decay = Number.isFinite(Number(decayMultiplier)) ? Number(decayMultiplier) : 1;
  return Number((rep * decay).toFixed(2));
}

/** Display win rate: prefer behavior observed win rate when sample exists. */
function displayWinRate({ behavior = null, smartWallet = null } = {}) {
  const resolved = Math.floor(num(behavior?.resolved_signals));
  if (behavior && resolved >= MIN_RESOLVED_FOR_REPUTATION) {
    return num(behavior.win_rate_real);
  }
  return num(smartWallet?.win_rate ?? smartWallet?.winRate);
}

module.exports = {
  MIN_RESOLVED_FOR_REPUTATION,
  ELITE_WIN_RATE,
  ELITE_MIN_RESOLVED,
  computeReputationScore,
  isEliteWallet,
  rankingScoreFromReputation,
  displayWinRate
};
