import { useEffect, useState } from "react";
import {
  subscribeGlobalHealth,
  getGlobalHealthSnapshot
} from "../lib/globalHealthStore";

/**
 * Hook over the module-level `/health/sync` singleton.
 *
 * Any number of components can call `useGlobalHealth()` and they will all
 * share the same underlying poller. No per-consumer network cost.
 *
 * @returns {{
 *   status: "LIVE" | "SYNCING" | "DEGRADED" | "OFFLINE" | null,
 *   reason: string | null,
 *   latencyMs: number | null,
 *   polledAt: number | null
 * }}
 */
export function useGlobalHealth() {
  const [snapshot, setSnapshot] = useState(() => getGlobalHealthSnapshot());
  useEffect(() => {
    const unsub = subscribeGlobalHealth(setSnapshot);
    return unsub;
  }, []);
  return snapshot;
}
