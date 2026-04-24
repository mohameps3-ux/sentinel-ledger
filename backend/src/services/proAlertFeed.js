/**
 * PRO alert feed (Bloomberg-style inbox trail) — persists priority-class rows for GET /alerts/feed.
 * Best-effort: never throws to callers; missing table until migration 018 is swallowed.
 */
"use strict";

const { getSupabase } = require("../lib/supabase");

const URGENT_MIN_PCT = Math.max(
  Number(process.env.PRO_ALERT_FEED_URGENT_MIN_PCT) || 12,
  1
);
const SUREFIRE_MIN_PCT = Math.max(
  Number(process.env.PRO_ALERT_FEED_SUREFIRE_MIN_PCT) || 25,
  URGENT_MIN_PCT
);

/**
 * Classify watchlist % move into feed tier (absolute move vs user threshold).
 * @param {number} absMovePct
 * @param {number} minMovePct — user threshold (already passed)
 * @returns {'tactical'|'urgent'|'surefire'}
 */
function tierForWatchlistMove(absMovePct, minMovePct) {
  const a = Number(absMovePct);
  if (!Number.isFinite(a)) return "tactical";
  if (a >= SUREFIRE_MIN_PCT) return "surefire";
  if (a >= URGENT_MIN_PCT) return "urgent";
  return "tactical";
}

/**
 * @param {{ userId: string, tier: string, source: string, headline: string, detail?: string|null, tokenAddress?: string|null, meta?: object }} row
 */
async function recordProAlertFeedItem(row) {
  const client = getSupabase();
  const userId = String(row.userId || "").trim();
  const tier = String(row.tier || "").toLowerCase();
  const source = String(row.source || "").trim().slice(0, 48);
  const headline = String(row.headline || "").trim().slice(0, 280);
  if (!userId || !source || !headline) return;
  if (!["info", "tactical", "urgent", "surefire"].includes(tier)) return;

  try {
    const { error } = await client.from("pro_alert_feed_items").insert({
      user_id: userId,
      tier,
      source,
      headline,
      detail: row.detail != null ? String(row.detail).slice(0, 2000) : null,
      token_address: row.tokenAddress != null ? String(row.tokenAddress).trim().slice(0, 64) : null,
      meta: row.meta && typeof row.meta === "object" ? row.meta : {}
    });
    if (error) throw error;
  } catch (e) {
    const msg = String(e?.message || e || "");
    if (/pro_alert_feed_items|42P01|relation/i.test(msg)) return;
    console.warn("[pro-alert-feed] insert:", msg.slice(0, 120));
  }
}

/** @param {string} [action] — regime.action from triple-risk layer */
function tierForTacticalRegimeAction(action) {
  const a = String(action || "").toUpperCase();
  if (a === "AVOID" || a === "SCALP") return "urgent";
  return "tactical";
}

module.exports = {
  recordProAlertFeedItem,
  tierForWatchlistMove,
  tierForTacticalRegimeAction,
  URGENT_MIN_PCT,
  SUREFIRE_MIN_PCT
};
