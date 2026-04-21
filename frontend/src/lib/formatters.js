/**
 * Pure string / number formatters for cockpit & token surfaces.
 * No React, no I/O — safe to import from hooks or API routes.
 */

/**
 * MM:SS countdown for entry windows.
 * @param {number} sec
 * @returns {string}
 */
export function formatCountdown(sec) {
  const safe = Math.max(0, Number(sec || 0));
  const mm = Math.floor(safe / 60);
  const ss = safe % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

/**
 * Relative time label from an ISO timestamp (history rows, logs).
 * @param {string | number | Date | null | undefined} iso
 * @returns {string}
 */
export function formatTimeAgo(iso) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const h = ms / 3600000;
  if (h < 1) return `${Math.max(1, Math.round(ms / 60000))} min ago`;
  return `${h.toFixed(1)} hours ago`;
}

/** @deprecated Prefer `formatTimeAgo` — kept for incremental migration. */
export function hoursAgoLabel(iso) {
  return formatTimeAgo(iso);
}

/**
 * @param {number} value
 * @param {number} [digits=1]
 * @returns {string}
 */
export function formatPct(value, digits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

/**
 * Short Solana address / mint for dense tables.
 * @param {string} [mint]
 * @param {number} [head=4]
 * @param {number} [tail=4]
 */
export function shortMint(mint, head = 4, tail = 4) {
  if (!mint || typeof mint !== "string") return "";
  if (mint.length <= head + tail + 1) return mint;
  return `${mint.slice(0, head)}…${mint.slice(-tail)}`;
}
