import { useCallback, useEffect, useMemo, useState } from "react";
import { isProbableSolanaPubkey } from "../lib/solanaAddress";

const STORAGE_KEY = "sl.smartMoney.walletFavorites.v1";
const MAX = 200;

/**
 * Favoritos de wallets: solo en tu navegador (localStorage), sin servidor.
 * Direcciones se validan como pubkey Solana (base58 32–44) antes de guardar.
 */
function readSet() {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(
      arr
        .filter((a) => typeof a === "string" && isProbableSolanaPubkey(a))
        .slice(0, MAX)
    );
  } catch {
    return new Set();
  }
}

function writeSet(next) {
  if (typeof window === "undefined") return;
  try {
    const arr = [...next].slice(0, MAX);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  } catch (e) {
    if (e?.name === "QuotaExceededError" && next.size > 0) {
      const half = new Set([...next].slice(0, Math.floor(next.size / 2)));
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...half]));
      } catch {
        /* ignore */
      }
    }
  }
}

export function useWalletFavorites() {
  const [set, setSet] = useState(() => new Set());

  useEffect(() => {
    setSet(readSet());
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) setSet(readSet());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const isFavorite = useCallback((addr) => {
    if (!addr || !isProbableSolanaPubkey(addr)) return false;
    return set.has(addr);
  }, [set]);

  const toggle = useCallback((addr) => {
    if (!addr || !isProbableSolanaPubkey(addr)) return;
    setSet((prev) => {
      const n = new Set(prev);
      if (n.has(addr)) n.delete(addr);
      else if (n.size < MAX) n.add(addr);
      writeSet(n);
      return n;
    });
  }, []);

  const favorites = useMemo(() => [...set], [set]);
  return { favorites, isFavorite, toggle, count: set.size, max: MAX };
}
