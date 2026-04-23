"use strict";

const { runCalibrationOnce, getCalibrationSnapshot } = require("../services/signalCalibrator");

const TICK_MS_RAW = Number(process.env.SIGNAL_CALIBRATOR_TICK_MS || 6 * 60 * 60 * 1000);
const TICK_MS = Number.isFinite(TICK_MS_RAW) && TICK_MS_RAW >= 60_000 ? TICK_MS_RAW : 6 * 60 * 60 * 1000;

let intervalRef = null;
let lastTickStartedAt = null;
let lastTickFinishedAt = null;
let lastStats = { ok: false, proposals: 0, error: null };

function isEnabled() {
  return String(process.env.SIGNAL_CALIBRATOR_ENABLED || "true").toLowerCase() !== "false";
}

async function runSignalCalibratorTick() {
  if (!isEnabled()) return;
  lastTickStartedAt = Date.now();
  try {
    const res = await runCalibrationOnce();
    lastStats = {
      ok: Boolean(res?.ok),
      proposals: Array.isArray(res?.proposals) ? res.proposals.length : 0,
      error: res?.ok ? null : res?.reason || "calibration_failed"
    };
    if (res?.ok) {
      const top = (res.proposals || []).filter((p) => p.eligible).slice(0, 3);
      const topStr = top.map((x) => `${x.signal}:${x.suggestedWeight}`).join(", ");
      if (topStr) console.log(`[CALIBRATOR] proposals_ready ${topStr}`);
    } else {
      console.warn(`[CALIBRATOR] calibration_unavailable ${res?.reason || "unknown"}`);
    }
  } catch (e) {
    lastStats = { ok: false, proposals: 0, error: e?.message || "tick_failed" };
    console.warn("[CALIBRATOR] tick_exception:", e?.message || e);
  } finally {
    lastTickFinishedAt = Date.now();
  }
}

function getSignalCalibratorCronStatus() {
  return {
    cronEnabled: isEnabled(),
    tickIntervalMs: TICK_MS,
    lastTickStartedAt,
    lastTickFinishedAt,
    lastTickDurationMs:
      lastTickStartedAt && lastTickFinishedAt ? lastTickFinishedAt - lastTickStartedAt : null,
    lastStats,
    snapshot: getCalibrationSnapshot()
  };
}

function startSignalCalibratorCron(options = {}) {
  const { skipInitialTick = false } = options;
  if (intervalRef) return;
  if (!isEnabled()) {
    console.log("Signal calibrator cron disabled via SIGNAL_CALIBRATOR_ENABLED=false");
    return;
  }
  if (!skipInitialTick) {
    runSignalCalibratorTick().catch((e) =>
      console.warn("[CALIBRATOR] bootstrap_failed:", e?.message || e)
    );
  }
  intervalRef = setInterval(() => {
    runSignalCalibratorTick().catch((e) => console.warn("[CALIBRATOR] tick_failed:", e?.message || e));
  }, TICK_MS);
  if (intervalRef && typeof intervalRef.unref === "function") intervalRef.unref();
}

module.exports = {
  startSignalCalibratorCron,
  runSignalCalibratorTick,
  getSignalCalibratorCronStatus
};

