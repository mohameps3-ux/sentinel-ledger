"use strict";

const express = require("express");
const { getClientTelemetrySummary, recordClientTelemetryEvent } = require("../services/clientTelemetry");

const router = express.Router();

function assertOpsAuth(req, res, next) {
  const expected = process.env.OMNI_BOT_OPS_KEY;
  if (!expected) return res.status(503).json({ ok: false, error: "ops_key_not_configured" });
  const provided = String(req.headers["x-ops-key"] || "").trim();
  if (!provided || provided !== expected) return res.status(401).json({ ok: false, error: "unauthorized" });
  return next();
}

router.post("/client", async (req, res) => {
  try {
    const event = req.body?.event;
    const result = await recordClientTelemetryEvent(event);
    if (!result.ok) return res.status(400).json({ ok: false, error: result.reason });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "telemetry_failed" });
  }
});

router.get("/client/summary", assertOpsAuth, async (_req, res) => {
  try {
    const summary = await getClientTelemetrySummary();
    return res.json({ ok: true, summary });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "telemetry_summary_failed" });
  }
});

module.exports = router;
