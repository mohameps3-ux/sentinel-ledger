/**
 * VAPID Web Push — subscription storage; tactical regime uses same copy as Telegram (tacticalRegimeWebPush).
 * Hardening: strict subscription shape in service, per-IP rate limits (key after auth is not used; see express-rate-limit order),
 * no raw Supabase errors to clients, small JSON only via service validation.
 */
"use strict";

const express = require("express");
const rateLimit = require("express-rate-limit");
const { authMiddleware, requirePro } = require("./auth");
const { getSupabase } = require("../lib/supabase");
const {
  getVapidPublicKeyForClient,
  isValidPushHttpUrl,
  upsertPushSubscription,
  removePushSubscription
} = require("../services/tacticalRegimeWebPush");

const router = express.Router();

const vapidPublicKeyLimiter = rateLimit({
  windowMs: 60_000,
  max: Math.max(10, Math.min(200, Number(process.env.WEB_PUSH_VAPID_RATE_LIMIT_MAX || 60))),
  standardHeaders: true,
  legacyHeaders: false
});

const pushStatusLimiter = rateLimit({
  windowMs: 60_000,
  max: Math.max(20, Math.min(120, Number(process.env.WEB_PUSH_STATUS_RATE_LIMIT_MAX || 60))),
  standardHeaders: true,
  legacyHeaders: false
});

const pushMutateIpLimiter = rateLimit({
  windowMs: 60_000,
  max: Math.max(5, Math.min(60, Number(process.env.WEB_PUSH_MUTATE_RATE_LIMIT_MAX || 20))),
  standardHeaders: true,
  legacyHeaders: false
});

const sanitizeUserAgent = (h) => {
  const s = String(h || "").replace(/[\0\r\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 512);
  return s || null;
};

/** Public key is safe to expose; used only for subscription. Rate-limited per IP. */
router.get("/vapid-public-key", vapidPublicKeyLimiter, (_req, res) => {
  const publicKey = getVapidPublicKeyForClient();
  if (!publicKey) {
    return res.status(503).json({ ok: false, error: "vapid_not_configured" });
  }
  return res.json({ ok: true, data: { publicKey } });
});

router.get("/status", pushStatusLimiter, authMiddleware, requirePro, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { count, error } = await supabase
      .from("web_push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", req.user.userId);
    if (error) throw error;
    return res.json({ ok: true, data: { subscriptionCount: count || 0 } });
  } catch (e) {
    console.error("push/status:", e);
    return res.status(500).json({ ok: false, error: "status_failed" });
  }
});

router.post("/subscribe", pushMutateIpLimiter, authMiddleware, requirePro, async (req, res) => {
  try {
    const sub = req.body?.subscription;
    const ua = sanitizeUserAgent(req.headers["user-agent"]);
    const out = await upsertPushSubscription(req.user.userId, sub, ua);
    if (!out.ok) {
      const code = out.error === "storage_failed" ? 500 : 400;
      return res.status(code).json({ ok: false, error: out.error || "subscribe_failed" });
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error("push/subscribe:", e);
    return res.status(500).json({ ok: false, error: "subscribe_failed" });
  }
});

router.post("/unsubscribe", pushMutateIpLimiter, authMiddleware, requirePro, async (req, res) => {
  try {
    const endpoint = String(req.body?.endpoint || "").trim();
    if (!endpoint) {
      return res.status(400).json({ ok: false, error: "endpoint_required" });
    }
    if (!isValidPushHttpUrl(endpoint)) {
      return res.status(400).json({ ok: false, error: "invalid_endpoint" });
    }
    const out = await removePushSubscription(req.user.userId, endpoint);
    if (!out.ok) {
      const code = out.error === "storage_failed" ? 500 : 400;
      return res.status(code).json({ ok: false, error: out.error || "unsubscribe_failed" });
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error("push/unsubscribe:", e);
    return res.status(500).json({ ok: false, error: "unsubscribe_failed" });
  }
});

module.exports = router;
