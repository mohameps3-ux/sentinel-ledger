import { getPublicApiUrl } from "./publicRuntime";

/**
 * Module-level singleton that polls `/health/sync` on demand.
 *
 * Design goals:
 *   - Exactly ONE request per browser tab regardless of how many components
 *     consume the global health state (scales to any number of ScoreTerminalCards).
 *   - Starts polling only when the first subscriber registers; stops when the
 *     last unsubscribes (ref-counted). No wasted work on pages that don't care.
 *   - Pauses while the tab is hidden (visibilitychange) to save battery and
 *     avoid flooding the backend from background tabs.
 *   - Emits synchronously to subscribers on each update.
 *
 * State shape emitted to subscribers:
 *   {
 *     status: "LIVE" | "SYNCING" | "DEGRADED" | "OFFLINE" | null,
 *     reason: string | null,
 *     latencyMs: number | null,
 *     polledAt: number | null
 *   }
 */

const POLL_INTERVAL_MS = 30_000;
const FETCH_TIMEOUT_MS = 8_000;

const state = {
  status: null,
  reason: null,
  latencyMs: null,
  polledAt: null
};

const subscribers = new Set();
let timer = null;
let inFlight = false;
let visibilityBound = false;

function emit() {
  const snapshot = { ...state };
  for (const fn of subscribers) {
    try {
      fn(snapshot);
    } catch (_) {}
  }
}

async function pollOnce() {
  if (inFlight) return;
  inFlight = true;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => {
        try {
          controller.abort();
        } catch (_) {}
      }, FETCH_TIMEOUT_MS)
    : null;
  try {
    const res = await fetch(`${getPublicApiUrl()}/health/sync`, {
      cache: "no-store",
      signal: controller ? controller.signal : undefined
    });
    const body = await res.json();
    state.status = typeof body?.status === "string" ? body.status : null;
    state.reason = typeof body?.reason === "string" ? body.reason : null;
    state.latencyMs = Number.isFinite(body?.latency_ms) ? body.latency_ms : null;
    state.polledAt = Date.now();
  } catch (_) {
    state.status = "OFFLINE";
    state.reason = "health_unreachable";
    state.latencyMs = null;
    state.polledAt = Date.now();
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    inFlight = false;
    emit();
  }
}

function scheduleNext() {
  if (timer) clearTimeout(timer);
  if (typeof document !== "undefined" && document.hidden) {
    // Stay quiet while hidden; visibilitychange will kick us back on.
    timer = null;
    return;
  }
  timer = setTimeout(async () => {
    await pollOnce();
    if (subscribers.size > 0) scheduleNext();
  }, POLL_INTERVAL_MS);
}

function onVisibility() {
  if (subscribers.size === 0) return;
  if (typeof document === "undefined") return;
  if (document.hidden) {
    if (timer) clearTimeout(timer);
    timer = null;
  } else {
    // Wake up: poll immediately then resume the schedule.
    pollOnce().then(() => {
      if (subscribers.size > 0) scheduleNext();
    });
  }
}

function ensureVisibilityBinding() {
  if (visibilityBound) return;
  if (typeof document === "undefined") return;
  document.addEventListener("visibilitychange", onVisibility);
  visibilityBound = true;
}

const DEV = process.env.NODE_ENV !== "production";

function logSubscribers(action) {
  if (!DEV || typeof window === "undefined") return;
  // One-line console debug so you can verify in devtools that N tarjetas
  // share a single poller (count should never exceed your actual consumer
  // components; the poller runs once regardless).
  // eslint-disable-next-line no-console
  console.debug(
    `[globalHealth] ${action} · subscribers=${subscribers.size} · pollerActive=${Boolean(timer) || inFlight}`
  );
}

export function subscribeGlobalHealth(listener) {
  if (typeof listener !== "function") return () => {};
  subscribers.add(listener);
  logSubscribers("subscribe");
  // Replay current snapshot to the new subscriber immediately.
  try {
    listener({ ...state });
  } catch (_) {}
  if (subscribers.size === 1) {
    ensureVisibilityBinding();
    // Trigger an immediate poll, then schedule the loop.
    pollOnce().then(() => {
      if (subscribers.size > 0) scheduleNext();
    });
  }
  return () => {
    subscribers.delete(listener);
    logSubscribers("unsubscribe");
    if (subscribers.size === 0 && timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

/**
 * Debug helper exposed for ad-hoc inspection from the browser console:
 *   window.__sentinelHealthStats?.()
 */
export function getHealthStoreStats() {
  return {
    subscribers: subscribers.size,
    pollerActive: Boolean(timer) || inFlight,
    ...state
  };
}

if (DEV && typeof window !== "undefined") {
  // eslint-disable-next-line no-underscore-dangle
  window.__sentinelHealthStats = getHealthStoreStats;
}

export function getGlobalHealthSnapshot() {
  return { ...state };
}
