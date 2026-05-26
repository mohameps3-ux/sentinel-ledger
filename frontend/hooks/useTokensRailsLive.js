import { useEffect, useRef, useState, useCallback } from "react";
import { TOKENS_RAILS_QUERY_KEY } from "./useTokensRails";

/**
 * Subscribes to `sentinel:signal` on the rails room; invalidates rails query and
 * pulses affected mint cards when a signal lands for a token already in a rail.
 */
export function useTokensRailsLive(queryClient, railsByMint) {
  const [wsConnected, setWsConnected] = useState(false);
  const [pulsingMints, setPulsingMints] = useState(() => new Set());
  const pulseTimers = useRef(new Map());
  const railsByMintRef = useRef(railsByMint);
  railsByMintRef.current = railsByMint;

  const triggerPulse = useCallback((mint) => {
    if (!mint) return;
    setPulsingMints((prev) => {
      const next = new Set(prev);
      next.add(mint);
      return next;
    });
    const existing = pulseTimers.current.get(mint);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      setPulsingMints((prev) => {
        const next = new Set(prev);
        next.delete(mint);
        return next;
      });
      pulseTimers.current.delete(mint);
    }, 1000);
    pulseTimers.current.set(mint, t);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !queryClient) return undefined;
    let socket;
    let cancelled = false;

    const onConnect = () => {
      setWsConnected(true);
      try {
        socket?.emit("join-rails");
      } catch (_) {
        /* ignore */
      }
    };
    const onDisconnect = () => setWsConnected(false);
    const onSignal = (payload) => {
      if (cancelled) return;
      const mint = String(payload?.token_address || payload?.mint || payload?.asset || "");
      if (!mint) return;
      queryClient.invalidateQueries({ queryKey: TOKENS_RAILS_QUERY_KEY });
      if (railsByMintRef.current?.has?.(mint)) triggerPulse(mint);
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
        socket.on("sentinel:signal", onSignal);
        if (socket.connected) onConnect();
      } catch (_) {
        /* optional */
      }
    })();

    return () => {
      cancelled = true;
      for (const t of pulseTimers.current.values()) clearTimeout(t);
      pulseTimers.current.clear();
      try {
        socket?.emit("leave-rails");
      } catch (_) {
        /* ignore */
      }
      try {
        socket?.off("connect", onConnect);
        socket?.off("disconnect", onDisconnect);
        socket?.off("sentinel:signal", onSignal);
        socket?.disconnect();
      } catch (_) {
        /* ignore */
      }
    };
  }, [queryClient, triggerPulse]);

  return { wsConnected, pulsingMints };
}
