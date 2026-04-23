import { useQuery } from "@tanstack/react-query";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { UI_CONFIG } from "@/constants/homeData";

async function fetchQuotes(mints) {
  if (!mints.length) return { ok: true, data: [] };
  const qs = mints.join(",");
  const url = `${getPublicApiUrl()}/api/v1/tokens/quotes?mints=${encodeURIComponent(qs)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`quotes_fetch_${res.status}`);
  return res.json();
}

/**
 * Batched spot prices for LIVE decision-feed cards (Dex-backed via backend).
 * Pauses when `enabled` is false (e.g. user on HOT tab) to save rate limits.
 */
export function useDecisionFeedQuotes(mints, { isWarMode = false, enabled = true } = {}) {
  const sorted = [...new Set(mints)].filter(Boolean).sort();
  const key = sorted.join("|");
  const refetchMs = isWarMode
    ? UI_CONFIG.DECISION_FEED_QUOTES_WAR_MS
    : UI_CONFIG.DECISION_FEED_QUOTES_NORMAL_MS;

  return useQuery({
    queryKey: ["decision-feed-quotes", key, isWarMode],
    queryFn: () => fetchQuotes(sorted),
    enabled: Boolean(enabled && sorted.length),
    staleTime: 0,
    refetchInterval: enabled && sorted.length ? refetchMs : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1
  });
}
