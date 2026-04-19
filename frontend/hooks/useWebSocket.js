import { useCallback, useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import { getPublicWsUrl } from "../lib/publicRuntime";
import { isProbableSolanaPubkey } from "../lib/solanaAddress";

let socket = null;
let mockCounter = 0;

function buildMockTransaction(tokenAddress) {
  const typeRoll = Math.random();
  const type = typeRoll > 0.66 ? "buy" : typeRoll > 0.33 ? "swap" : "sell";
  mockCounter += 1;
  const walletSeed = Math.random().toString(36).slice(2, 8);
  return {
    signature: `mock-${tokenAddress}-${Date.now()}-${mockCounter}`,
    wallet: `SIM${walletSeed.toUpperCase()}${String(mockCounter).padStart(4, "0")}`,
    amount: Number((Math.random() * 8000 + 100).toFixed(2)),
    type,
    timestamp: new Date().toISOString(),
    isMock: true
  };
}

export function useWebSocket(tokenAddress) {
  const [transactions, setTransactions] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState("disconnected");
  const dedupeRef = useRef(new Set());
  const mockStartRef = useRef(null);
  const mockIntervalRef = useRef(null);
  const lastNotifiedRef = useRef(0);
  const txCountRef = useRef(0);
  const [convergence, setConvergence] = useState({
    detected: false,
    wallets: [],
    detectedAt: null,
    windowMinutes: 10
  });

  const clearMockTimers = useCallback(() => {
    if (mockStartRef.current) {
      clearTimeout(mockStartRef.current);
      mockStartRef.current = null;
    }
    if (mockIntervalRef.current) {
      clearInterval(mockIntervalRef.current);
      mockIntervalRef.current = null;
    }
  }, []);

  const pushTransaction = useCallback((tx, fromMock = false) => {
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
    txCountRef.current += 1;

    const nextTx = {
      ...tx,
      isMock: !!fromMock || !!tx?.isMock,
      shouldNotify
    };
    setTransactions((prev) => [nextTx, ...prev].slice(0, 50));
  }, []);

  useEffect(() => {
    if (!tokenAddress || !isProbableSolanaPubkey(String(tokenAddress))) {
      setConnectionState("disconnected");
      setIsConnected(false);
      return;
    }

    setConnectionState("reconnecting");
    setIsConnected(false);
    setTransactions([]);
    setConvergence({ detected: false, wallets: [], detectedAt: null, windowMinutes: 10 });
    dedupeRef.current = new Set();
    txCountRef.current = 0;
    clearMockTimers();

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

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("reconnect_attempt", onReconnectAttempt);
    socket.on("transaction", handleTx);
    socket.on("convergence", handleConvergence);

    socket.emit("join-token", tokenAddress);
    mockStartRef.current = setTimeout(() => {
      if (txCountRef.current > 0) return;
      mockIntervalRef.current = setInterval(() => {
        pushTransaction(buildMockTransaction(tokenAddress), true);
      }, 5000);
    }, 10000);

    return () => {
      socket.emit("leave-token", tokenAddress);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("reconnect_attempt", onReconnectAttempt);
      socket.off("transaction", handleTx);
      socket.off("convergence", handleConvergence);
      clearMockTimers();
    };
  }, [tokenAddress, pushTransaction, clearMockTimers]);

  return { transactions, isConnected, connectionState, convergence };
}

