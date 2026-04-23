"use strict";

const { runCoordinationOutcomeResolutionOnce, getCoordinationOutcomeEnv } = require("../services/coordinationOutcomes");

const TICK_MS_RAW = Number(process.env.COORD_OUTCOME_TICK_MS || 60_000);
const TICK_MS = Number.isFinite(TICK_MS_RAW) && TICK_MS_RAW >= 30_000 ? TICK_MS_RAW : 60_000;

let intervalRef = null;
let lastTickStartedAt = null;
let lastTickFinishedAt = null;
let lastStats = { examined: 0, resolved: 0, deferred: 0, failed: 0, error: null };

function isEnabled() {
  return String(process.env.COORD_OUTCOME_CRON_ENABLED || "true").toLowerCase() !== "false";
}

/** True when both cron switch and COORD_OUTCOME_ENABLED allow resolution ticks (matches start guard). */
function isCoordinationResolutionActive() {
  return isEnabled() && getCoordinationOutcomeEnv().enabled;
}

function envSnapshot() {
  return {
    ...getCoordinationOutcomeEnv(),
    tickIntervalMs: TICK_MS
  };
}

function getCoordinationOutcomeCronStatus() {
  return {
    cronEnabled: isEnabled() && getCoordinationOutcomeEnv().enabled,
    ...envSnapshot(),
    lastTickStartedAt,
    lastTickFinishedAt,
    lastTickDurationMs:
      lastTickStartedAt && lastTickFinishedAt ? lastTickFinishedAt - lastTickStartedAt : null,
    lastStats
  };
}

async function runCoordinationOutcomeTick() {
  if (!isEnabled()) return;
  lastTickStartedAt = Date.now();
  try {
    const s = await runCoordinationOutcomeResolutionOnce();
    lastStats = { ...s, error: s?.error || null };
  } catch (e) {
    lastStats = { examined: 0, resolved: 0, deferred: 0, failed: 0, error: e?.message || "tick_exception" };
  } finally {
    lastTickFinishedAt = Date.now();
  }
}

function startCoordinationOutcomeCron(options = {}) {
  const { skipInitialTick = false } = options;
  if (intervalRef) return;
  if (!isEnabled() || !getCoordinationOutcomeEnv().enabled) {
    console.log("Coordination outcome cron disabled via COORD_OUTCOME_CRON_ENABLED=false or COORD_OUTCOME_ENABLED=false");
    return;
  }
  if (!skipInitialTick) {
    runCoordinationOutcomeTick().catch((e) =>
      console.warn("[coordination-outcome] bootstrap_failed:", e?.message || e)
    );
  }
  intervalRef = setInterval(() => {
    runCoordinationOutcomeTick().catch((e) => console.warn("[coordination-outcome] tick_failed:", e?.message || e));
  }, TICK_MS);
  if (intervalRef && typeof intervalRef.unref === "function") intervalRef.unref();
}

module.exports = {
  startCoordinationOutcomeCron,
  runCoordinationOutcomeTick,
  getCoordinationOutcomeCronStatus,
  isCoordinationResolutionActive
};
