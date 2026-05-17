"use strict";

/**
 * Aggregated, production-safe counters for recordOracleSignal outcomes.
 * Logs reason names + counts only (no mints, prices, or payloads).
 */

const WINDOW_MIN = Math.max(
  1,
  Math.min(60, Number(process.env.ORACLE_SYNC_TELEMETRY_WINDOW_MIN || 5))
);
const TICK_MS = WINDOW_MIN * 60 * 1000;

const COUNTERS = {
  ok: 0,
  no_rule: 0,
  missing_price: 0,
  supabase_unconfigured: 0,
  insert_failed: 0,
  dedupe: 0
};

let intervalRef = null;
let started = false;

function bump(key) {
  if (Object.prototype.hasOwnProperty.call(COUNTERS, key)) {
    COUNTERS[key] += 1;
  }
}

function tallyRecordOracleOutcome(out) {
  if (!out || typeof out !== "object") return;
  if (out.ok === true && out.dedupe === true) {
    bump("dedupe");
    return;
  }
  if (out.ok === true) {
    bump("ok");
    return;
  }
  const reason = String(out.reason || "").trim();
  if (reason === "no_rule") bump("no_rule");
  else if (reason === "missing_price") bump("missing_price");
  else if (reason === "supabase_unconfigured") bump("supabase_unconfigured");
  else if (reason === "insert_failed") bump("insert_failed");
  else bump("insert_failed");
}

function formatHeartbeatLine() {
  return (
    `[oracle-sync] window=${WINDOW_MIN}m ok=${COUNTERS.ok} no_rule=${COUNTERS.no_rule} ` +
    `missing_price=${COUNTERS.missing_price} insert_failed=${COUNTERS.insert_failed} ` +
    `dedupe=${COUNTERS.dedupe} supabase_unconfigured=${COUNTERS.supabase_unconfigured}`
  );
}

function resetCounters() {
  for (const key of Object.keys(COUNTERS)) {
    COUNTERS[key] = 0;
  }
}

function emitHeartbeat() {
  console.log(formatHeartbeatLine());
  resetCounters();
}

function startOracleInsertTelemetry() {
  if (started) return;
  started = true;
  emitHeartbeat();
  intervalRef = setInterval(emitHeartbeat, TICK_MS);
  if (intervalRef && typeof intervalRef.unref === "function") intervalRef.unref();
}

function ensureOracleInsertTelemetryStarted() {
  startOracleInsertTelemetry();
}

function getOracleInsertTelemetrySnapshot() {
  return { windowMin: WINDOW_MIN, counters: { ...COUNTERS }, started };
}

module.exports = {
  tallyRecordOracleOutcome,
  ensureOracleInsertTelemetryStarted,
  startOracleInsertTelemetry,
  getOracleInsertTelemetrySnapshot
};
