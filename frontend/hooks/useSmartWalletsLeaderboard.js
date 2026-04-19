import { useQuery } from "@tanstack/react-query";
import { getPublicApiUrl } from "../lib/publicRuntime";

async function fetchLeaderboard({ chain, minWinRate, minTrades }) {
  const u = new URL(`${getPublicApiUrl()}/api/v1/public/smart-wallets-leaderboard`);
  if (chain) u.searchParams.set("chain", chain);
  if (minWinRate > 0) u.searchParams.set("minWinRate", String(minWinRate));
  if (minTrades > 0) u.searchParams.set("minTrades", String(minTrades));
  const res = await fetch(u.toString());
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || "leaderboard_failed");
  return j;
}

export function useSmartWalletsLeaderboard(opts = {}) {
  const chain = opts.chain ?? "solana";
  const minWinRate = Number(opts.minWinRate || 0);
  const minTrades = Number(opts.minTrades || 0);
  return useQuery({
    queryKey: ["smart-wallets-leaderboard", chain, minWinRate, minTrades],
    queryFn: () => fetchLeaderboard({ chain, minWinRate, minTrades }),
    staleTime: 60_000
  });
}
