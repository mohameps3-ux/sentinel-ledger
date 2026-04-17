import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import { getPublicWsUrl } from "../lib/publicRuntime";
import { isProbableSolanaPubkey } from "../lib/solanaAddress";

let socket = null;

export function useWebSocket(tokenAddress) {
  const [transactions, setTransactions] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const dedupeRef = useRef(new Set());

  useEffect(() => {
    if (!tokenAddress || !isProbableSolanaPubkey(String(tokenAddress))) return;
    dedupeRef.current = new Set();
    if (!socket) {
      socket = io(getPublicWsUrl(), { transports: ["websocket", "polling"] });
      socket.on("connect", () => setIsConnected(true));
      socket.on("disconnect", () => setIsConnected(false));
    }
    socket.emit("join-token", tokenAddress);
    const handleTx = (tx) => {
      const sig = tx.signature || "";
      const key = sig
        ? `${sig}:${tx.wallet}:${tx.amount}:${tx.type}`
        : `${tx.wallet}:${tx.timestamp}:${tx.amount}:${tx.type}`;
      if (dedupeRef.current.has(key)) return;
      dedupeRef.current.add(key);
      if (dedupeRef.current.size > 300) {
        dedupeRef.current = new Set([...dedupeRef.current].slice(-150));
      }
      setTransactions((prev) => [tx, ...prev].slice(0, 50));
    };
    socket.on("transaction", handleTx);
    return () => {
      socket.emit("leave-token", tokenAddress);
      socket.off("transaction", handleTx);
    };
  }, [tokenAddress]);

  return { transactions, isConnected };
}

