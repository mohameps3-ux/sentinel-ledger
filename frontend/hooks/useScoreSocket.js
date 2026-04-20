import { useEffect, useRef, useState } from "react";

/**
 * Subscribes to `sentinel:score` for a given asset. Uses a module-level
 * singleton socket (same pattern as `useWebSocket`) so multiple consumers
 * share one underlying connection instead of opening one per component.
 *
 * Health/sync status does NOT live here — consumers read it from
 * `useGlobalHealth()` which shares a single poller across the whole tab.
 *
 * Cryptographic verification
 * --------------------------
 * Every payload (socket push and bootstrap fetch) is run through the Ed25519
 * verifier on arrival. The verification happens OFF the render-critical path
 * (fire-and-forget promise) and its result is attached to the score object
 * as `__verification` so consumers can display trust badges without any
 * extra wiring. Verification NEVER blocks rendering — if the verifier is
 * slow or offline, the UI stays reactive and the badge downgrades to
 * "unknown" gracefully.
 *
 * @param {string} asset  Token mint. Falsy = no-op.
 * @returns {{ score: object | null, isConnected: boolean, lastScoreAt: number | null }}
 *          The returned `score`, when present, may carry a non-enumerable
 *          `__verification` field: "verified" | "tampered" | "unsigned" | "unknown".
 */

let socket = null;
let socketRefCount = 0;
const roomRefCounts = new Map();

async function ensureSocket() {
  if (socket) return socket;
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
    return socket;
  } catch (_) {
    return null;
  }
}

function incrementRoom(asset) {
  const next = (roomRefCounts.get(asset) || 0) + 1;
  roomRefCounts.set(asset, next);
  return next === 1;
}

function decrementRoom(asset) {
  const next = (roomRefCounts.get(asset) || 1) - 1;
  if (next <= 0) {
    roomRefCounts.delete(asset);
    return true;
  }
  roomRefCounts.set(asset, next);
  return false;
}

/**
 * Kick off Ed25519 verification for a score payload off the render path.
 * When verification resolves, the CURRENT score state is re-issued with a
 * `__verification` field attached. If the user has moved on to a newer
 * score (matched by signature), the async result is silently discarded —
 * we never rewind the UI to an older payload.
 */
function startVerification(payload, setScore) {
  if (!payload || typeof payload !== "object") return;
  const sigFingerprint = payload.signature || null;
  (async () => {
    let status = "unknown";
    try {
      const [{ verifyScore }, { getPublicApiUrl }] = await Promise.all([
        import("../lib/scoreVerifier"),
        import("../lib/publicRuntime")
      ]);
      status = await verifyScore(payload, getPublicApiUrl());
    } catch (_) {
      status = "unknown";
    }
    if (status === "tampered" && process.env.NODE_ENV !== "production") {
      console.warn(
        "[sentinel] score signature failed verification",
        payload.asset,
        payload.pubkeyFp
      );
    }
    setScore((prev) => {
      if (!prev) return prev;
      // Only stamp the verification if the latest score is the same one we
      // verified (identity via signature). Prevents a slow verifier from
      // overwriting a newer score that already arrived over the socket.
      const prevSig = prev.signature || null;
      if (prevSig !== sigFingerprint) return prev;
      if (prev.__verification === status) return prev;
      return { ...prev, __verification: status };
    });
  })();
}

export function useScoreSocket(asset) {
  const [score, setScore] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastScoreAt, setLastScoreAt] = useState(null);
  const assetRef = useRef(asset);
  assetRef.current = asset;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!asset) return;
    let cancelled = false;
    let boundHandlers = null;
    let joined = false;

    // Bootstrap from the persistence layer so the card can render a real
    // score immediately, killing the "WAITING" state whenever the engine
    // has evaluated the asset in the last 10 minutes (cache TTL on backend).
    //
    // Uses the shared `scoreBootstrapQueue` so that mounting N cards at once
    // (home feed: up to 44 concurrent) produces at most 6 parallel HTTP
    // requests, deduplicates any asset that appears in more than one card,
    // and short-circuits remounts within a 60 s TTL. Socket events remain
    // the source of truth for "now" — bootstrap is only applied if state
    // hasn't been populated by a socket push yet.
    (async () => {
      try {
        const [{ bootstrapScore }, { getPublicApiUrl }] = await Promise.all([
          import("../lib/scoreBootstrapQueue"),
          import("../lib/publicRuntime")
        ]);
        const cached = await bootstrapScore(asset, getPublicApiUrl());
        if (cancelled || !cached || cached.asset !== asset) return;
        let appliedBootstrap = false;
        setScore((prev) => {
          if (prev) return prev;
          appliedBootstrap = true;
          return cached;
        });
        setLastScoreAt((prev) => {
          if (prev) return prev;
          const ts = cached.timestamp ? Date.parse(cached.timestamp) : NaN;
          return Number.isFinite(ts) ? ts : Date.now();
        });
        if (appliedBootstrap) startVerification(cached, setScore);
      } catch (_) {
        // Bootstrap is best-effort; socket will populate as events arrive.
      }
    })();

    (async () => {
      const s = await ensureSocket();
      if (!s || cancelled) return;
      socketRefCount += 1;

      const onConnect = () => {
        if (cancelled) return;
        setIsConnected(true);
        if (assetRef.current && incrementRoom(assetRef.current)) {
          try {
            s.emit("join-token", assetRef.current);
            joined = true;
          } catch (_) {}
        } else {
          joined = true;
        }
      };
      const onDisconnect = () => {
        if (!cancelled) setIsConnected(false);
      };
      const onScore = (payload) => {
        if (cancelled || !payload) return;
        if (payload.asset && assetRef.current && payload.asset !== assetRef.current) return;
        setScore(payload);
        // Prefer server-side emission time when available; falls back to
        // client receive time so the UI still works with older backends.
        const serverTs = payload.timestamp ? Date.parse(payload.timestamp) : NaN;
        setLastScoreAt(Number.isFinite(serverTs) ? serverTs : Date.now());
        startVerification(payload, setScore);
      };

      s.on("connect", onConnect);
      s.on("disconnect", onDisconnect);
      s.on("sentinel:score", onScore);

      if (s.connected) {
        setIsConnected(true);
        if (incrementRoom(asset)) {
          try {
            s.emit("join-token", asset);
          } catch (_) {}
        }
        joined = true;
      }

      boundHandlers = { onConnect, onDisconnect, onScore };
    })();

    return () => {
      cancelled = true;
      if (!socket) return;
      if (boundHandlers) {
        socket.off("connect", boundHandlers.onConnect);
        socket.off("disconnect", boundHandlers.onDisconnect);
        socket.off("sentinel:score", boundHandlers.onScore);
      }
      if (joined && decrementRoom(asset)) {
        try {
          socket.emit("leave-token", asset);
        } catch (_) {}
      }
      socketRefCount = Math.max(0, socketRefCount - 1);
      // Keep the singleton alive across mounts within the same SPA session.
      // Browsers clean it up on tab close. Preserving it avoids reconnect churn
      // when the user navigates between token pages.
    };
  }, [asset]);

  return { score, isConnected, lastScoreAt };
}
