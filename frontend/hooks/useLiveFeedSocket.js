import { useEffect, useRef } from "react";

/**
 * WebSocket-ready hook: connects to NEXT_PUBLIC_WS_URL when socket.io is available.
 * Backend may not emit `sentinel:signal` yet — UI stays mock-driven until then.
 */
export function useLiveFeedSocket({ onSignal } = {}) {
  const onSignalRef = useRef(onSignal);
  onSignalRef.current = onSignal;

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    let socket;

    (async () => {
      try {
        const { io } = await import("socket.io-client");
        const { getPublicWsUrl } = await import("../lib/publicRuntime");
        const url = getPublicWsUrl();
        socket = io(url, { transports: ["websocket"], autoConnect: true });
        socket.on("sentinel:signal", (payload) => {
          if (!cancelled) onSignalRef.current?.(payload);
        });
      } catch {
        // Optional dependency / server not emitting — no-op.
      }
    })();

    return () => {
      cancelled = true;
      try {
        socket?.disconnect?.();
      } catch (_) {}
    };
  }, []);
}
