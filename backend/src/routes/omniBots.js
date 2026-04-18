const express = require("express");
const redis = require("../lib/cache");
const { getSupabase } = require("../lib/supabase");
const { handleSupportInbound } = require("../services/supportService");
const { sendOmniAlert } = require("../services/omniAlertsService");
const { getProAlertCronStatus, runProAlertTick } = require("../jobs/proAlertCron");

const router = express.Router();

function assertOpsAuth(req, res, next) {
  const expected = process.env.OMNI_BOT_OPS_KEY;
  if (!expected) return res.status(503).json({ ok: false, error: "ops_key_not_configured" });
  const provided = req.headers["x-ops-key"];
  if (provided !== expected) return res.status(401).json({ ok: false, error: "unauthorized" });
  next();
}

router.get("/health", async (_, res) => {
  return res.json({
    ok: true,
    service: "omni-bots",
    channels: ["telegram", "x", "webhook", "future:discord/slack"]
  });
});

router.post("/inbound", async (req, res) => {
  try {
    const { channel = "webhook", userId = "anonymous", message = "", metadata = {} } = req.body || {};
    if (!message) return res.status(400).json({ ok: false, error: "message_required" });

    const result = await handleSupportInbound({ channel, userId, message, metadata });
    return res.json({ ok: true, data: result });
  } catch (error) {
    console.error("Omni inbound failed:", error.message);
    return res.status(500).json({ ok: false, error: "omni_inbound_failed" });
  }
});

router.post("/alerts/broadcast", assertOpsAuth, async (req, res) => {
  try {
    const { title = "Sentinel Alert", message = "", channels = ["telegram"], severity = "info" } = req.body || {};
    if (!message) return res.status(400).json({ ok: false, error: "message_required" });
    const sent = await sendOmniAlert({ title, message, channels, severity });
    return res.json({ ok: true, data: sent });
  } catch (error) {
    console.error("Omni broadcast failed:", error.message);
    return res.status(500).json({ ok: false, error: "omni_broadcast_failed" });
  }
});

router.get("/tickets", assertOpsAuth, async (req, res) => {
  try {
    const limit = Math.min(100, Number(req.query.limit || 20));
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("support_tickets")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return res.json({ ok: true, data });
  } catch (error) {
    console.error("Omni tickets fetch failed:", error.message);
    return res.status(500).json({ ok: false, error: "omni_tickets_failed" });
  }
});

router.patch("/tickets/:id", assertOpsAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, priority } = req.body || {};
    if (!status && !priority) {
      return res.status(400).json({ ok: false, error: "status_or_priority_required" });
    }
    const updates = {};
    if (status) updates.status = status;
    if (priority) updates.priority = priority;

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("support_tickets")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return res.json({ ok: true, data });
  } catch (error) {
    console.error("Omni ticket update failed:", error.message);
    return res.status(500).json({ ok: false, error: "omni_ticket_update_failed" });
  }
});

router.get("/events", assertOpsAuth, async (req, res) => {
  try {
    const limit = Math.min(200, Number(req.query.limit || 50));
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("bot_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return res.json({ ok: true, data });
  } catch (error) {
    console.error("Omni events fetch failed:", error.message);
    return res.status(500).json({ ok: false, error: "omni_events_failed" });
  }
});

/** Cron + cache probe for on-call (header x-ops-key). */
router.get("/diagnostics", assertOpsAuth, async (_req, res) => {
  const proAlertCron = getProAlertCronStatus();
  let redisCache = "skipped";
  try {
    const pingKey = "omni:diag:ping";
    await redis.set(pingKey, "1", { ex: 15 });
    const v = await redis.get(pingKey);
    redisCache = v === "1" || v === 1 ? "ok" : "unexpected";
  } catch (e) {
    redisCache = { error: e.message || String(e) };
  }
  return res.json({
    ok: true,
    data: {
      proAlertCron,
      redisCache,
      smartWorkersEnabled: String(process.env.SMART_WORKERS_ENABLED || "true").toLowerCase() !== "false"
    }
  });
});

/** Run one PRO watchlist alert pass immediately (same logic as interval). */
router.post("/pro-alerts/run-tick", assertOpsAuth, async (_req, res) => {
  try {
    await runProAlertTick();
    return res.json({ ok: true, data: getProAlertCronStatus() });
  } catch (error) {
    console.error("Omni pro-alerts tick failed:", error.message);
    return res.status(500).json({ ok: false, error: "pro_alerts_tick_failed" });
  }
});

module.exports = router;

