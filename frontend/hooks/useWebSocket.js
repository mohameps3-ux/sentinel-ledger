import { useEffect, useState } from "react";
import io from "socket.io-client";
import { getPublicWsUrl } from "../lib/publicRuntime";

let socket = null;

export function useWebSocket(tokenAddress) {
  const [transactions, setTransactions] = useState([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!tokenAddress) return;
    if (!socket) {
      socket = io(getPublicWsUrl(), { transports: ["websocket", "polling"] });
      socket.on("connect", () => setIsConnected(true));
      socket.on("disconnect", () => setIsConnected(false));
    }
    socket.emit("join-token", tokenAddress);
    const handleTx = (tx) =>
      setTransactions((prev) => [tx, ...prev].slice(0, 50));
    socket.on("transaction", handleTx);
    return () => {
      socket.emit("leave-token", tokenAddress);
      socket.off("transaction", handleTx);
    };
  }, [tokenAddress]);

  return { transactions, isConnected };
}

