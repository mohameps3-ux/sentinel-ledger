"use strict";

/**
 * Edge deduplication for SentinelEvent ids.
 *
 * Built on top of `lib/cache.js` so we inherit the Upstash REST + in-memory fallback
 * already used everywhere. NX semantics: first writer wins, the rest are duplicates.
 *
 * Counters are kept in-memory for `/health/ingestion` and `/health/sync`; they are
 * intentionally process-local (Railway typically runs one backend instance and the
 * goal is freshness, not cross-instance accounting).
 */

const cache = require("../lib/cache");

const DEFAULT_TTL_SEC = 600; // 10 minutes — covers replays & re-processing windows.
const DEDUPE_PREFIX = "sentinel:dedupe:";

const counters = {
  attempts: 0,
  unique: 0,
  duplicates: 0,
  errors: 0,
  lastErrorAt: null,
  lastDuplicateId: null,
  lastUniqueAt: null
};

function dedupeKey(id) {
  return `${DEDUPE_PREFIX}${id}`;
}

/**
 * Reserve an event id atomically. Returns:
 *   { duplicate: false, reserved: true } when this caller wins the slot
 *   { duplicate: true,  reserved: false } when another caller already wrote the id
 *   { duplicate: false, reserved: false, error } on infra failure (caller may decide policy)
 *
 * @param {string} eventId
 * @param {{ ttlSec?: number }} [opts]
 */
async function reserveEventId(eventId, opts = {}) {
  if (typeof eventId !== "string" || !eventId) {
    throw new Error("dedupe_invalid_event_id");
  }
  counters.attempts += 1;
  const ttl = Number(opts.ttlSec) > 0 ? Math.floor(Number(opts.ttlSec)) : DEFAULT_TTL_SEC;
  try {
    const result = await cache.set(dedupeKey(eventId), "1", { nx: true, ex: ttl });
    if (result == null) {
      counters.duplicates += 1;
      counters.lastDuplicateId = eventId;
      return { duplicate: true, reserved: false };
    }
    counters.unique += 1;
    counters.lastUniqueAt = Date.now();
    return { duplicate: false, reserved: true };
  } catch (error) {
    counters.errors += 1;
    counters.lastErrorAt = Date.now();
    return { duplicate: false, reserved: false, error };
  }
}

/** Soft check (does not consume the slot). Useful for diagnostics; not for race-safe paths. */
async function isReserved(eventId) {
  if (!eventId) return false;
  try {
    const v = await cache.get(dedupeKey(eventId));
    return v != null;
  } catch (_) {
    return false;
  }
}

function getDedupeStats() {
  const dupRate =
    counters.attempts > 0 ? counters.duplicates / counters.attempts : 0;
  return {
    attempts: counters.attempts,
    unique: counters.unique,
    duplicates: counters.duplicates,
    errors: counters.errors,
    duplicateRate: Number(dupRate.toFixed(4)),
    lastErrorAt: counters.lastErrorAt,
    lastDuplicateId: counters.lastDuplicateId,
    lastUniqueAt: counters.lastUniqueAt,
    ttlSec: DEFAULT_TTL_SEC
  };
}

/** Test-only helper. Not exported via index by accident: callers must import explicitly. */
function _resetDedupeStats() {
  counters.attempts = 0;
  counters.unique = 0;
  counters.duplicates = 0;
  counters.errors = 0;
  counters.lastErrorAt = null;
  counters.lastDuplicateId = null;
  counters.lastUniqueAt = null;
}

module.exports = {
  reserveEventId,
  isReserved,
  getDedupeStats,
  _resetDedupeStats,
  DEDUPE_PREFIX,
  DEFAULT_TTL_SEC
};
