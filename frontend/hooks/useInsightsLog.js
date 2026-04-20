import { useSyncExternalStore } from "react";
import { subscribe, getLog } from "../lib/insightsLog";

/**
 * React hook that returns the rolling insights log for `mint`.
 *
 * Contract
 * --------
 *   - Returns a `readonly` array of entries, newest first.
 *   - Array identity is stable across renders until the log for this
 *     specific mint actually mutates — so consumers wrapped in
 *     `React.memo` won't re-reconcile when unrelated mints receive
 *     entries.
 *   - SSR snapshot is the shared empty-frozen array; on the client
 *     React will re-read after `subscribe` runs and render the real log
 *     without a hydration mismatch.
 */
export function useInsightsLog(mint) {
  return useSyncExternalStore(
    subscribe,
    () => getLog(mint),
    () => getLog(null) // returns the frozen EMPTY array
  );
}
