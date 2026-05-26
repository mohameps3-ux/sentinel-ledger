import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { apiJson } from "../lib/apiClient";

export const TOKENS_RAILS_QUERY_KEY = ["tokens-rails-v1"];

async function fetchTokensRails() {
  return apiJson("/api/v1/tokens/rails", { cache: "no-store" });
}

/**
 * Hot / Live / Velocity rails for home + scanner enrichment.
 * Polls every 30s; keeps previous data during refetch (anti-flash).
 */
export function useTokensRails({ refetchMs = 30_000 } = {}) {
  const query = useQuery({
    queryKey: TOKENS_RAILS_QUERY_KEY,
    queryFn: fetchTokensRails,
    staleTime: Math.max(0, Math.floor(refetchMs / 2)),
    refetchInterval: refetchMs,
    placeholderData: keepPreviousData,
    retry: 1,
    refetchOnWindowFocus: true
  });

  const data = query.data;
  return {
    hot: Array.isArray(data?.hot) ? data.hot : [],
    live: Array.isArray(data?.live) ? data.live : [],
    velocity: Array.isArray(data?.velocity) ? data.velocity : [],
    generatedAt: data?.generated_at || null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
    mutate: () => query.refetch()
  };
}

/** Build lookup maps for scanner rail_score / rail chips. */
export function buildRailsIndex(railsData) {
  const byMint = new Map();
  const add = (items, rail) => {
    for (const item of items || []) {
      const mint = String(item.token_address || "");
      if (!mint) continue;
      let row = byMint.get(mint);
      if (!row) {
        row = { rails: [], rail_score: null, items: {} };
        byMint.set(mint, row);
      }
      if (!row.rails.includes(rail)) row.rails.push(rail);
      row.items[rail] = item;
      const score = Number(item.rail_score);
      if (Number.isFinite(score) && (row.rail_score == null || score > row.rail_score)) {
        row.rail_score = score;
      }
    }
  };
  add(railsData?.hot, "hot");
  add(railsData?.live, "live");
  add(railsData?.velocity, "velocity");
  return byMint;
}
