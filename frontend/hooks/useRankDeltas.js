import { useEffect, useRef } from "react";

/**
 * Detects rank (position) changes in an ordered list between successive
 * renders. Used by the home page to show ↑/↓/NEW badges on feed cards so the
 * user can literally *see* the ranking move when a new poll arrives.
 *
 * Contract
 * --------
 *   const deltas = useRankDeltas(items, (item) => item.mint)
 *   deltas.get(key) => { rank, prevRank, delta, isNew }
 *     - rank      : 1-based position in the current list
 *     - prevRank  : position in the previous render (or null if unseen)
 *     - delta     : prevRank - rank. Positive = moved up, negative = down.
 *     - isNew     : true when the key first appears AFTER mount (first render
 *                   never flags anything as NEW, to avoid a page-load flash).
 *
 * Design notes
 * ------------
 *  - The "previous" snapshot lives in a ref and is committed in a post-render
 *    effect, so strict-mode double-renders don't swallow rank changes.
 *  - `mountedRef` suppresses NEW on the very first render — otherwise every
 *    card would light up "NEW" on page load.
 *  - Pure client computation. O(n) per render. No state, no re-render loop.
 *  - `keyFn` is called once per item per render; callers should return a
 *    stable identity (e.g. mint address), never a synthesized one.
 */
export function useRankDeltas(items, keyFn) {
  const prevRanksRef = useRef(new Map());
  const mountedRef = useRef(false);

  const list = Array.isArray(items) ? items : [];
  const deltas = new Map();

  for (let i = 0; i < list.length; i++) {
    const key = keyFn(list[i], i);
    if (key == null || key === "") continue;
    const rank = i + 1;
    const prevRank = prevRanksRef.current.get(key) ?? null;
    deltas.set(key, {
      rank,
      prevRank,
      delta: prevRank != null ? prevRank - rank : 0,
      isNew: mountedRef.current && prevRank == null
    });
  }

  useEffect(() => {
    const next = new Map();
    for (let i = 0; i < list.length; i++) {
      const key = keyFn(list[i], i);
      if (key != null && key !== "") next.set(key, i + 1);
    }
    prevRanksRef.current = next;
    mountedRef.current = true;
  });

  return deltas;
}
