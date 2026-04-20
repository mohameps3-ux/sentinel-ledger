"use strict";

function nowMs() {
  return Date.now();
}

function toInt(value, fallback, min) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.floor(n));
}

/**
 * Lightweight in-process circuit breaker (CLOSED -> OPEN -> HALF_OPEN).
 * Designed for external HTTP dependencies where fail-fast is preferable to
 * cascading retries during upstream incidents or rate-limit storms.
 */
function createCircuitBreaker(options = {}) {
  const cfg = {
    name: String(options.name || "breaker"),
    failureThreshold: toInt(options.failureThreshold, 5, 1),
    openMs: toInt(options.openMs, 30_000, 1_000),
    halfOpenMaxCalls: toInt(options.halfOpenMaxCalls, 2, 1),
    halfOpenSuccessThreshold: toInt(options.halfOpenSuccessThreshold, 2, 1)
  };

  let state = "CLOSED"; // CLOSED | OPEN | HALF_OPEN
  let failures = 0;
  let openedAt = null;
  let nextProbeAt = null;
  let halfOpenCalls = 0;
  let halfOpenSuccesses = 0;
  let lastError = null;
  let totalCalls = 0;
  let totalRejected = 0;

  function open(reason) {
    state = "OPEN";
    openedAt = nowMs();
    nextProbeAt = openedAt + cfg.openMs;
    halfOpenCalls = 0;
    halfOpenSuccesses = 0;
    if (reason) lastError = String(reason).slice(0, 240);
  }

  function close() {
    state = "CLOSED";
    failures = 0;
    openedAt = null;
    nextProbeAt = null;
    halfOpenCalls = 0;
    halfOpenSuccesses = 0;
  }

  function maybeMoveToHalfOpen() {
    if (state !== "OPEN") return;
    if (!nextProbeAt || nowMs() < nextProbeAt) return;
    state = "HALF_OPEN";
    halfOpenCalls = 0;
    halfOpenSuccesses = 0;
  }

  function snapshot() {
    return {
      name: cfg.name,
      state,
      failures,
      openedAt,
      nextProbeAt,
      lastError,
      totalCalls,
      totalRejected
    };
  }

  async function execute(fn) {
    totalCalls += 1;
    maybeMoveToHalfOpen();
    if (state === "OPEN") {
      totalRejected += 1;
      const err = new Error(`circuit_open:${cfg.name}`);
      err.code = "CIRCUIT_OPEN";
      throw err;
    }

    if (state === "HALF_OPEN" && halfOpenCalls >= cfg.halfOpenMaxCalls) {
      totalRejected += 1;
      const err = new Error(`circuit_half_open_throttled:${cfg.name}`);
      err.code = "CIRCUIT_HALF_OPEN_THROTTLED";
      throw err;
    }

    if (state === "HALF_OPEN") halfOpenCalls += 1;

    try {
      const out = await fn();
      if (state === "HALF_OPEN") {
        halfOpenSuccesses += 1;
        if (halfOpenSuccesses >= cfg.halfOpenSuccessThreshold) {
          close();
        }
      } else {
        failures = 0;
      }
      return out;
    } catch (e) {
      lastError = String(e?.message || e || "breaker_error").slice(0, 240);
      if (state === "HALF_OPEN") {
        open(lastError);
      } else {
        failures += 1;
        if (failures >= cfg.failureThreshold) open(lastError);
      }
      throw e;
    }
  }

  return { execute, snapshot, config: cfg };
}

module.exports = { createCircuitBreaker };

