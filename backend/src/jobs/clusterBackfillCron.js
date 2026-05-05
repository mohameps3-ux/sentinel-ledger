"use strict";

const { runClusterBackfill, buildWalletClusters } = require("../services/clusterBackfill");
const { updateClusterRanking } = require("../services/clusterRanking");
const { verifyLeadershipFence } = require("../services/leaderService");

const INTERVAL_MS = 6 * 60 * 60 * 1000;
let lastStats = null;

async function runClusterBackfillCron() {
  if (!(await verifyLeadershipFence())) {
    console.log("[cluster-backfill-cron] skip: not_leader");
    return;
  }
  try {
    const r1 = await runClusterBackfill();
    const r2 = await buildWalletClusters();
    const r3 = await updateClusterRanking();
    lastStats = {
      clusterIntel: r1,
      walletClusters: r2,
      ranking: r3,
      ranAt: new Date().toISOString()
    };
    console.log("[cluster-backfill-cron] done:", lastStats);
  } catch (e) {
    console.warn("[cluster-backfill-cron] error:", e?.message);
    lastStats = { ok: false, error: e?.message };
  }
}

function getClusterBackfillStats() {
  return lastStats;
}

module.exports = { runClusterBackfillCron, getClusterBackfillStats, INTERVAL_MS };
