import { useEffect } from "react";
import { acquireScoreRoom } from "@/lib/scoreRoomClient";

/**
 * Subscribes a mint to sentinel:score room fan-out (join-token on the shared socket).
 */
export function useScoreRoom(mint) {
  useEffect(() => {
    if (!mint) return undefined;
    const release = acquireScoreRoom(mint);
    return () => {
      release();
    };
  }, [mint]);
}
