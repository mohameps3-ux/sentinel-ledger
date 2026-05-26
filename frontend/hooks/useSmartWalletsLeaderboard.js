import { useQuery } from "@tanstack/react-query";
import { getPublicApiUrl } from "../lib/publicRuntime";

async function fetchLeaderboard({ chain, minWinRate, minTrades, minPnl30d, limit }) {
  const u = new URL(`${getPublicApiUrl()}/api/v1/public/smart-wallets-leaderboard`);
  if (chain) u.searchParams.set("chain", chain);
  if (minWinRate > 0) u.searchParams.set("minWinRate", String(minWinRate));
  if (minTrades > 0) u.searchParams.set("minTrades", String(minTrades));
  if (minPnl30d != null) u.searchParams.set("minPnl30d", String(minPnl30d));
  const lim = Math.min(100, Math.max(1, Number(limit ?? 50)));
  u.searchParams.set("limit", String(lim));
  const res = await fetch(u.toString());
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || "leaderboard_failed");
  return j;
}

export function useSmartWalletsLeaderboard(opts = {}) {
  const chain = opts.chain ?? "solana";
  const minWinRate = Number(opts.minWinRate || 0);
  const minTrades = Number(opts.minTrades || 0);
  const minPnl30d = opts.minPnl30d == null ? null : Number(opts.minPnl30d);
  const limit = opts.limit ?? 50;
  const refetchInterval = opts.refetchInterval;
  return useQuery({
    queryKey: ["smart-wallets-leaderboard", chain, minWinRate, minTrades, minPnl30d, limit],
    queryFn: () => fetchLeaderboard({ chain, minWinRate, minTrades, minPnl30d, limit }),
    staleTime: 60_000,
    ...(refetchInterval != null ? { refetchInterval } : {})
  });
}
