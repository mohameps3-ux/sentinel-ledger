"use strict";

/**
 * Sentinel Terminal Memory — privacy-first, local-only recall of the mints
 * the user has interacted with on the home feed.
 *
 * Purpose
 * -------
 * The home page is a firehose. Without memory, a user who pinned a token
 * yesterday has no way to know "the whale that woke up is back" or "this
 * one broke out since the last time I looked". This module gives each
 * browser a small, bounded, never-server-synced store that backs those
 * tactical micro-cues — the [BREAKOUT] and [REPEATED] chips plus the
 * pinned-card tint.
 *
 * Why no backend, no cookies, no analytics
 * ----------------------------------------
 *  - GDPR / privacy by design: we literally can't leak what we never
 *    transmit. The user's watchlist lives on their device only.
 *  - Zero infrastructure cost. No DB, no auth, no sync endpoint.
 *  - Works for anonymous visitors; pinning doesn't require sign-up, so
 *    first-session users get value immediately.
 *
 * Threat model (and how we handle it)
 * -----------------------------------
 * localStorage is *untrusted input*. A malicious browser extension,
 * another origin that somehow got access, a corrupted disk, or an older
 * version of our own code can all write garbage. We treat every read as
 * adversarial:
 *  - Payload shape is validated structurally (root must be an object with
 *    the expected version sentinel; every entry is sanitized field-by-field).
 *  - Keys must match a tight Solana pubkey regex (base58, 32–44 chars).
 *    This kills prototype-pollution-style keys (`__proto__`, `constructor`,
 *    `toString`, numeric strings, etc.) by construction.
 *  - Numeric fields are parsed with `Number()`, checked with
 *    `Number.isFinite`, clamped, and rejected if obviously bogus
 *    (future-dated timestamps beyond a grace window suggest tampering
 *    or clock-skew; we throw them out).
 *  - Booleans require strict `=== true` to avoid truthy coercion
 *    (`{isWatched: "yes"}` → false, as it should).
 *  - Any failure path falls through to an empty in-memory state; the app
 *    renders normally with no memory features. Never crash the host app
 *    because of broken local data.
 *
 * Durability, bounds, and cross-tab behavior
 * ------------------------------------------
 *  - The store caps at `MAX_ENTRIES` (100). When the cap is exceeded (or
 *    the browser raises `QuotaExceededError` on write), we prune with an
 *    LRU-ish policy that prefers keeping watched entries and, among the
 *    rest, the most recently touched. Watched entries never get pruned
 *    unless the overall watched count itself exceeds the cap — defense
 *    in depth against a pathological user who pins 101+ tokens.
 *  - Writes are debounced (`WRITE_DEBOUNCE_MS`) so a storm of socket
 *    updates coalesces into a single serialize+setItem cycle.
 *  - `visibilitychange`/`pagehide` force-flush the pending write so a
 *    user who closes the tab doesn't lose a freshly-clicked pin.
 *  - Cross-tab coherence: we listen on the `storage` event; a write from
 *    another tab triggers a reload+notify here. Our own writes don't
 *    fire that event (browser spec), so no self-loop.
 *
 * React integration
 * -----------------
 * This module exports plain functions only (no React). The companion
 * hook `useTerminalMemoryEntry(mint)` wraps `subscribe` + `getEntry`
 * with `useSyncExternalStore`, which handles SSR snapshots, concurrent-
 * mode tearing, and reference-stable selection automatically. Entries
 * are treated as immutable: mutations replace the Map value with a new
 * object, so `Object.is` comparison in React correctly distinguishes
 * "changed" from "not changed" without the caller memoizing anything.
 */

const STORAGE_KEY = "sentinel.memory.v1";
const STORAGE_VERSION = 1;
const MAX_ENTRIES = 100;
const WRITE_DEBOUNCE_MS = 250;
const FUTURE_TS_GRACE_MS = 60_000;
const MINT_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const DEV = typeof process !== "undefined" && process.env.NODE_ENV !== "production";

// Module-level reactive state. `rev` is bumped on any change so
// `useSyncExternalStore` consumers that don't care about a specific entry
// (e.g. a future "memory panel") can subscribe at the collection level.
let state = { entries: new Map(), rev: 0 };
const listeners = new Set();
let writeTimer = null;
let initialized = false;

function nowTs() {
  return Date.now();
}

function isValidMint(value) {
  return typeof value === "string" && MINT_REGEX.test(value);
}

/**
 * Convert an arbitrary object read from localStorage into a canonical,
 * defensively-validated Entry, or null if it fails validation.
 */
function sanitizeEntry(raw, now) {
  if (!raw || typeof raw !== "object") return null;
  const isWatched = raw.isWatched === true;

  let lastSeenScore = null;
  const s = Number(raw.lastSeenScore);
  if (Number.isFinite(s)) {
    lastSeenScore = Math.max(0, Math.min(100, Math.round(s)));
  }

  let firstDiscoveredAt = null;
  const d = Number(raw.firstDiscoveredAt);
  if (Number.isFinite(d) && d > 0 && d <= now + FUTURE_TS_GRACE_MS) {
    firstDiscoveredAt = Math.floor(d);
  }

  let lastSeenAt = null;
  const l = Number(raw.lastSeenAt);
  if (Number.isFinite(l) && l > 0 && l <= now + FUTURE_TS_GRACE_MS) {
    lastSeenAt = Math.floor(l);
  }

  // Drop entries with no actionable data — they just bloat the store.
  if (!isWatched && lastSeenScore == null && firstDiscoveredAt == null && lastSeenAt == null) {
    return null;
  }

  return { isWatched, lastSeenScore, firstDiscoveredAt, lastSeenAt };
}

function loadFromStorage() {
  if (typeof window === "undefined") return;
  let parsed;
  try {
    const text = window.localStorage.getItem(STORAGE_KEY);
    if (!text) return;
    parsed = JSON.parse(text);
  } catch (_) {
    return;
  }
  if (!parsed || typeof parsed !== "object" || parsed.__v !== STORAGE_VERSION) return;
  const entries = parsed.entries;
  if (!entries || typeof entries !== "object") return;

  const now = nowTs();
  const next = new Map();
  // `Object.keys` only enumerates own string keys — this is the main line
  // of defense against prototype pollution keys sneaking into the Map.
  for (const key of Object.keys(entries)) {
    if (!isValidMint(key)) continue;
    const clean = sanitizeEntry(entries[key], now);
    if (clean) next.set(key, clean);
  }
  if (next.size > MAX_ENTRIES) pruneInPlace(next, MAX_ENTRIES);
  state = { entries: next, rev: state.rev + 1 };
}

/**
 * In-place LRU-ish prune. Keeps watched entries preferentially; within
 * watched-vs-not, newer `lastSeenAt`/`firstDiscoveredAt` wins.
 */
function pruneInPlace(map, cap) {
  if (map.size <= cap) return;
  const arr = Array.from(map.entries());
  arr.sort((a, b) => {
    const aw = a[1].isWatched ? 1 : 0;
    const bw = b[1].isWatched ? 1 : 0;
    if (aw !== bw) return bw - aw;
    const at = a[1].lastSeenAt || a[1].firstDiscoveredAt || 0;
    const bt = b[1].lastSeenAt || b[1].firstDiscoveredAt || 0;
    return bt - at;
  });
  map.clear();
  for (let i = 0; i < Math.min(cap, arr.length); i++) {
    map.set(arr[i][0], arr[i][1]);
  }
}

function serialize() {
  const out = {};
  for (const [k, v] of state.entries) out[k] = v;
  return JSON.stringify({ __v: STORAGE_VERSION, entries: out });
}

function flushWrite() {
  if (typeof window === "undefined") return;
  if (state.entries.size > MAX_ENTRIES) pruneInPlace(state.entries, MAX_ENTRIES);
  try {
    window.localStorage.setItem(STORAGE_KEY, serialize());
  } catch (e) {
    // Quota exceeded or similar. Prune aggressively and retry once; if
    // that fails too, give up silently — the in-memory state still works
    // for this session and we don't crash the app over a storage failure.
    if (e && (e.name === "QuotaExceededError" || e.code === 22 || e.code === 1014)) {
      pruneInPlace(state.entries, Math.floor(MAX_ENTRIES / 2));
      try {
        window.localStorage.setItem(STORAGE_KEY, serialize());
      } catch (_) {
        // swallow
      }
    }
  }
}

function scheduleWrite() {
  if (typeof window === "undefined") return;
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    flushWrite();
  }, WRITE_DEBOUNCE_MS);
}

function forceFlush() {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  flushWrite();
}

function notify() {
  state = { entries: state.entries, rev: state.rev + 1 };
  // Copy to array so listeners that unsubscribe during notify don't
  // mutate the iterator.
  const snapshot = Array.from(listeners);
  for (let i = 0; i < snapshot.length; i++) {
    try { snapshot[i](); } catch (_) { /* isolate subscribers */ }
  }
}

function ensureInit() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  loadFromStorage();

  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    // Reload from disk and notify local subscribers. Our own writes do
    // not fire this event (per the storage event spec), so there is no
    // feedback loop.
    loadFromStorage();
    notify();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) forceFlush();
  });

  // `pagehide` is more reliable than `beforeunload` on mobile Safari and
  // during bfcache transitions. Synchronous flush in a handler is fine
  // because our payload is small (~10 KB cap).
  window.addEventListener("pagehide", forceFlush);
}

/**
 * Subscribe to any change in the memory store. Returns an unsubscribe fn.
 */
export function subscribe(fn) {
  ensureInit();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Returns the Entry for `mint`, or null. Reference is stable across
 * renders until the entry itself is mutated — safe to use as a
 * `useSyncExternalStore` snapshot without further memoization.
 */
export function getEntry(mint) {
  ensureInit();
  if (!isValidMint(mint)) return null;
  return state.entries.get(mint) || null;
}

function upsertEntry(mint, mutator) {
  if (!isValidMint(mint)) return;
  ensureInit();
  const prev = state.entries.get(mint) || null;
  const next = mutator(prev);
  if (!next) {
    if (prev) {
      state.entries.delete(mint);
      scheduleWrite();
      notify();
    }
    return;
  }
  if (
    prev &&
    prev.isWatched === next.isWatched &&
    prev.lastSeenScore === next.lastSeenScore &&
    prev.firstDiscoveredAt === next.firstDiscoveredAt &&
    prev.lastSeenAt === next.lastSeenAt
  ) {
    return; // nothing actually changed; skip write + notify
  }
  state.entries.set(mint, next);
  scheduleWrite();
  notify();
}

/**
 * Flip the `isWatched` flag for `mint`. Creates an entry if missing.
 * Bumps `lastSeenAt` so the entry is fresh for LRU purposes.
 */
export function togglePin(mint) {
  upsertEntry(mint, (prev) => {
    const now = nowTs();
    if (!prev) {
      return {
        isWatched: true,
        lastSeenScore: null,
        firstDiscoveredAt: now,
        lastSeenAt: now
      };
    }
    return { ...prev, isWatched: !prev.isWatched, lastSeenAt: now };
  });
}

/**
 * Record that the user's session has observed `score` for `mint`. Creates
 * an entry silently on first sight (not watched). Preserves
 * `firstDiscoveredAt` across updates.
 */
export function recordSeen(mint, score) {
  if (!Number.isFinite(Number(score))) return;
  const rounded = Math.max(0, Math.min(100, Math.round(Number(score))));
  upsertEntry(mint, (prev) => {
    const now = nowTs();
    if (!prev) {
      return {
        isWatched: false,
        lastSeenScore: rounded,
        firstDiscoveredAt: now,
        lastSeenAt: now
      };
    }
    return {
      ...prev,
      lastSeenScore: rounded,
      lastSeenAt: now,
      firstDiscoveredAt: prev.firstDiscoveredAt || now
    };
  });
}

if (DEV && typeof window !== "undefined") {
  window.__sentinelMemory = () => ({
    size: state.entries.size,
    max: MAX_ENTRIES,
    watched: Array.from(state.entries.values()).filter((v) => v.isWatched).length,
    entries: Object.fromEntries(state.entries)
  });
  window.__sentinelMemoryReset = () => {
    state = { entries: new Map(), rev: state.rev + 1 };
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
    notify();
  };
}
