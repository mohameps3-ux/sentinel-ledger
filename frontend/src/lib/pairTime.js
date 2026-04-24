/**
 * Pair / pool “created at” handling.
 *
 * Contract: `GET /api/v1/token` → `data.market.pairCreatedAt` is **Unix time in ms** (integer).
 * If a value arrives as **seconds** (&lt; 1e12), we normalize the same way as the backend.
 * Keep in sync with `backend/src/lib/pairTime.js` (copy when changing one side).
 */

/**
 * @param {unknown} raw
 * @returns {number | null} Unix ms or null
 */
export function pairCreatedRawToUnixMs(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 1e12 ? Math.floor(n * 1000) : Math.floor(n);
}

/**
 * @param {number} createdAtMs
 * @param {number} [nowMs=Date.now()]
 * @returns {number} non-negative, fractional minutes
 */
export function poolAgeMinutesFromCreatedMs(createdAtMs, nowMs = Date.now()) {
  return Math.max(0, (nowMs - createdAtMs) / 60000);
}
