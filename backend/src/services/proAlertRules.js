/**
 * Per-user PRO alert preferences (stored in users.pro_alert_prefs JSONB).
 * Defaults align with product: conservative = fewer, louder signals; aggressive = more noise.
 */

const STRATEGY = {
  conservative: { minMovePct: 6, dedupHours: 6 },
  balanced: { minMovePct: 4, dedupHours: 4 },
  aggressive: { minMovePct: 3, dedupHours: 3 }
};

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/**
 * @param {object|null|undefined} raw - users.pro_alert_prefs
 * @returns {{ strategy: string, minMovePct: number, direction: string, dedupHours: number, tacticalRegime: boolean }}
 */
function resolveProAlertPrefs(raw) {
  const o = raw && typeof raw === "object" ? raw : {};
  const strategy = STRATEGY[o.strategy] ? o.strategy : "balanced";
  const base = STRATEGY[strategy];

  let minMovePct = Number(o.minMovePct);
  if (!Number.isFinite(minMovePct) || minMovePct <= 0) minMovePct = base.minMovePct;
  minMovePct = clamp(minMovePct, 2, 25);

  let dedupHours = Number(o.dedupHours);
  if (!Number.isFinite(dedupHours) || dedupHours <= 0) dedupHours = base.dedupHours;
  dedupHours = clamp(dedupHours, 1, 24);

  const direction = ["any", "up", "down"].includes(o.direction) ? o.direction : "any";

  /** When true, PRO users can receive execution-regime (BUY/SCALP/AVOID) for watchlist mints via Telegram and/or Web Push (tacticalRegimeNotifyCron). */
  const tacticalRegime = Boolean(o.tacticalRegime);

  return { strategy, minMovePct, direction, dedupHours, tacticalRegime };
}

function shouldFireForDirection(direction, signedMovePct) {
  if (direction === "up") return signedMovePct > 0;
  if (direction === "down") return signedMovePct < 0;
  return true;
}

module.exports = {
  STRATEGY,
  resolveProAlertPrefs,
  shouldFireForDirection
};
