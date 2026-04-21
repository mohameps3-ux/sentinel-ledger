"use strict";

const express = require("express");
const { getEntropyGuardOpsSnapshot } = require("../ingestion/entropyGuard");
const { getSignalPerformanceSummary } = require("../services/signalPerformance");
const { runCalibrationOnce, getCalibrationSnapshot } = require("../services/signalCalibrator");
const {
  getLatestSignalsFallbackOpsSnapshot,
  getSignalsSupabaseSloOpsSnapshot,
  getDataFreshnessSnapshot
} = require("../services/homeTerminalApi");
const { getOpsHeartbeatCronStatus, runOpsHeartbeatTick } = require("../jobs/opsHeartbeatCron");
const {
  getMarketSnapshotWarmupStatus,
  runMarketSnapshotWarmupTick
} = require("../jobs/marketSnapshotWarmupCron");
const {
  getSmartWalletSignalBackfillStatus,
  runSmartWalletSignalBackfillTick
} = require("../jobs/smartWalletSignalBackfillCron");

const router = express.Router();

function assertOpsAuth(req, res, next) {
  const expected = process.env.OMNI_BOT_OPS_KEY;
  if (!expected) return res.status(503).json({ ok: false, error: "ops_key_not_configured" });
  const provided = String(req.headers["x-ops-key"] || "").trim();
  if (!provided || provided !== expected) return res.status(401).json({ ok: false, error: "unauthorized" });
  return next();
}

/**
 * Read-only snapshot for Entropy Guard observability.
 * Contract intentionally stable for Ops dashboards.
 */
router.get("/entropy-guard/snapshot", assertOpsAuth, (_req, res) => {
  return res.json(getEntropyGuardOpsSnapshot());
});

router.get("/signals-latest-fallback/snapshot", assertOpsAuth, (_req, res) => {
  return res.json(getLatestSignalsFallbackOpsSnapshot());
});

router.get("/signals-supabase-slo/snapshot", assertOpsAuth, (_req, res) => {
  return res.json(getSignalsSupabaseSloOpsSnapshot());
});

router.get("/data-freshness", assertOpsAuth, (_req, res) => {
  return res.json({ ok: true, data: getDataFreshnessSnapshot() });
});

router.get("/heartbeat/status", assertOpsAuth, (_req, res) => {
  return res.json({ ok: true, data: getOpsHeartbeatCronStatus() });
});

router.post("/heartbeat/run", assertOpsAuth, async (_req, res) => {
  await runOpsHeartbeatTick();
  return res.json({ ok: true, data: getOpsHeartbeatCronStatus() });
});

router.get("/market-snapshot-warmup/status", assertOpsAuth, (_req, res) => {
  return res.json({ ok: true, data: getMarketSnapshotWarmupStatus() });
});

router.post("/market-snapshot-warmup/run", assertOpsAuth, async (_req, res) => {
  await runMarketSnapshotWarmupTick();
  return res.json({ ok: true, data: getMarketSnapshotWarmupStatus() });
});

router.get("/smart-signal-backfill/status", assertOpsAuth, (_req, res) => {
  return res.json({ ok: true, data: getSmartWalletSignalBackfillStatus() });
});

router.post("/smart-signal-backfill/run", assertOpsAuth, async (_req, res) => {
  await runSmartWalletSignalBackfillTick();
  return res.json({ ok: true, data: getSmartWalletSignalBackfillStatus() });
});

router.get("/signal-performance/summary", assertOpsAuth, async (req, res) => {
  const lookbackHours = Number(req.query.lookbackHours || 48);
  const maxRows = Number(req.query.maxRows || 2000);
  const summary = await getSignalPerformanceSummary({ lookbackHours, maxRows });
  if (!summary?.ok) {
    return res.status(503).json({ ok: false, error: summary?.error || "signal_perf_unavailable" });
  }
  return res.json({ ok: true, data: summary });
});

router.get("/signal-performance/calibration", assertOpsAuth, (_req, res) => {
  return res.json({ ok: true, data: getCalibrationSnapshot() });
});

router.post("/signal-performance/calibration/run", assertOpsAuth, async (req, res) => {
  const lookbackHours = Number(req.body?.lookbackHours || 72);
  const minSamplesPerSignal = Number(req.body?.minSamplesPerSignal || 30);
  const maxDeltaPct = Number(req.body?.maxDeltaPct || 0.35);
  const out = await runCalibrationOnce({ lookbackHours, minSamplesPerSignal, maxDeltaPct });
  if (!out?.ok) return res.status(503).json({ ok: false, error: out?.reason || "calibration_failed" });
  return res.json({ ok: true, data: out });
});

module.exports = router;

