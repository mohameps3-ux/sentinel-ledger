import { useCallback, useEffect, useMemo, useState } from "react";
import { getPublicApiUrl } from "../lib/publicRuntime";

function compactAddr(addr) {
  if (!addr || typeof addr !== "string") return "—";
  const s = addr.trim();
  if (s.length < 12) return s;
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

/** Keep only plausible Solana pubkeys (base58 length). */
export function normalizeWalletAddresses(list) {
  const seen = new Set();
  const out = [];
  (Array.isArray(list) ? list : []).forEach((a) => {
    if (!a || typeof a !== "string") return;
    const s = a.trim();
    if (s.length < 32 || s.length > 44) return;
    if (seen.has(s)) return;
    seen.add(s);
    out.push(s);
  });
  return out.slice(0, 80);
}

/**
 * Batch-fetch display labels from GET /api/v1/public/wallet-labels.
 * @param {string[]} addresses - full wallet pubkeys
 */
export function useWalletLabels(addresses) {
  const key = useMemo(() => normalizeWalletAddresses(addresses).sort().join(","), [addresses]);

  const [labels, setLabels] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!key) {
      setLabels({});
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`${getPublicApiUrl()}/api/v1/public/wallet-labels?addresses=${encodeURIComponent(key)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setLabels(j?.labels && typeof j.labels === "object" ? j.labels : {});
      })
      .catch(() => {
        if (!cancelled) setLabels({});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const labelFor = useCallback(
    (addr) => {
      if (!addr) return "—";
      const row = labels[addr];
      if (row?.label) return row.label;
      return compactAddr(addr);
    },
    [labels]
  );

  const titleFor = useCallback(
    (addr) => {
      if (!addr) return "";
      const row = labels[addr];
      return row?.tooltip || addr;
    },
    [labels]
  );

  return { labels, loading, labelFor, titleFor, compactAddr };
}
