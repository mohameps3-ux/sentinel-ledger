"use strict";

const { runClusterBackfill } = require("../services/clusterBackfill");

const INTERVAL_MS = 6 * 60 * 60 * 1000;
let lastStats = null;

/**
 * Runs cluster backfill. Interval spacing is enforced by server `setInterval` only
 * (no time gate here — a throttle would skew the first tick vs startup run).
 */
async function runClusterBackfillCron() {
  try {
    const result = await runClusterBackfill();
    lastStats = { ...result, ranAt: new Date().toISOString() };
    console.log("[cluster-backfill-cron] done:", lastStats);
  } catch (e) {
    console.warn("[cluster-backfill-cron] error:", e?.message);
    lastStats = { ok: false, error: e?.message, ranAt: new Date().toISOString() };
  }
}

function getClusterBackfillStats() {
  return lastStats;
}

module.exports = { runClusterBackfillCron, getClusterBackfillStats, INTERVAL_MS };
