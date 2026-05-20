/** Free-tier live feed delay — must match backend SIGNAL_FEED_FREE_DELAY_MINUTES default. */
export const LIVE_FEED_FREE_DELAY_MS = 15 * 60 * 1000;

export function getLiveSignalEmittedAtMs(sig) {
  const raw = sig?._api?.createdAt ?? sig?._api?.signalAt ?? sig?.createdAt ?? sig?.signalAt ?? null;
  if (raw == null || raw === "") return null;
  const ms = Date.parse(String(raw));
  return Number.isFinite(ms) ? ms : null;
}

/** Free / no-wallet users only see signals at least 15 minutes old. */
export function filterLiveSignalsForFreeTier(signals, nowMs = Date.now()) {
  const cutoffMs = nowMs - LIVE_FEED_FREE_DELAY_MS;
  return (signals || []).filter((sig) => {
    const emittedMs = getLiveSignalEmittedAtMs(sig);
    if (emittedMs == null) return false;
    return emittedMs <= cutoffMs;
  });
}
