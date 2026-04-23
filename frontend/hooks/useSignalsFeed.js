import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getPublicApiUrl } from "../lib/publicRuntime";

/**
 * Live-polling hook for the Live Smart Money Feed on the home page.
 *
 * The previous implementation used a one-shot `useEffect` fetch, so the cards
 * never refreshed after mount unless the user changed strategy. That turned a
 * feed that is *supposed* to feel alive into a static snapshot.
 *
 * This hook:
 *  - Polls `/api/v1/signals/latest` on a short, configurable interval
 *    (default 15 s). Short enough to feel live, loose enough to stay
 *    respectful to the backend.
 *  - Pauses automatically when the tab is hidden — React Query's default
 *    `refetchIntervalInBackground: false`. No wasted requests.
 *  - Keeps the previous payload visible during a refetch
 *    (`placeholderData: keepPreviousData`), so the grid never flashes empty.
 *  - Retries once on transient failures, then falls through silently so the
 *    home page can show an explicit empty/degraded state without UI breakage.
 *
 * No new dependencies, no schema or backend changes — this is a pure client
 * upgrade layered on top of the existing REST surface.
 */

async function fetchSignals({ limit, strategy }) {
  const url = `${getPublicApiUrl()}/api/v1/signals/latest?limit=${encodeURIComponent(
    limit
  )}&strategy=${encodeURIComponent(strategy)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`signals_fetch_failed_${res.status}`);
  return res.json();
}

export function useSignalsFeed({
  limit = 20,
  strategy = "balanced",
  refetchMs = 15_000
} = {}) {
  return useQuery({
    queryKey: ["signals-latest", strategy, limit],
    queryFn: () => fetchSignals({ limit, strategy }),
    staleTime: Math.max(0, Math.floor(refetchMs / 2)),
    refetchInterval: refetchMs,
    placeholderData: keepPreviousData,
    retry: 1,
    refetchOnWindowFocus: true
  });
}
