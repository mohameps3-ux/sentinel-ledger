/**
 * Pair / pool “created at” handling.
 *
 * Contract: API field `pairCreatedAt` is always **Unix time in milliseconds** (integer, floor).
 * Raw feeds (e.g. DexScreener) may send **seconds** (value &lt; 1e12) or **ms** (value ≥ 1e12).
 * Keep in sync with `frontend/src/lib/pairTime.js` (copy when changing one side).
 */

/**
 * @param {unknown} raw
 * @returns {number | null} Unix ms or null
 */
function pairCreatedRawToUnixMs(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 1e12 ? Math.floor(n * 1000) : Math.floor(n);
}

/**
 * @param {number} createdAtMs
 * @param {number} [nowMs=Date.now()]
 * @returns {number} non-negative, fractional minutes
 */
function poolAgeMinutesFromCreatedMs(createdAtMs, nowMs = Date.now()) {
  return Math.max(0, (nowMs - createdAtMs) / 60000);
}

module.exports = { pairCreatedRawToUnixMs, poolAgeMinutesFromCreatedMs };
