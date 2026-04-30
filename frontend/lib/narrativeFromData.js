// Generates intent-based narrative from token data when
// no live sentinel:narrative is available from the socket.

export function narrativeFromData(token) {
  const score = token._currentScore ?? token.sentinelScore ?? 0;
  const wallets = token.smartMoneyCount ?? token.smartWallets ?? 0;
  const change = token.priceChange24h ?? token.change24h ?? 0;
  const liq = token.liquidityUsd ?? token.liquidity ?? 0;
  const age = token.poolAgeMinutes ?? null;
  const source = token._liveSource ?? token._source ?? "";
  const action = token.decision ?? token.action ?? "WATCH";
  const symbol = token.symbol ?? token.name ?? "";

  if (wallets >= 5)
    return `${wallets} smart wallets accumulated — breakout pattern detected`;
  if (wallets >= 3)
    return `${wallets} high-win rate wallets entered within tight window`;
  if (wallets >= 2) return `Smart money slowly accumulating at key support`;
  if (wallets >= 1 && score >= 80) return `Smart money + high score — convergence signal`;
  if (wallets >= 1 && change > 20) return `Whale follows price action — accumulation confirmed`;

  if (age !== null && age < 5 && score >= 70) return `New token — early liquidity forming, high risk`;
  if (age !== null && age < 15 && score >= 75)
    return `New pool (${Math.round(age)}m) — early accumulation window`;
  if (age !== null && age < 60 && score >= 80)
    return `Early entry detected — ${Math.round(age)}m old, low float`;

  if (change >= 100 && liq > 200_000)
    return `+${Math.round(change)}% with locked liquidity — momentum building`;
  if (change >= 50 && liq > 100_000)
    return `Breakout pattern + low float + dev not sold`;
  if (change >= 30 && score >= 75)
    return `Strong momentum — +${Math.round(change)}% with solid base`;
  if (change >= 20 && score >= 70) return `Volume increasing + social buzz growing`;
  if (change < -20 && score >= 70) return `Deep pullback — smart money support holding`;

  if (score >= 95) {
    const v = [
      `Smart money cluster detected — early accumulation phase`,
      `Whales entering before breakout — momentum building`,
      `High conviction wallets stacking quietly`,
      `All systems firing — maximum conviction setup`,
      `Aggressive entries detected — breakout imminent`
    ];
    const hash = (symbol.charCodeAt(0) ?? 0) + (symbol.charCodeAt(1) ?? 0) + score;
    return v[hash % v.length];
  }
  if (score >= 90) {
    const v = [
      `Liquidity forming under resistance — breakout setup`,
      `High conviction setup — low float detected`,
      `Whale accumulation + volume spike confirmed`,
      `Low cap momentum — smart money entry window`,
      `Breakout pattern + dev not sold — bullish structure`,
      `Strong hands holding — distribution unlikely`
    ];
    const hash = (symbol.charCodeAt(0) ?? 0) * 3 + (symbol.charCodeAt(2) ?? 1) + Math.floor(score);
    return v[hash % v.length];
  }
  if (score >= 80) {
    const v = [
      `Steady accumulation — wait for volume confirmation`,
      `Smart money slowly building position`,
      `Support holding — watching for breakout trigger`,
      `Volume increasing + social buzz growing`
    ];
    const hash = (symbol.charCodeAt(0) ?? 0) + (symbol.length ?? 1);
    return v[hash % v.length];
  }
  if (score >= 70) return `Steady accumulation — wait for confirmation`;

  if (source === "hot_fill" && change >= 30)
    return `Market heat — +${Math.round(change)}% unusual activity`;
  if (source === "hot_fill") return `Trending — elevated volume, low smart money`;

  if (action === "BUY" || action === "ENTER NOW") return `Entry conditions confirmed — risk managed`;
  if (action === "SCALP") return `Scalp setup — fast entry, tight stop`;
  if (action === "WATCH") return `Watching for confirmation — not yet`;

  return `Active signal — score ${score}`;
}
