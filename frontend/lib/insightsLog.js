"use strict";

/**
 * Sentinel Insights Log — rolling, per-asset, local-only activity record.
 *
 * Purpose
 * -------
 * The backend `sentinel:score` stream emits a *snapshot* of the current
 * engine verdict each time any signal fires or decays. Consumers such as
 * `ScoreTerminalCard` have historically only rendered the latest snapshot,
 * so the "how did we get here?" narrative was lost the moment a new event
 * replaced it.
 *
 * This module gives each browser a bounded, structured *timeline* of
 * changes derived from consecutive score snapshots — the kind of trail a
 * quant analyst actually reads when reverse-engineering a move:
 *
 *     14:02:01  [WHALE] detected
 *     14:05:12  [CLUSTER] activated
 *     14:05:15  Confidence boost  72 → 88
 *
 * It is the foundation for Phase 4 ("Proof of Accuracy") without shipping
 * any backend infrastructure.
 *
 * Storage & bounds
 * ----------------
 * Persisted to `localStorage` under its own key (`sentinel.insights.v1`),
 * intentionally *separate* from Terminal Memory so the two stores cannot
 * corrupt each other through schema drift or quota races.
 *
 *   - Per-asset ring buffer: `MAX_PER_ASSET` (30) entries. Oldest drop first.
 *   - Total asset cap:       `MAX_ASSETS` (20). LRU by most-recent-entry
 *                            timestamp; watched mints have no special
 *                            protection here because this store is
 *                            observation-only (Terminal Memory owns pins).
 *
 * Absolute upper bound is ~600 entries × ~150 B = ~90 KB — well inside the
 * 5 MB localStorage budget even if Terminal Memory is full.
 *
 * Dedup
 * -----
 * Every entry carries a deterministic `id` derived from its content,
 * bucketed to whole-second resolution. Re-observations of the same score
 * (e.g. bootstrap cache returning the same payload after a refresh) produce
 * identical ids, so the appender silently rejects them. This makes the
 * recorder safely idempotent across remounts, navigation, and bfcache.
 *
 * Threat model (same stance as Terminal Memory)
 * ---------------------------------------------
 * localStorage is untrusted input. Every entry read from disk is
 * sanitized field-by-field against a strict schema:
 *   - type           : enum whitelist (rejects unknown strings).
 *   - signal         : regex `/^[a-z0-9_]{2,40}$/`. Kills DOM-attack and
 *                      prototype-pollution-shaped keys by construction.
 *   - from/to/delta  : Number.isFinite + clamp [0, 100] for confidence
 *                      values, [-100, 100] for deltas.
 *   - t (epoch ms)   : must be finite, within (year-2024, now + 60s).
 *                      Timestamps in the far future or before the product
 *                      existed are rejected — they indicate clock skew,
 *                      disk corruption, or tampering.
 *   - id             : structural check only; reconstructed on next write
 *                      if it drifts from canonical form.
 * Mint keys must match the base58 Solana regex; anything else is ignored.
 *
 * Any parse/validation failure falls through to an empty in-memory state.
 * The app keeps rendering; the log starts accumulating fresh entries.
 *
 * React integration
 * -----------------
 * This module exposes plain functions only. The companion hook
 * `useInsightsLog(mint)` wraps `subscribe` + `getLog` with
 * `useSyncExternalStore`, providing SSR-safe snapshots and
 * reference-stable output (array identity changes only when the specific
 * mint's log actually mutates).
 */

const STORAGE_KEY = "sentinel.insights.v1";
const STORAGE_VERSION = 1;
const MAX_PER_ASSET = 30;
const MAX_ASSETS = 20;
const WRITE_DEBOUNCE_MS = 300;
const FUTURE_TS_GRACE_MS = 60_000;
const MIN_TS = Date.UTC(2024, 0, 1); // product cannot predate this
const MINT_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SIGNAL_REGEX = /^[a-z0-9_]{2,40}$/;
const DEV = typeof process !== "undefined" && process.env.NODE_ENV !== "production";

export const INSIGHT_TYPES = Object.freeze([
  "signal_fired",
  "signal_faded",
  "confidence_jump",
  "confidence_drop"
]);

const TYPE_SET = new Set(INSIGHT_TYPES);

// `rev` bumps on every mutation, giving us a cheap collection-level
// invalidation signal for future consumers that care about "any change"
// rather than a specific mint.
let state = { logs: new Map(), rev: 0 };
const listeners = new Set();
let writeTimer = null;
let initialized = false;

function isValidMint(v) {
  return typeof v === "string" && MINT_REGEX.test(v);
}

function clampPct(n, lo, hi) {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

function sanitizeSignal(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  return SIGNAL_REGEX.test(trimmed) ? trimmed : null;
}

function sanitizeTimestamp(raw, now) {
  const v = Number(raw);
  if (!Number.isFinite(v)) return null;
  if (v < MIN_TS) return null;
  if (v > now + FUTURE_TS_GRACE_MS) return null;
  return Math.floor(v);
}

/**
 * Build the canonical, deterministic id for an entry. Same content →
 * same id. Bucketed to whole-second precision so two emissions of the
 * same underlying engine event collapse into one log row.
 */
function canonicalId(entry) {
  const secBucket = Math.floor(entry.t / 1000);
  if (entry.type === "signal_fired" || entry.type === "signal_faded") {
    return `${entry.type}:${entry.signal}:${secBucket}`;
  }
  if (entry.type === "confidence_jump" || entry.type === "confidence_drop") {
    return `${entry.type}:${entry.from}:${entry.to}:${secBucket}`;
  }
  return `${entry.type}:${secBucket}`;
}

/**
 * Validate one entry end-to-end. Returns a frozen canonical entry or null.
 */
function sanitizeEntry(raw, now) {
  if (!raw || typeof raw !== "object") return null;
  if (!TYPE_SET.has(raw.type)) return null;

  const t = sanitizeTimestamp(raw.t, now);
  if (t == null) return null;

  let entry;
  if (raw.type === "signal_fired" || raw.type === "signal_faded") {
    const signal = sanitizeSignal(raw.signal);
    if (!signal) return null;
    entry = { type: raw.type, signal, t };
  } else if (raw.type === "confidence_jump" || raw.type === "confidence_drop") {
    const from = clampPct(raw.from, 0, 100);
    const to = clampPct(raw.to, 0, 100);
    if (from == null || to == null) return null;
    const delta = to - from;
    // Reject events that don't match their own polarity; a corrupted
    // `jump` with negative delta is meaningless and likely tampered.
    if (raw.type === "confidence_jump" && delta < 0) return null;
    if (raw.type === "confidence_drop" && delta > 0) return null;
    entry = { type: raw.type, from, to, delta, t };
  } else {
    return null;
  }
  entry.id = canonicalId(entry);
  return entry;
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
  const logs = parsed.logs;
  if (!logs || typeof logs !== "object") return;

  const now = Date.now();
  const next = new Map();
  for (const key of Object.keys(logs)) {
    if (!isValidMint(key)) continue;
    const arr = logs[key];
    if (!Array.isArray(arr)) continue;
    const cleaned = [];
    const seen = new Set();
    for (let i = 0; i < arr.length; i++) {
      const entry = sanitizeEntry(arr[i], now);
      if (!entry) continue;
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      cleaned.push(entry);
    }
    if (!cleaned.length) continue;
    // Enforce per-asset cap newest-first; trim if storage was tampered
    // to exceed the cap.
    cleaned.sort((a, b) => b.t - a.t);
    if (cleaned.length > MAX_PER_ASSET) cleaned.length = MAX_PER_ASSET;
    next.set(key, cleaned);
  }
  pruneAssets(next);
  state = { logs: next, rev: state.rev + 1 };
}

function pruneAssets(map) {
  if (map.size <= MAX_ASSETS) return;
  const arr = Array.from(map.entries());
  // LRU by newest entry timestamp per asset.
  arr.sort((a, b) => {
    const at = a[1][0]?.t || 0;
    const bt = b[1][0]?.t || 0;
    return bt - at;
  });
  map.clear();
  for (let i = 0; i < Math.min(MAX_ASSETS, arr.length); i++) {
    map.set(arr[i][0], arr[i][1]);
  }
}

function serialize() {
  const out = {};
  for (const [k, v] of state.logs) out[k] = v;
  return JSON.stringify({ __v: STORAGE_VERSION, logs: out });
}

function flushWrite() {
  if (typeof window === "undefined") return;
  pruneAssets(state.logs);
  try {
    window.localStorage.setItem(STORAGE_KEY, serialize());
  } catch (e) {
    if (e && (e.name === "QuotaExceededError" || e.code === 22 || e.code === 1014)) {
      // Halve bounds and retry once. If still fails, give up — in-memory
      // state keeps working for this session.
      for (const [k, v] of state.logs) {
        if (v.length > Math.floor(MAX_PER_ASSET / 2)) {
          v.length = Math.floor(MAX_PER_ASSET / 2);
          state.logs.set(k, v);
        }
      }
      while (state.logs.size > Math.floor(MAX_ASSETS / 2)) {
        const firstKey = state.logs.keys().next().value;
        state.logs.delete(firstKey);
      }
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
  state = { logs: state.logs, rev: state.rev + 1 };
  const snapshot = Array.from(listeners);
  for (let i = 0; i < snapshot.length; i++) {
    try { snapshot[i](); } catch (_) {}
  }
}

function ensureInit() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  loadFromStorage();

  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    loadFromStorage();
    notify();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) forceFlush();
  });
  window.addEventListener("pagehide", forceFlush);
}

export function subscribe(fn) {
  ensureInit();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const EMPTY = Object.freeze([]);

/**
 * Returns the log for `mint`, newest entry first. The returned array
 * reference is stable between mutations — safe to use as a
 * `useSyncExternalStore` snapshot without further memoization.
 */
export function getLog(mint) {
  ensureInit();
  if (!isValidMint(mint)) return EMPTY;
  return state.logs.get(mint) || EMPTY;
}

/**
 * Append a candidate entry to the rolling log for `mint`. The entry is
 * re-sanitized here (never trust a caller), deduplicated by canonical id,
 * and the buffer is kept at `MAX_PER_ASSET` newest-first. Returns the
 * resulting entry or null if rejected.
 */
export function appendEntry(mint, candidate) {
  if (!isValidMint(mint)) return null;
  ensureInit();
  const entry = sanitizeEntry(candidate, Date.now());
  if (!entry) return null;

  const prev = state.logs.get(mint) || EMPTY;
  // Dedup: scan is O(MAX_PER_ASSET) ≈ O(30), effectively O(1).
  for (let i = 0; i < prev.length; i++) {
    if (prev[i].id === entry.id) return null;
  }

  // Build a NEW array (don't mutate in place — consumers rely on
  // reference identity to detect change via Object.is in
  // useSyncExternalStore).
  const next = [entry, ...prev];
  if (next.length > MAX_PER_ASSET) next.length = MAX_PER_ASSET;

  state.logs.set(mint, next);
  scheduleWrite();
  notify();
  return entry;
}

/**
 * Clear the log for a single mint. Mostly for debugging / "start over"
 * UX in the terminal card.
 */
export function clearLog(mint) {
  if (!isValidMint(mint)) return;
  ensureInit();
  if (!state.logs.has(mint)) return;
  state.logs.delete(mint);
  scheduleWrite();
  notify();
}

if (DEV && typeof window !== "undefined") {
  window.__sentinelInsights = () => ({
    assets: state.logs.size,
    maxAssets: MAX_ASSETS,
    maxPerAsset: MAX_PER_ASSET,
    totalEntries: Array.from(state.logs.values()).reduce((n, arr) => n + arr.length, 0),
    logs: Object.fromEntries(
      Array.from(state.logs.entries()).map(([k, v]) => [k, v.length])
    )
  });
  window.__sentinelInsightsReset = () => {
    state = { logs: new Map(), rev: state.rev + 1 };
    try { window.localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    notify();
  };
}
