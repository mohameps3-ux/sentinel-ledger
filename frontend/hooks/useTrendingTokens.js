import { useQuery } from "@tanstack/react-query";
import { getPublicApiUrl } from "../lib/publicRuntime";

async function fetchTrending() {
  const res = await fetch(`${getPublicApiUrl()}/api/v1/token/trending`);
  if (!res.ok) throw new Error("Failed to fetch trending tokens");
  return res.json();
}

export function useTrendingTokens() {
  return useQuery({
    queryKey: ["trending-tokens"],
    queryFn: fetchTrending,
    staleTime: 30000,
    refetchInterval: 60000
  });
}
