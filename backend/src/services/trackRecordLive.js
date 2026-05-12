"use strict";

const redis = require("../lib/cache");

const TRACK_RECORD_LEDGER_STATS_KEY = "signals:track-record:ledger-stats:v3:outcomes";
const TRACK_RECORD_CACHE_GEN_KEY = "signals:track-record:cache-gen";

const DEBOUNCE_MS = Math.min(5000, Math.max(400, Number(process.env.TRACK_RECORD_LIVE_DEBOUNCE_MS) || 750));

let debounceTimer = null;
let lastReason = "tick";

/**
 * Monotonic generation for HTTP JSON cache keys — bump invalidates all `v9:g*` entries without SCAN.
 */
async function getTrackRecordCacheGen() {
  try {
    const v = await redis.get(TRACK_RECORD_CACHE_GEN_KEY);
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

async function flushTrackRecordLedgerLive() {
  const reason = lastReason;
  try {
    await redis.incr(TRACK_RECORD_CACHE_GEN_KEY);
  } catch (e) {
    if (process.env.NODE_ENV !== "test") {
      console.warn("[track-record-live] cache gen bump failed:", e?.message || e);
    }
  }
  try {
    await redis.del(TRACK_RECORD_LEDGER_STATS_KEY);
  } catch (_) {
    /* non-fatal */
  }
  try {
    if (global.io) {
      global.io.to("track-record").emit("sentinel:track-record", {
        kind: "ledger",
        reason: String(reason || "tick").slice(0, 96),
        at: new Date().toISOString()
      });
    }
  } catch (_) {
    /* non-fatal */
  }
}

/**
 * Debounced: coalesce bursts (oracle tick + many row updates) into one gen bump + one WS push.
 */
function scheduleTrackRecordLedgerLive(reason) {
  if (typeof reason === "string" && reason.trim()) lastReason = reason.trim().slice(0, 96);
  if (debounceTimer) return;
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    flushTrackRecordLedgerLive().catch((e) => {
      if (process.env.NODE_ENV !== "test") {
        console.warn("[track-record-live] flush failed:", e?.message || e);
      }
    });
  }, DEBOUNCE_MS);
  if (debounceTimer && typeof debounceTimer.unref === "function") debounceTimer.unref();
}

module.exports = {
  TRACK_RECORD_LEDGER_STATS_KEY,
  getTrackRecordCacheGen,
  scheduleTrackRecordLedgerLive
};
