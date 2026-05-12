import { useEffect, useState } from "react";

/** Match `useQuery` on Track Record page so socket pushes invalidate the same cache. */
export const TRACK_RECORD_QUERY_KEY = ["track-record-real-data-v7"];

/**
 * Subscribes to backend `sentinel:track-record` (room `track-record`) and invalidates React Query
 * when the validation ledger changes — real pushes, not only poll.
 */
export function useTrackRecordLive(queryClient) {
  const [wsConnected, setWsConnected] = useState(false);
  const [lastLivePushAt, setLastLivePushAt] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined" || !queryClient) return undefined;
    let socket;
    let cancelled = false;

    const onConnect = () => {
      setWsConnected(true);
      try {
        socket?.emit("join-track-record");
      } catch (_) {
        /* ignore */
      }
    };
    const onDisconnect = () => setWsConnected(false);
    const onTrackRecord = () => {
      if (cancelled) return;
      setLastLivePushAt(Date.now());
      queryClient.invalidateQueries({ queryKey: TRACK_RECORD_QUERY_KEY });
    };

    (async () => {
      try {
        const { io } = await import("socket.io-client");
        const { getPublicWsUrl } = await import("../lib/publicRuntime");
        const url = getPublicWsUrl();
        if (!url) return;
        socket = io(url, {
          transports: ["websocket", "polling"],
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1500
        });
        socket.on("connect", onConnect);
        socket.on("disconnect", onDisconnect);
        socket.on("sentinel:track-record", onTrackRecord);
        if (socket.connected) onConnect();
      } catch (_) {
        /* socket.io-client optional */
      }
    })();

    return () => {
      cancelled = true;
      try {
        socket?.emit("leave-track-record");
      } catch (_) {
        /* ignore */
      }
      try {
        socket?.off("connect", onConnect);
        socket?.off("disconnect", onDisconnect);
        socket?.off("sentinel:track-record", onTrackRecord);
        socket?.disconnect();
      } catch (_) {
        /* ignore */
      }
    };
  }, [queryClient]);

  return { wsConnected, lastLivePushAt };
}
