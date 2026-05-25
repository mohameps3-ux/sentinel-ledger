/** @typedef {'TOO_LATE' | 'CROWDED' | 'ACCELERATING' | 'EARLY'} TokenStateChipId */

// TODO: wire smartWalletTrend (stalled/declining) when backend exposes wallet-flow trend.

const STATE_CHIP_PRIORITY = /** @type {const} */ (["TOO_LATE", "CROWDED", "ACCELERATING", "EARLY"]);

/**
 * @param {object | null | undefined} input
 * @returns {TokenStateChipId | null}
 */
export function resolveTokenStateChip(input) {
  if (!input || typeof input !== "object") return null;

  const poolAgeMinutes = finiteOrNull(input.poolAgeMinutes);
  const smartWalletCount = finiteOrNull(input.smartWalletCount);
  const momentumScore = finiteOrNull(input.momentumScore);
  const volume5mChangePct = finiteOrNull(input.volume5mChangePct);
  const signalAgeMinutes = finiteOrNull(input.signalAgeMinutes);
  const change24hPct = finiteOrNull(input.change24hPct);

  /** @type {Record<TokenStateChipId, boolean>} */
  const rules = {
    TOO_LATE: change24hPct != null && change24hPct > 200 && momentumScore != null && momentumScore < 50,
    CROWDED:
      signalAgeMinutes != null &&
      signalAgeMinutes > 360 &&
      change24hPct != null &&
      change24hPct > 100 &&
      momentumScore != null &&
      momentumScore < 60,
    ACCELERATING:
      momentumScore != null &&
      momentumScore > 70 &&
      poolAgeMinutes != null &&
      poolAgeMinutes < 24 * 60 &&
      volume5mChangePct != null &&
      volume5mChangePct > 50,
    EARLY:
      poolAgeMinutes != null &&
      poolAgeMinutes < 120 &&
      smartWalletCount != null &&
      smartWalletCount > 0 &&
      momentumScore != null &&
      momentumScore < 60
  };

  for (const id of STATE_CHIP_PRIORITY) {
    if (rules[id]) return id;
  }
  return null;
}

/**
 * @param {TokenStateChipId | null | undefined} state
 */
export function tokenStateChipLabel(state) {
  if (!state) return null;
  return state.replace(/_/g, " ");
}

/**
 * @param {TokenStateChipId | null | undefined} state
 */
export function tokenStateChipClass(state) {
  switch (state) {
    case "EARLY":
      return "border-cyan-500/35 text-cyan-200 bg-cyan-500/10";
    case "ACCELERATING":
      return "border-lime-500/35 text-lime-200 bg-lime-500/10";
    case "CROWDED":
      return "border-orange-500/35 text-orange-200 bg-orange-500/10";
    case "TOO_LATE":
      return "border-rose-500/35 text-rose-200 bg-rose-500/10";
    default:
      return "border-white/10 text-gray-500 bg-black/20";
  }
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function finiteOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
