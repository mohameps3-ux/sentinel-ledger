import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getPublicApiUrl } from "../lib/publicRuntime";

async function fetchTrending({ limit, narrative }) {
  const q = narrative ? `&narrative=${encodeURIComponent(narrative)}` : "";
  const res = await fetch(
    `${getPublicApiUrl()}/api/v1/tokens/hot?limit=${encodeURIComponent(limit)}${q}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error("Failed to fetch hot tokens");
  return res.json();
}

/**
 * Polling hook for the Heat-ranked section of the home page.
 *
 * Interval is 25 s by default — tight enough for the board to re-rank visibly
 * within a user session, loose enough to avoid hammering upstream price APIs.
 * Previous-data is kept during refetch so the grid never flashes empty, and
 * React Query's default `refetchIntervalInBackground: false` pauses polling
 * when the tab is hidden.
 */
export function useTrendingTokens(
  initialTrending = [],
  initialMeta = {},
  narrative = "",
  { limit = 24, refetchMs = 25_000 } = {}
) {
  return useQuery({
    queryKey: ["trending-tokens", narrative, limit],
    queryFn: () => fetchTrending({ limit, narrative }),
    initialData:
      Array.isArray(initialTrending) && initialTrending.length
        ? { ok: true, data: initialTrending, meta: { source: "ssr", ...initialMeta } }
        : undefined,
    staleTime: Math.max(0, Math.floor(refetchMs / 2)),
    refetchInterval: refetchMs,
    placeholderData: keepPreviousData,
    retry: 1,
    refetchOnWindowFocus: true
  });
}
