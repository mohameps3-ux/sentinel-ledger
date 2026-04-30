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

  if (wallets >= 5) return `${wallets} smart wallets accumulating`;
  if (wallets >= 3) return `${wallets} top wallets entering quietly`;
  if (wallets >= 1 && score >= 80) return `Smart money + high score — convergence`;

  if (age !== null && age < 10 && score >= 70)
    return `New pool (${Math.round(age)}m) — early entry window`;
  if (age !== null && age < 30 && score >= 80)
    return `Early entry detected — ${Math.round(age)}m old pool`;

  if (change >= 50 && liq > 100_000) return `+${Math.round(change)}% pump with solid liquidity`;
  if (change >= 30 && score >= 75) return `Strong momentum — +${Math.round(change)}% 24h`;
  if (change >= 20 && wallets >= 1) return `Price action + smart money confirmed`;

  if (score >= 90) return `Max signal — all factors aligned`;
  if (score >= 80) return `High conviction — score ${score}`;
  if (score >= 70) return `Solid signal — active monitoring`;

  if (source === "hot_fill" && change >= 15) return `Market heat — unusual activity`;
  if (source === "hot_fill") return `Trending — elevated volume`;

  if (action === "BUY" || action === "ENTER NOW") return `Entry conditions confirmed`;
  if (action === "SCALP") return `Scalp opportunity — fast entry`;

  return `Active signal — score ${score}`;
}
