import { useMemo, useRef } from "react";

/**
 * Resilient list for public terminal feeds: prefer fresh non-empty `rows` from the server;
 * on empty/error/transient JSON, keep the last non-empty snapshot so the grid does not flash.
 *
 * - When `resetKey` changes (e.g. strategy), the buffer clears so the UI is not allowed to
 *   mix semantically different payloads.
 * - Pass `rows: null` when the response should be ignored (wrong-stale query cache, error).
 * - Security: this is a UX/availability hardening for already-public market/signal data.
 *   It is not a trust or authorization mechanism; all secrets stay server-side.
 *
 * @param {unknown[] | null | undefined} rows  Latest rows from the API (or null to fall back)
 * @param {string|number|boolean} resetKey     Bumps to drop the buffer (e.g. strategy name)
 * @returns {unknown[]}                         Stable array for children (may be empty on first load)
 */
export function useLastGoodArray(rows, resetKey) {
  const buffer = useRef([]);
  const keyRef = useRef(resetKey);

  if (keyRef.current !== resetKey) {
    keyRef.current = resetKey;
    buffer.current = [];
  }

  return useMemo(() => {
    if (Array.isArray(rows) && rows.length > 0) {
      buffer.current = rows;
      return rows;
    }
    return buffer.current;
  }, [rows, resetKey]);
}
