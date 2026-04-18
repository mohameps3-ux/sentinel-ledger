import { useQuery } from "@tanstack/react-query";
import { getPublicApiUrl } from "../lib/publicRuntime";

async function fetchLeaderboard() {
  const res = await fetch(`${getPublicApiUrl()}/api/v1/public/smart-wallets-leaderboard`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || "leaderboard_failed");
  return j;
}

export function useSmartWalletsLeaderboard() {
  return useQuery({
    queryKey: ["smart-wallets-leaderboard"],
    queryFn: fetchLeaderboard,
    staleTime: 60_000
  });
}
