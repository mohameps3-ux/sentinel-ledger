import { useEffect, useRef, useState } from "react";

/**
 * Subscribes to `sentinel:score` events for a given asset and polls `/health/sync`
 * to expose a sync LED status (LIVE / SYNCING / DEGRADED / OFFLINE).
 *
 * Each consumer gets its own socket connection. This keeps the lifecycle simple
 * and decoupled from the mint-transactions socket in `useWebSocket`, at the cost
 * of a second WS (cheap — both share the Socket.IO origin).
 *
 * @param {string} asset  Token mint address (Solana pubkey). If falsy, the hook no-ops.
 * @returns {{
 *   score: object | null,
 *   syncStatus: "LIVE" | "SYNCING" | "DEGRADED" | "OFFLINE" | null,
 *   syncReason: string | null,
 *   isConnected: boolean,
 *   lastScoreAt: number | null
 * }}
 */
export function useScoreSocket(asset) {
  const [score, setScore] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);
  const [syncReason, setSyncReason] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastScoreAt, setLastScoreAt] = useState(null);
  const assetRef = useRef(asset);
  assetRef.current = asset;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!asset) return;
    let cancelled = false;
    let socket;

    (async () => {
      try {
        const { default: io } = await import("socket.io-client");
        const { getPublicWsUrl } = await import("../lib/publicRuntime");
        socket = io(getPublicWsUrl(), {
          transports: ["websocket", "polling"],
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 10000
        });

        const onConnect = () => {
          if (cancelled) return;
          setIsConnected(true);
          try {
            socket.emit("join-token", asset);
          } catch (_) {}
        };
        const onDisconnect = () => {
          if (!cancelled) setIsConnected(false);
        };
        const onScore = (payload) => {
          if (cancelled || !payload) return;
          if (payload.asset && assetRef.current && payload.asset !== assetRef.current) return;
          setScore(payload);
          setLastScoreAt(Date.now());
        };

        socket.on("connect", onConnect);
        socket.on("disconnect", onDisconnect);
        socket.on("sentinel:score", onScore);
      } catch (_) {
        // socket.io-client missing or unreachable — stay silent, UI will show "AWAITING"
      }
    })();

    return () => {
      cancelled = true;
      try {
        socket?.emit?.("leave-token", asset);
      } catch (_) {}
      try {
        socket?.disconnect?.();
      } catch (_) {}
    };
  }, [asset]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    let timer = null;

    const poll = async () => {
      try {
        const { getPublicApiUrl } = await import("../lib/publicRuntime");
        const res = await fetch(`${getPublicApiUrl()}/health/sync`, { cache: "no-store" });
        const j = await res.json();
        if (cancelled) return;
        setSyncStatus(typeof j?.status === "string" ? j.status : null);
        setSyncReason(typeof j?.reason === "string" ? j.reason : null);
      } catch (_) {
        if (!cancelled) {
          setSyncStatus("OFFLINE");
          setSyncReason("health_unreachable");
        }
      } finally {
        if (!cancelled) timer = setTimeout(poll, 10000);
      }
    };

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return { score, syncStatus, syncReason, isConnected, lastScoreAt };
}
