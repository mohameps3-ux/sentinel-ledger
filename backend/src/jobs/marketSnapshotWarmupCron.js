"use strict";

const { listWarmupCandidateMints } = require("../services/marketSnapshots");
const { getMarketData } = require("../services/marketData");

const TICK_MS_RAW = Number(process.env.MARKET_SNAPSHOT_WARMUP_TICK_MS || 30_000);
const TICK_MS = Number.isFinite(TICK_MS_RAW) && TICK_MS_RAW >= 20_000 ? TICK_MS_RAW : 30_000;
const MINTS_PER_TICK_RAW = Number(process.env.MARKET_SNAPSHOT_WARMUP_MINTS_PER_TICK || 24);
const MINTS_PER_TICK = Number.isFinite(MINTS_PER_TICK_RAW)
  ? Math.min(80, Math.max(8, Math.floor(MINTS_PER_TICK_RAW)))
  : 24;

let intervalRef = null;
let lastTickStartedAt = null;
let lastTickFinishedAt = null;
let lastTickStats = {
  candidates: 0,
  attempted: 0,
  success: 0,
  failed: 0,
  fromSnapshot: 0,
  error: null
};

function isEnabled() {
  return String(process.env.MARKET_SNAPSHOT_WARMUP_ENABLED || "true").toLowerCase() !== "false";
}

async function runMarketSnapshotWarmupTick() {
  if (!isEnabled()) return;
  lastTickStartedAt = Date.now();
  try {
    const candidates = await listWarmupCandidateMints(MINTS_PER_TICK * 2);
    const sample = candidates.slice(0, MINTS_PER_TICK);
    let success = 0;
    let failed = 0;
    let fromSnapshot = 0;
    for (const mint of sample) {
      try {
        const md = await getMarketData(mint);
        if (md) {
          success += 1;
          if (md._source === "snapshot") fromSnapshot += 1;
        } else {
          failed += 1;
        }
      } catch (_) {
        failed += 1;
      }
    }
    lastTickStats = {
      candidates: candidates.length,
      attempted: sample.length,
      success,
      failed,
      fromSnapshot,
      error: null
    };
  } catch (e) {
    lastTickStats = {
      ...lastTickStats,
      error: e?.message || "warmup_failed"
    };
    console.warn("[market-snapshot-warmup] tick_exception:", e?.message || e);
  } finally {
    lastTickFinishedAt = Date.now();
  }
}

function getMarketSnapshotWarmupStatus() {
  return {
    cronEnabled: isEnabled(),
    tickIntervalMs: TICK_MS,
    mintsPerTick: MINTS_PER_TICK,
    lastTickStartedAt,
    lastTickFinishedAt,
    lastTickDurationMs:
      lastTickStartedAt && lastTickFinishedAt ? lastTickFinishedAt - lastTickStartedAt : null,
    lastTickStats
  };
}

function startMarketSnapshotWarmupCron() {
  if (intervalRef) return;
  if (!isEnabled()) {
    console.log("Market snapshot warmup cron disabled via MARKET_SNAPSHOT_WARMUP_ENABLED=false");
    return;
  }
  runMarketSnapshotWarmupTick().catch((e) =>
    console.warn("[market-snapshot-warmup] bootstrap_failed:", e?.message || e)
  );
  intervalRef = setInterval(() => {
    runMarketSnapshotWarmupTick().catch((e) =>
      console.warn("[market-snapshot-warmup] tick_failed:", e?.message || e)
    );
  }, TICK_MS);
  if (intervalRef && typeof intervalRef.unref === "function") intervalRef.unref();
}

module.exports = {
  startMarketSnapshotWarmupCron,
  runMarketSnapshotWarmupTick,
  getMarketSnapshotWarmupStatus
};
