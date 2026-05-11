import { useQuery } from "@tanstack/react-query";
import { getPublicApiUrl } from "../lib/publicRuntime";

async function fetchIngestionHealth() {
  const url = `${getPublicApiUrl()}/health/ingestion`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`ingestion_health_${res.status}`);
  return res.json();
}

/**
 * Polls backend /health/ingestion for Helius webhook freshness (lastEventAgeMs).
 */
export function useIngestionPulse(refetchMs = 12_000) {
  return useQuery({
    queryKey: ["health-ingestion-pulse"],
    queryFn: fetchIngestionHealth,
    staleTime: Math.max(3000, Math.floor(refetchMs / 2)),
    refetchInterval: refetchMs,
    retry: 1,
    refetchOnWindowFocus: true
  });
}
