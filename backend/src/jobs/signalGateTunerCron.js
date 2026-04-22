"use strict";

const { runSignalGateTunerOnce, getSignalGateTunerStatus } = require("../services/signalGateTuner");

const TICK_MS_RAW = Number(process.env.SIGNAL_GATE_ADAPTIVE_TICK_MS || 30 * 60 * 1000);
const TICK_MS = Number.isFinite(TICK_MS_RAW) && TICK_MS_RAW >= 60_000 ? TICK_MS_RAW : 30 * 60 * 1000;
const CRON_ENABLED =
  String(process.env.SIGNAL_GATE_ADAPTIVE_CRON_ENABLED || "true").toLowerCase() !== "false";

let intervalRef = null;

async function runSignalGateTunerTick() {
  return runSignalGateTunerOnce();
}

function startSignalGateTunerCron() {
  if (intervalRef) return;
  if (!CRON_ENABLED) {
    console.log("Signal gate tuner cron disabled via SIGNAL_GATE_ADAPTIVE_CRON_ENABLED=false");
    return;
  }
  runSignalGateTunerTick().catch((e) =>
    console.warn("[signal-gate-tuner] bootstrap_failed:", e?.message || e)
  );
  intervalRef = setInterval(() => {
    runSignalGateTunerTick().catch((e) =>
      console.warn("[signal-gate-tuner] tick_failed:", e?.message || e)
    );
  }, TICK_MS);
  if (intervalRef && typeof intervalRef.unref === "function") intervalRef.unref();
}

function getSignalGateTunerCronStatus() {
  return {
    cronEnabled: CRON_ENABLED,
    tickIntervalMs: TICK_MS,
    tuner: getSignalGateTunerStatus()
  };
}

module.exports = {
  startSignalGateTunerCron,
  runSignalGateTunerTick,
  getSignalGateTunerCronStatus
};

