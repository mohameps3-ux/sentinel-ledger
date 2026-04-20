"use strict";

const { runSignalOutcomeResolutionOnce } = require("../services/signalPerformance");

const TICK_MS_RAW = Number(process.env.SIGNAL_PERF_TICK_MS || 60_000);
const TICK_MS = Number.isFinite(TICK_MS_RAW) && TICK_MS_RAW >= 30_000 ? TICK_MS_RAW : 60_000;

let intervalRef = null;
let lastTickStartedAt = null;
let lastTickFinishedAt = null;
let lastStats = { examined: 0, resolved: 0, deferred: 0, failed: 0, error: null };

function isEnabled() {
  return String(process.env.SIGNAL_PERF_CRON_ENABLED || "true").toLowerCase() !== "false";
}

async function runSignalOutcomeTick() {
  if (!isEnabled()) return;
  lastTickStartedAt = Date.now();
  try {
    const stats = await runSignalOutcomeResolutionOnce();
    lastStats = { ...stats, error: null };
  } catch (e) {
    lastStats = { ...lastStats, error: e?.message || "tick_failed" };
    console.warn("[signal-performance-cron] tick_exception:", e?.message || e);
  } finally {
    lastTickFinishedAt = Date.now();
  }
}

function getSignalOutcomeCronStatus() {
  return {
    cronEnabled: isEnabled(),
    tickIntervalMs: TICK_MS,
    lastTickStartedAt,
    lastTickFinishedAt,
    lastTickDurationMs:
      lastTickStartedAt && lastTickFinishedAt ? lastTickFinishedAt - lastTickStartedAt : null,
    lastStats
  };
}

function startSignalOutcomeCron() {
  if (intervalRef) return;
  if (!isEnabled()) {
    console.log("Signal outcome cron disabled via SIGNAL_PERF_CRON_ENABLED=false");
    return;
  }
  runSignalOutcomeTick().catch((e) =>
    console.warn("[signal-performance-cron] bootstrap_failed:", e?.message || e)
  );
  intervalRef = setInterval(() => {
    runSignalOutcomeTick().catch((e) =>
      console.warn("[signal-performance-cron] tick_failed:", e?.message || e)
    );
  }, TICK_MS);
  if (intervalRef && typeof intervalRef.unref === "function") intervalRef.unref();
}

module.exports = {
  startSignalOutcomeCron,
  runSignalOutcomeTick,
  getSignalOutcomeCronStatus
};

