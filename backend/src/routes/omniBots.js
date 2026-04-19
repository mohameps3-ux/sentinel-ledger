const express = require("express");
const rateLimit = require("express-rate-limit");
const redis = require("../lib/cache");
const { getSupabase } = require("../lib/supabase");
const { handleSupportInbound } = require("../services/supportService");
const { sendOmniAlert } = require("../services/omniAlertsService");
const { getProAlertCronStatus, runProAlertTick } = require("../jobs/proAlertCron");

const router = express.Router();
const MAX_INBOUND_BODY_BYTES = 32 * 1024;
const INBOUND_DEDUP_TTL_SEC = 90;

const inboundLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "rate_limit_exceeded" }
});
const omniPublicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "rate_limit_exceeded" }
});

router.use(omniPublicLimiter);

function assertOpsAuth(req, res, next) {
  const expected = process.env.OMNI_BOT_OPS_KEY;
  if (!expected) return res.status(503).json({ ok: false, error: "ops_key_not_configured" });
  const provided = req.headers["x-ops-key"];
  if (provided !== expected) return res.status(401).json({ ok: false, error: "unauthorized" });
  next();
}

function assertInboundAuth(req, res, next) {
  const expected = process.env.OMNI_BOT_INBOUND_KEY || process.env.OMNI_BOT_OPS_KEY;
  if (!expected) return res.status(503).json({ ok: false, error: "inbound_key_not_configured" });
  const provided = String(req.headers["x-omni-key"] || "").trim();
  if (!provided || provided !== expected) return res.status(401).json({ ok: false, error: "unauthorized" });
  return next();
}

function enforceInboundPayloadSize(req, res, next) {
  const rawLen = Number(req.headers["content-length"] || 0);
  if (Number.isFinite(rawLen) && rawLen > MAX_INBOUND_BODY_BYTES) {
    return res.status(413).json({ ok: false, error: "payload_too_large" });
  }
  return next();
}

function validateInboundPayload(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "invalid_payload" };
  }
  const channel = String(raw.channel || "webhook").trim().toLowerCase();
  const userId = String(raw.userId || "anonymous").trim();
  const message = String(raw.message || "").trim();
  const metadata = raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata) ? raw.metadata : {};

  const allowedChannels = new Set(["telegram", "x", "webhook", "discord", "slack"]);
  if (!allowedChannels.has(channel)) return { ok: false, error: "invalid_channel" };
  if (!userId || userId.length > 120) return { ok: false, error: "invalid_user_id" };
  if (!message || message.length > 1200) return { ok: false, error: "invalid_message" };
  const metadataJson = JSON.stringify(metadata);
  if (metadataJson.length > 8000) return { ok: false, error: "metadata_too_large" };

  return { ok: true, value: { channel, userId, message, metadata } };
}

async function assertInboundDedup(req, res, next) {
  const requestId = String(req.headers["x-request-id"] || "").trim();
  if (!requestId || requestId.length > 120) {
    return res.status(400).json({ ok: false, error: "missing_or_invalid_request_id" });
  }
  try {
    const key = `omni:inbound:req:${requestId}`;
    const setRes = await redis.set(key, "1", { nx: true, ex: INBOUND_DEDUP_TTL_SEC });
    if (setRes == null) return res.json({ ok: true, duplicate: true });
    return next();
  } catch (error) {
    console.warn("Omni inbound dedup fallback:", error.message);
    return next();
  }
}

router.get("/health", async (_, res) => {
  return res.json({
    ok: true,
    service: "omni-bots",
    channels: ["telegram", "x", "webhook", "future:discord/slack"]
  });
});

router.post("/inbound", inboundLimiter, assertInboundAuth, enforceInboundPayloadSize, assertInboundDedup, async (req, res) => {
  try {
    const parsed = validateInboundPayload(req.body);
    if (!parsed.ok) return res.status(400).json({ ok: false, error: parsed.error });
    const { channel, userId, message, metadata } = parsed.value;

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

