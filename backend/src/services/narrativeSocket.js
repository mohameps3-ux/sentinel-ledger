"use strict";

const PRO_NARRATIVE_ROOM = "pro";

function signalFeedFreeDelayMinutes() {
  const n = Number(process.env.SIGNAL_FEED_FREE_DELAY_MINUTES ?? 30);
  if (!Number.isFinite(n) || n < 0) return 30;
  return Math.min(24 * 60, Math.floor(n));
}

function eventSignalTimeMs(event) {
  const raw = event?.timestamp || event?.created_at || event?.detectedAt || event?.at;
  const ms = raw ? Date.parse(raw) : Date.now();
  return Number.isFinite(ms) ? ms : Date.now();
}

/**
 * Tiered sentinel:narrative delivery: PRO room realtime; everyone else delayed by
 * SIGNAL_FEED_FREE_DELAY_MINUTES from event.timestamp (signal time).
 *
 * Pending delayed emits live in-memory only — lost on process restart; tokens still
 * surface via the delayed REST feed.
 */
function emitNarrativeTiered(io, event, payload) {
  if (!io || !payload || typeof payload !== "object") return;

  const out = {
    ...payload,
    signalAt: event?.timestamp || event?.created_at || event?.detectedAt || null
  };

  io.to(PRO_NARRATIVE_ROOM).emit("sentinel:narrative", out);

  const delayMs = signalFeedFreeDelayMinutes() * 60 * 1000;
  const signalAtMs = eventSignalTimeMs(event);
  const now = Date.now();
  const ageMs = now - signalAtMs;
  const remainingMs = delayMs - ageMs;

  const emitDelayed = () => {
    try {
      io.except(PRO_NARRATIVE_ROOM).emit("sentinel:narrative", out);
    } catch (err) {
      console.warn("[narrativeSocket] delayed narrative emit failed:", err?.message || err);
    }
  };

  if (remainingMs <= 0) {
    emitDelayed();
    return;
  }

  const wait = Math.min(remainingMs, 24 * 60 * 60 * 1000);
  setTimeout(emitDelayed, wait).unref?.();
}

module.exports = {
  PRO_NARRATIVE_ROOM,
  emitNarrativeTiered,
  signalFeedFreeDelayMinutes
};
