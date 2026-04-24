import { useLayoutEffect, useRef, useState, useEffect } from "react";

/**
 * Buffers the visible ranking to reduce "dance" on rapid score changes, but never
 * lags the first successful paint or hides rows for many seconds.
 *
 * Previous bug: `snap` only advanced on `setInterval` (5–8s), so the grid could stay
 * empty after data arrived, or go blank until the next tick. Now:
 * - `flushMs <= 0` → return `value` (no buffer; all hooks still run in order);
 * - non-empty `value` → `setSnap` in layout (immediate);
 * - transition to empty → short debounce so transient `[]` from memos / upstream
 *   does not wipe the board;
 * - `flushMs` > 0: periodic `setSnap` for same-length reorder polish.
 */
export function useRankingSnapshot(value, flushMs) {
  const [snap, setSnap] = useState(() => value);
  const latest = useRef(value);
  latest.current = value;
  const emptyDebounce = useRef(null);
  const prevLenRef = useRef(-1);

  useLayoutEffect(() => {
    if (flushMs <= 0) return;
    const v = latest.current;
    const len = Array.isArray(v) ? v.length : 0;

    if (len > 0) {
      if (emptyDebounce.current) {
        clearTimeout(emptyDebounce.current);
        emptyDebounce.current = null;
      }
      setSnap(v);
    } else if (len === 0) {
      if (prevLenRef.current > 0) {
        if (emptyDebounce.current) clearTimeout(emptyDebounce.current);
        emptyDebounce.current = setTimeout(() => {
          if (Array.isArray(latest.current) && latest.current.length === 0) {
            setSnap([]);
          }
          emptyDebounce.current = null;
        }, 320);
      } else {
        setSnap(v);
      }
    }
    prevLenRef.current = len;
  }, [value, flushMs]);

  useEffect(() => {
    if (flushMs <= 0) return undefined;
    const id = setInterval(() => {
      const v = latest.current;
      if (Array.isArray(v) && v.length > 0) {
        setSnap(v);
      }
    }, flushMs);
    return () => clearInterval(id);
  }, [flushMs]);

  if (flushMs <= 0) {
    return value;
  }
  return snap;
}
