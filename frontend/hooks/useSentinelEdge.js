import { useEffect, useState } from "react";
import { getPublicApiUrl } from "../lib/publicRuntime";

/**
 * Phase 7c — Sentinel Edge: 24h aggregate signal performance.
 * Powers the proof-of-edge banner that no competitor offers.
 *
 * Returns: { winRate, avgWinReturn, totalWinners, totalResolved, bestSignal, loading, error }
 */
export function useSentinelEdge() {
  const [data, setData] = useState({
    winRate: null,
    avgWinReturn: null,
    totalWinners: null,
    totalResolved: null,
    bestSignal: null,
    loading: true,
    error: null
  });

  useEffect(() => {
    let alive = true;
    let timer = null;

    async function fetchEdge() {
      try {
        const base = getPublicApiUrl();
        const res = await fetch(`${base}/api/v1/public/sentinel-edge`);
        if (!res.ok) throw new Error(`http_${res.status}`);
        const json = await res.json();
        if (!alive) return;
        if (json?.ok) {
          setData({
            winRate: json.winRate ?? null,
            avgWinReturn: json.avgWinReturn ?? null,
            totalWinners: json.totalWinners ?? null,
            totalResolved: json.totalResolved ?? null,
            bestSignal: json.bestSignal || null,
            loading: false,
            error: null
          });
        } else {
          setData((prev) => ({ ...prev, loading: false, error: json?.error || "fetch_failed" }));
        }
      } catch (e) {
        if (!alive) return;
        setData((prev) => ({ ...prev, loading: false, error: e?.message || "fetch_failed" }));
      }
    }

    fetchEdge();
    timer = setInterval(fetchEdge, 60_000); // refresh every 60s
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, []);

  return data;
}
