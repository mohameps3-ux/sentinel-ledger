import { useEffect } from "react";
import { acquireScoreRoom } from "@/lib/scoreRoomClient";
import { bootstrapScore } from "@/lib/scoreBootstrapQueue";
import { useMarketStore } from "@/lib/store/marketStore";
import { getPublicApiUrl } from "@/lib/publicRuntime";

/**
 * Subscribes a mint to sentinel:score (join-token) and hydrates the desk/cards
 * from GET /api/v1/scoring/latest/:asset so we don't sit on "Waiting for score…"
 * until the next on-chain tick.
 */
export function useScoreRoom(mint) {
  const updateLiveScore = useMarketStore((s) => s.updateLiveScore);

  useEffect(() => {
    if (!mint) return undefined;
    const id = String(mint).trim();
    const release = acquireScoreRoom(id);

    let cancelled = false;
    (async () => {
      try {
        const payload = await bootstrapScore(id, getPublicApiUrl());
        if (cancelled || !payload) return;
        updateLiveScore(id, payload);
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
      release();
    };
  }, [mint, updateLiveScore]);
}
