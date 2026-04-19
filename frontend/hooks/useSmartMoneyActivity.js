import { useQuery } from "@tanstack/react-query";
import { getPublicApiUrl } from "../lib/publicRuntime";

async function fetchActivity(limit) {
  const u = new URL(`${getPublicApiUrl()}/api/v1/public/smart-money-activity`);
  u.searchParams.set("limit", String(limit));
  const res = await fetch(u.toString());
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || "activity_failed");
  return j;
}

export function useSmartMoneyActivity(limit = 48) {
  return useQuery({
    queryKey: ["smart-money-activity", limit],
    queryFn: () => fetchActivity(limit),
    staleTime: 30_000
  });
}
