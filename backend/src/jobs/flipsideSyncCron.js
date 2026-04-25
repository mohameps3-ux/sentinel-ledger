"use strict";

const { syncFlipsideSmartWallets, isFlipsideConfigured } = require("../services/flipsideService");

const TICK_MS_RAW = Number(process.env.FLIPSIDE_SYNC_TICK_MS || 24 * 60 * 60 * 1000);
const TICK_MS = Number.isFinite(TICK_MS_RAW) && TICK_MS_RAW >= 60 * 60 * 1000 ? TICK_MS_RAW : 24 * 60 * 60 * 1000;

let intervalRef = null;
let lastTickStartedAt = null;
let lastTickFinishedAt = null;
let lastStats = { fetched: 0, inserted: 0, updated: 0, error: null };

function isEnabled() {
  return String(process.env.FLIPSIDE_SYNC_ENABLED || "false").toLowerCase() === "true";
}

async function runFlipsideSyncTick() {
  if (!isEnabled()) return;
  lastTickStartedAt = Date.now();
  try {
    if (!isFlipsideConfigured()) {
      lastStats = { fetched: 0, inserted: 0, updated: 0, error: "flipside_api_key_missing" };
      console.warn("[flipside-sync] skipped: FLIPSIDE_API_KEY missing or placeholder");
      return;
    }
    const stats = await syncFlipsideSmartWallets();
    lastStats = {
      fetched: Number(stats.fetched || 0),
      inserted: Number(stats.inserted || 0),
      updated: Number(stats.updated || 0),
      error: stats.ok ? null : stats.reason || "sync_failed"
    };
    console.log(
      `[flipside-sync] fetched=${lastStats.fetched} inserted=${lastStats.inserted} updated=${lastStats.updated}`
    );
  } catch (error) {
    lastStats = { ...lastStats, error: error?.message || "tick_failed" };
    console.warn("[flipside-sync] tick_exception:", error?.message || error);
  } finally {
    lastTickFinishedAt = Date.now();
  }
}

function getFlipsideSyncCronStatus() {
  return {
    cronEnabled: isEnabled(),
    configured: isFlipsideConfigured(),
    tickIntervalMs: TICK_MS,
    lastTickStartedAt,
    lastTickFinishedAt,
    lastTickDurationMs:
      lastTickStartedAt && lastTickFinishedAt ? lastTickFinishedAt - lastTickStartedAt : null,
    lastStats
  };
}

function startFlipsideSyncCron() {
  if (intervalRef) return;
  if (!isEnabled()) {
    console.log("Flipside sync cron disabled via FLIPSIDE_SYNC_ENABLED=false");
    return;
  }
  runFlipsideSyncTick().catch((e) => console.warn("[flipside-sync] bootstrap_failed:", e?.message || e));
  intervalRef = setInterval(() => {
    runFlipsideSyncTick().catch((e) => console.warn("[flipside-sync] tick_failed:", e?.message || e));
  }, TICK_MS);
  if (intervalRef && typeof intervalRef.unref === "function") intervalRef.unref();
}

module.exports = {
  startFlipsideSyncCron,
  runFlipsideSyncTick,
  getFlipsideSyncCronStatus
};
