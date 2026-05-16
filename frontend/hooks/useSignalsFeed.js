import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { useSubscriptionStatus } from "./useSubscriptionStatus";

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

async function fetchSignals({ limit, strategy, walletAddress }) {
  const params = new URLSearchParams({
    limit: String(limit),
    strategy
  });
  if (walletAddress) {
    params.set("wallet", walletAddress);
  }
  const url = `${getPublicApiUrl()}/api/v1/signals/latest?${params.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`signals_fetch_failed_${res.status}`);
  return res.json();
}

export function useSignalsFeed({
  limit = 20,
  strategy = "balanced",
  refetchMs = 15_000
} = {}) {
  const { publicKey, connected } = useWallet();
  const walletAddress = connected && publicKey ? publicKey.toBase58() : null;
  const subscription = useSubscriptionStatus();
  const feedTierKey =
    walletAddress && subscription.active ? "realtime" : "delayed";

  return useQuery({
    queryKey: ["signals-latest", strategy, limit, walletAddress, feedTierKey],
    queryFn: () => fetchSignals({ limit, strategy, walletAddress }),
    staleTime: Math.max(0, Math.floor(refetchMs / 2)),
    refetchInterval: refetchMs,
    placeholderData: keepPreviousData,
    retry: 1,
    refetchOnWindowFocus: true
  });
}
