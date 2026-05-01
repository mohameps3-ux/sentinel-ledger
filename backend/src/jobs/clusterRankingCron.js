"use strict";

const { updateClusterRanking } = require("../services/clusterRanking");

const INTERVAL_MS = 60 * 60 * 1000;
let lastStats = null;

async function runClusterRankingCron() {
  try {
    const result = await updateClusterRanking();
    lastStats = { ...result, ranAt: new Date().toISOString() };
    console.log("[cluster-ranking-cron] done:", lastStats);
  } catch (e) {
    console.warn("[cluster-ranking-cron] error:", e?.message);
    lastStats = { ok: false, error: e?.message };
  }
}

function getClusterRankingStats() {
  return lastStats;
}

module.exports = { runClusterRankingCron, getClusterRankingStats, INTERVAL_MS };
