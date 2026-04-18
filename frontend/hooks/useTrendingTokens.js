import { useQuery } from "@tanstack/react-query";
import { getPublicApiUrl } from "../lib/publicRuntime";

async function fetchTrending() {
  const res = await fetch(`${getPublicApiUrl()}/api/v1/tokens/hot?limit=12`);
  if (!res.ok) throw new Error("Failed to fetch hot tokens");
  return res.json();
}

export function useTrendingTokens(initialTrending = [], initialMeta = {}) {
  return useQuery({
    queryKey: ["trending-tokens"],
    queryFn: fetchTrending,
    initialData:
      Array.isArray(initialTrending) && initialTrending.length
        ? { ok: true, data: initialTrending, meta: { source: "ssr", ...initialMeta } }
        : undefined,
    staleTime: 30000,
    refetchInterval: 60000
  });
}
