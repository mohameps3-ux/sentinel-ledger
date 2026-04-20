import { useSyncExternalStore } from "react";
import { subscribe, getEntry } from "../lib/terminalMemory";

/**
 * React hook that returns the current Terminal Memory entry for `mint`.
 *
 * Uses `useSyncExternalStore` so it:
 *  - is concurrent-mode safe (no tearing during transitions),
 *  - handles SSR via the third-argument snapshot (always null on the
 *    server; the client rehydrates its local state after first paint
 *    without any hydration mismatch warning),
 *  - only re-renders consumers whose specific entry reference changed —
 *    the store deliberately replaces the Map value on mutation and
 *    leaves unrelated entries by reference, so `Object.is` gate in React
 *    filters the fan-out to exactly the cards that care.
 *
 * The return value shape is `Entry | null`, where Entry is:
 *   {
 *     isWatched: boolean,
 *     lastSeenScore: number | null,     // 0..100
 *     firstDiscoveredAt: number | null, // epoch ms
 *     lastSeenAt: number | null         // epoch ms
 *   }
 */
export function useTerminalMemoryEntry(mint) {
  return useSyncExternalStore(
    subscribe,
    () => getEntry(mint),
    () => null
  );
}
