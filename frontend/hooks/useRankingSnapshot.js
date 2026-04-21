import { useEffect, useRef, useState } from "react";

/**
 * Holds the latest computed ranking in a ref, but only promotes it to React
 * state on a fixed cadence. Reduces visible "dance" when upstream scores
 * jitter between refetches or socket updates.
 *
 * @param {unknown} value  Latest full snapshot (typically a sorted array).
 * @param {number} flushMs Minimum milliseconds between UI updates.
 */
export function useRankingSnapshot(value, flushMs) {
  const [snap, setSnap] = useState(value);
  const latest = useRef(value);
  latest.current = value;

  useEffect(() => {
    setSnap(latest.current);
  }, [flushMs]);

  useEffect(() => {
    const id = setInterval(() => {
      setSnap(latest.current);
    }, flushMs);
    return () => clearInterval(id);
  }, [flushMs]);

  return snap;
}
