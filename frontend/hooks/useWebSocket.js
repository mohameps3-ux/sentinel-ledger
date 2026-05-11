import { useCallback, useEffect, useRef, useState } from "react";
import { getPublicWsUrl } from "../lib/publicRuntime";
import { isProbableSolanaPubkey } from "../lib/solanaAddress";

/** Shared client socket (browser only — never import `socket.io-client` at module top-level: breaks some SSR/serverless eval). */
let socket = null;

export function useWebSocket(tokenAddress) {
  const [transactions, setTransactions] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState("disconnected");
  const dedupeRef = useRef(new Set());
  const lastNotifiedRef = useRef(0);
  const [convergence, setConvergence] = useState({
    detected: false,
    wallets: [],
    detectedAt: null,
    windowMinutes: 10
  });
  /** Latest cluster coordination signal: RED_PREPARE | RED_CONFIRM | RED_ABORT (Fase B). */
  const [coordination, setCoordination] = useState(null);

  const pushTransaction = useCallback((tx) => {
    const sig = tx?.signature || "";
    const key = sig
      ? `${sig}:${tx?.wallet}:${tx?.amount}:${tx?.type}`
      : `${tx?.wallet}:${tx?.timestamp}:${tx?.amount}:${tx?.type}`;
    if (dedupeRef.current.has(key)) return;
    dedupeRef.current.add(key);
    if (dedupeRef.current.size > 300) {
      dedupeRef.current = new Set([...dedupeRef.current].slice(-150));
    }

    const now = Date.now();
    const shouldNotify = now - lastNotifiedRef.current >= 100;
    if (shouldNotify) lastNotifiedRef.current = now;

    const nextTx = {
      ...tx,
      isMock: false,
      shouldNotify
    };
    setTransactions((prev) => [nextTx, ...prev].slice(0, 50));
  }, []);

  useEffect(() => {
    let cancelled = false;
    let dispose = () => {};

    if (!tokenAddress || !isProbableSolanaPubkey(String(tokenAddress))) {
      setConnectionState("disconnected");
      setIsConnected(false);
      return undefined;
    }

    setConnectionState("reconnecting");
    setIsConnected(false);
    setTransactions([]);
    setConvergence({ detected: false, wallets: [], detectedAt: null, windowMinutes: 10 });
    setCoordination(null);
    dedupeRef.current = new Set();

    import("socket.io-client")
      .then((mod) => {
        if (cancelled) return;
        const io = mod.default;
        if (typeof io !== "function") {
          console.warn("[useWebSocket] socket.io-client default export missing");
          setConnectionState("disconnected");
          return;
        }

        if (!socket) {
          socket = io(getPublicWsUrl(), {
            transports: ["websocket", "polling"],
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 10000
          });
        }

        const onConnect = () => {
          setIsConnected(true);
          setConnectionState("connected");
        };
        const onDisconnect = () => {
          setIsConnected(false);
          setConnectionState("disconnected");
        };
        const onReconnectAttempt = () => {
          setIsConnected(false);
          setConnectionState("reconnecting");
        };
        const handleTx = (tx) => pushTransaction(tx, false);
        const handleConvergence = (evt) => {
          if (!evt) return;
          setConvergence({
            detected: true,
            wallets: Array.isArray(evt.wallets) ? evt.wallets : [],
            detectedAt: evt.detectedAt || new Date().toISOString(),
            windowMinutes: Number(evt.windowMinutes || 10)
          });
        };
        const handleRedSignal = (payload) => {
          if (!payload) return;
          setCoordination((prev) => ({
            ...payload,
            receivedAt: new Date().toISOString(),
            _seq: (prev?._seq || 0) + 1
          }));
        };

        socket.on("connect", onConnect);
        socket.on("disconnect", onDisconnect);
        socket.on("reconnect_attempt", onReconnectAttempt);
        socket.on("transaction", handleTx);
        socket.on("convergence", handleConvergence);
        socket.on("coordination:red-signal", handleRedSignal);

        socket.emit("join-token", tokenAddress);

        dispose = () => {
          try {
            socket.emit("leave-token", tokenAddress);
          } catch (_) {
            /* ignore */
          }
          socket.off("connect", onConnect);
          socket.off("disconnect", onDisconnect);
          socket.off("reconnect_attempt", onReconnectAttempt);
          socket.off("transaction", handleTx);
          socket.off("convergence", handleConvergence);
          socket.off("coordination:red-signal", handleRedSignal);
        };

        if (socket.connected) {
          setIsConnected(true);
          setConnectionState("connected");
        }
      })
      .catch((e) => {
        console.warn("[useWebSocket] socket.io-client load failed:", e?.message || e);
        setConnectionState("disconnected");
        setIsConnected(false);
      });

    return () => {
      cancelled = true;
      dispose();
    };
  }, [tokenAddress, pushTransaction]);

  return { transactions, isConnected, connectionState, convergence, coordination };
}
