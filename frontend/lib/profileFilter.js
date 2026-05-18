/** Score used by profile filters (OUTLIER enrich sets _currentScore; LIVE uses sentinelScore). */
export function profileScore(t) {
  const n = Number(t?._currentScore ?? t?.sentinelScore ?? t?.signalStrength ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Opportunity-focus profile: sniper / liquidity / momentum.
 * @param {Array} result
 * @param {"balanced"|"sniper"|"liquidity"|"momentum"} profile
 */
export function applyProfileFilter(result, profile, _isWarMode) {
  if (profile === "sniper") {
    return result.filter((t) => profileScore(t) >= 70 || (t.smartMoneyCount ?? 0) > 0);
  }
  if (profile === "liquidity") {
    return result
      .filter((t) => (t.liquidityUsd ?? 0) > 50_000)
      .sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0));
  }
  if (profile === "momentum") {
    return [...result].sort((a, b) => (b.priceChange24h ?? 0) - (a.priceChange24h ?? 0));
  }
  return result;
}
