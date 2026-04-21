"use strict";

const express = require("express");
const { EXPORT_TYPE, signFreshnessHistoryExport } = require("../lib/freshnessSignedExport");
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
const {
  getDataFreshnessHistoryCronStatus,
  runDataFreshnessHistoryTick
} = require("../jobs/dataFreshnessHistoryCron");
const { getFreshnessHistory } = require("../services/freshnessHistoryStore");

const router = express.Router();

function assertOpsAuth(req, res, next) {
  const expected = process.env.OMNI_BOT_OPS_KEY;
  if (!expected) return res.status(503).json({ ok: false, error: "ops_key_not_configured" });
  const provided = String(req.headers["x-ops-key"] || "").trim();
  if (!provided || provided !== expected) return res.status(401).json({ ok: false, error: "unauthorized" });
  return next();
}

function escapeCsvCell(value) {
  if (value == null) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, "\"\"")}"`;
  return text;
}

function toCsv(rows = []) {
  const header = [
    "captured_at",
    "endpoint",
    "requests_24h",
    "real_ratio_24h",
    "static_fallback_rate_24h",
    "supabase_source_rate_24h",
    "slo_target",
    "slo_met",
    "source_breakdown_24h",
    "fallback_reason_breakdown_24h",
    "provider_used_breakdown_24h"
  ];
  const lines = [header.join(",")];
  for (const row of rows) {
    const line = [
      row?.captured_at,
      row?.endpoint,
      row?.requests_24h,
      row?.real_ratio_24h,
      row?.static_fallback_rate_24h,
      row?.supabase_source_rate_24h,
      row?.slo_target,
      row?.slo_met,
      row?.source_breakdown_24h || {},
      row?.fallback_reason_breakdown_24h || {},
      row?.provider_used_breakdown_24h || {}
    ]
      .map((cell) => escapeCsvCell(cell))
      .join(",");
    lines.push(line);
  }
  return lines.join("\n");
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

router.get("/data-freshness/history", assertOpsAuth, async (req, res) => {
  const endpoint = req.query.endpoint ? String(req.query.endpoint) : null;
  const hours = Number(req.query.hours || 24);
  const limit = Number(req.query.limit || 2000);
  const out = await getFreshnessHistory({ endpoint, hours, limit });
  if (!out?.ok) return res.status(503).json({ ok: false, error: out?.reason || "history_unavailable" });
  return res.json({ ok: true, data: out });
});

router.get("/data-freshness/history/export", assertOpsAuth, async (req, res) => {
  const endpoint = req.query.endpoint ? String(req.query.endpoint) : null;
  const hours = Number(req.query.hours || 24);
  const limit = Number(req.query.limit || 5000);
  const out = await getFreshnessHistory({ endpoint, hours, limit });
  if (!out?.ok) return res.status(503).json({ ok: false, error: out?.reason || "history_unavailable" });
  const csv = toCsv(out.rows || []);
  const endpointPart = out.endpoint || "all";
  const safeHours = Number(out.hours || 24);
  const filename = `data-freshness-history-${endpointPart}-${safeHours}h.csv`;
  res.setHeader("content-type", "text/csv; charset=utf-8");
  res.setHeader("content-disposition", `attachment; filename="${filename}"`);
  return res.status(200).send(csv);
});

router.get("/data-freshness/history/export/signed", assertOpsAuth, async (req, res) => {
  const endpoint = req.query.endpoint ? String(req.query.endpoint) : null;
  const hours = Number(req.query.hours || 24);
  const limit = Number(req.query.limit || 5000);
  const out = await getFreshnessHistory({ endpoint, hours, limit });
  if (!out?.ok) return res.status(503).json({ ok: false, error: out?.reason || "history_unavailable" });

  const nowIso = new Date().toISOString();
  const signed = signFreshnessHistoryExport({
    rows: out.rows || [],
    endpoint: out.endpoint == null ? "all" : out.endpoint,
    hours: Number(out.hours || 24),
    generatedAtIso: nowIso
  });
  if (!signed.ok) return res.status(503).json({ ok: false, error: signed.reason || "export_signing_key_missing" });

  const document = {
    ok: true,
    type: EXPORT_TYPE,
    generatedAt: signed.generatedAtIso,
    endpoint: signed.endpoint,
    hours: signed.hours,
    rowsCount: signed.rowsCount,
    integrity: signed.integrity,
    data: signed.data
  };
  const filename = `data-freshness-history-signed-${document.endpoint}-${document.hours}h.json`;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("content-disposition", `attachment; filename="${filename}"`);
  return res.status(200).send(JSON.stringify(document));
});

router.get("/data-freshness/history/status", assertOpsAuth, (_req, res) => {
  return res.json({ ok: true, data: getDataFreshnessHistoryCronStatus() });
});

router.post("/data-freshness/history/run", assertOpsAuth, async (_req, res) => {
  await runDataFreshnessHistoryTick();
  return res.json({ ok: true, data: getDataFreshnessHistoryCronStatus() });
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

