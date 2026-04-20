/**
 * Shared coordinator for `GET /api/v1/scoring/latest/:asset` requests
 * originating from every `useScoreSocket` / `<LiveCardOverlay>` mounted on
 * the page (typically 20–50 on the home feed).
 *
 * Why this exists
 * ---------------
 * Without coordination, mounting 44 cards simultaneously fires 44 parallel
 * HTTP requests. That:
 *   - blows past the browser's 6-connection per-origin cap, queuing other
 *     fetches (images, analytics, other APIs) behind the burst;
 *   - re-fetches the same asset twice if it appears in both the Smart Money
 *     feed and the Heat-ranked grid (duplicated work on client AND server);
 *   - re-fetches when a card remounts after filter/strategy changes within
 *     seconds.
 *
 * All three are invisible to an engineer who only tests with 1–2 cards. They
 * compound badly at real scale. This module fixes them with zero backend
 * changes.
 *
 * Guarantees
 * ----------
 *  1. Per-asset deduplication of in-flight requests. If N callers ask for
 *     the same asset while a fetch is pending, exactly one network request
 *     is issued and all N receive the same resolved payload.
 *  2. Concurrency cap (default 6, matching the browser's per-origin
 *     connection pool). Requests beyond the cap wait in a FIFO queue.
 *  3. Short-lived result cache (default 60 s TTL). A remount or a second
 *     consumer within the TTL window gets the cached answer instantly.
 *  4. Null-payload caching (for 404s / transient failures). Prevents retry
 *     storms while still letting a later socket event populate state.
 *  5. Zero backend dependency. When (if) a batch endpoint ever lands,
 *     swap the single fetch call inside `runJob` and every caller benefits.
 *
 * Non-goals
 * ---------
 *  - Long-term persistence (we rely on the socket for live updates).
 *  - Retries on failure (the socket is the source of truth; the cache entry
 *    turns `null` and we skip re-trying until TTL expires).
 *
 * Observability
 * -------------
 * In development, `window.__sentinelBootstrapStats()` returns live counters
 * so you can verify from the browser console that 44 card mounts produce at
 * most 6 in-flight fetches and zero duplicates.
 */

const CONCURRENCY = 6;
const RESULT_TTL_MS = 60_000;
const DEV = typeof process !== "undefined" && process.env.NODE_ENV !== "production";

let inFlight = 0;
const queue = [];
const cache = new Map(); // asset -> { at: number, payload: object | null }
const pending = new Map(); // asset -> Promise<object|null>

let totalRequests = 0;
let totalCacheHits = 0;
let totalDedupeHits = 0;

function now() {
  return Date.now();
}

function schedule() {
  while (inFlight < CONCURRENCY && queue.length > 0) {
    const run = queue.shift();
    run();
  }
}

async function performFetch(asset, apiBase) {
  try {
    const res = await fetch(
      `${apiBase}/api/v1/scoring/latest/${encodeURIComponent(asset)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null; // 404 is expected for assets without recent activity.
    const body = await res.json();
    const payload = body?.score;
    // Guard against mint mismatch from a misbehaving upstream.
    if (!payload || typeof payload !== "object" || payload.asset !== asset) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

/**
 * Fetch (or return cached) latest scoring payload for an asset.
 * @param {string} asset    Solana mint. Falsy values resolve to null.
 * @param {string} apiBase  Public API base URL (from `getPublicApiUrl()`).
 * @returns {Promise<object|null>}
 */
export function bootstrapScore(asset, apiBase) {
  if (!asset) return Promise.resolve(null);

  const cached = cache.get(asset);
  if (cached && now() - cached.at < RESULT_TTL_MS) {
    totalCacheHits += 1;
    return Promise.resolve(cached.payload);
  }

  const inflight = pending.get(asset);
  if (inflight) {
    totalDedupeHits += 1;
    return inflight;
  }

  const promise = new Promise((resolve) => {
    const runJob = async () => {
      inFlight += 1;
      totalRequests += 1;
      try {
        const payload = await performFetch(asset, apiBase);
        cache.set(asset, { at: now(), payload });
        resolve(payload);
      } finally {
        inFlight -= 1;
        pending.delete(asset);
        schedule();
      }
    };
    queue.push(runJob);
    schedule();
  });

  pending.set(asset, promise);
  return promise;
}

/**
 * Force-invalidate a cached entry so the next consumer re-fetches. Intended
 * for rare flows (e.g. after a user-triggered rescoring). Not used by the
 * normal subscribe path, which relies on socket pushes for freshness.
 */
export function invalidateScoreBootstrap(asset) {
  if (!asset) return;
  cache.delete(asset);
}

if (DEV && typeof window !== "undefined") {
  window.__sentinelBootstrapStats = () => ({
    inFlight,
    queued: queue.length,
    cached: cache.size,
    pending: pending.size,
    totalRequests,
    totalCacheHits,
    totalDedupeHits,
    concurrency: CONCURRENCY,
    ttlMs: RESULT_TTL_MS
  });
}
