/**
 * Explicit en-US so Node SSR and the browser render the same strings
 * (avoids hydration mismatch when system locale differs, e.g. 2,13 vs 2.13).
 */
export const STABLE_LOCALE = "en-US";

function asNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

/** Token / mock prices: enough precision for sub-$1 amounts. */
export function formatTokenPrice(value) {
  const n = asNum(value);
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  const maxFrac = abs >= 1 ? 2 : abs >= 0.01 ? 6 : 8;
  return n.toLocaleString(STABLE_LOCALE, {
    maximumFractionDigits: maxFrac,
    minimumFractionDigits: 0
  });
}

/** Large USD stats (liquidity, volume, mcap): grouped, no cents noise. */
export function formatUsdWhole(value) {
  const n = asNum(value);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString(STABLE_LOCALE, {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0
  });
}

/** Dollar amounts that may include cents (PnL, averages). */
export function formatUsdAmount(value) {
  const n = asNum(value);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString(STABLE_LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

/** Integer with grouping (holder counts). */
export function formatInteger(value) {
  const n = asNum(value);
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString(STABLE_LOCALE, { maximumFractionDigits: 0 });
}

export function formatDateTime(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(STABLE_LOCALE, { dateStyle: "medium", timeStyle: "short" });
}

export function formatTime(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(STABLE_LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}
