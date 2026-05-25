import { useQuery } from "@tanstack/react-query";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { isProbableSolanaMint } from "../lib/solanaMint.mjs";

async function fetchTokenFlow(address) {
  const res = await fetch(
    `${getPublicApiUrl()}/api/v1/public/token-flow/${encodeURIComponent(address)}?hours=4&limit=30`
  );
  if (!res.ok) return { rows: [] };
  const json = await res.json().catch(() => ({ rows: [] }));
  return json;
}

/**
 * REST fallback for LiveFlowPanel: fetches recent smart-wallet signals for a
 * specific mint from the DB. Refreshes every 30s. Only used when the WebSocket
 * has not delivered live transactions yet.
 */
export function useTokenFlow(address) {
  const enabled = Boolean(address && isProbableSolanaMint(address));
  const query = useQuery({
    queryKey: ["token-flow", address],
    queryFn: () => fetchTokenFlow(address),
    enabled,
    staleTime: 20_000,
    refetchInterval: 30_000
  });
  return {
    rows: query.data?.rows ?? [],
    isLoading: query.isPending,
    meta: query.data?.meta ?? null
  };
}
