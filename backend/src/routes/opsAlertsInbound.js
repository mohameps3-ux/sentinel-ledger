"use strict";

const crypto = require("crypto");
const express = require("express");
const { getOpsPostgresPool } = require("../lib/opsPostgresPool");

const router = express.Router();

function sortedStringify(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(sortedStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => JSON.stringify(k) + ":" + sortedStringify(value[k])).join(",")}}`;
}

function verifyInboundSignature(secret, body, headerSig) {
  const sig = String(headerSig || body?.signature || "").trim();
  const source = String(body?.source || "");
  const severity = String(body?.severity || "");
  const event = String(body?.event || "");
  const metadata = body?.metadata && typeof body.metadata === "object" ? body.metadata : {};
  const payload = `${source}|${severity}|${event}|${sortedStringify(metadata)}`;
  const mac = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const expected = sig.startsWith("sha256=") ? sig.slice("sha256=".length) : sig;
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(mac, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (_) {
    return false;
  }
}

async function insertOpsAlert(client, row) {
  const r = await client.query(
    `INSERT INTO public.ops_alerts (source, severity, event, metadata, action_taken)
     VALUES ($1, $2, $3, $4::jsonb, $5) RETURNING id`,
    [
      String(row.source).slice(0, 64),
      String(row.severity).slice(0, 32),
      String(row.event).slice(0, 128),
      JSON.stringify(row.metadata || {}),
      String(row.action_taken || "logged").slice(0, 64)
    ]
  );
  return r.rows?.[0]?.id;
}

async function maybeNotifyTelegram(text) {
  const token = String(process.env.OPS_ALERT_TELEGRAM_BOT_TOKEN || "").trim();
  const chat = String(process.env.OPS_ALERT_TELEGRAM_CHAT_ID || "").trim();
  if (!token || !chat) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text: String(text).slice(0, 3500) })
  }).catch(() => {});
}

router.post("/inbound", express.json({ limit: "256kb" }), async (req, res) => {
  try {
    const secret = String(process.env.WEBHOOK_SECRET || process.env.OPS_WEBHOOK_SECRET || "").trim();
    if (!secret) return res.status(503).json({ ok: false, error: "webhook_secret_not_configured" });
    if (!verifyInboundSignature(secret, req.body, req.get("x-ops-signature"))) {
      return res.status(401).json({ ok: false, error: "invalid_signature" });
    }

    const source = String(req.body?.source || "custom").slice(0, 64);
    const severity = String(req.body?.severity || "low").toLowerCase();
    const event = String(req.body?.event || "custom").slice(0, 128);
    const metadata = req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : {};

    const pool = getOpsPostgresPool();
    if (!pool) return res.status(503).json({ ok: false, error: "database_url_not_configured" });

    let actionTaken = "logged";
    const client = await pool.connect();
    let alertId;
    try {
      if (severity === "low" || severity === "medium") {
        alertId = await insertOpsAlert(client, { source, severity, event, metadata, action_taken: "logged" });
      } else if (severity === "high") {
        alertId = await insertOpsAlert(client, { source, severity, event, metadata, action_taken: "analyzed" });
        actionTaken = "analyzed";
        const base = String(process.env.OPS_SELF_BASE_URL || process.env.PUBLIC_API_URL || "").replace(/\/$/, "");
        const key = String(process.env.OMNI_BOT_OPS_KEY || "").trim();
        if (base && key) {
          const msg = `[ops-alert inbound] ${source} ${severity} ${event}\n${JSON.stringify(metadata).slice(0, 6000)}`;
          await fetch(`${base}/api/v1/ops/agent/message`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-ops-key": key },
            body: JSON.stringify({ message: msg, history: [] })
          }).catch(() => {});
        }
      } else if (severity === "critical") {
        alertId = await insertOpsAlert(client, { source, severity, event, metadata, action_taken: "escalated" });
        actionTaken = "escalated";
        const base = String(process.env.OPS_SELF_BASE_URL || process.env.PUBLIC_API_URL || "").replace(/\/$/, "");
        const key = String(process.env.OMNI_BOT_OPS_KEY || "").trim();
        if (base && key) {
          const msg = `[CRITICAL ALERT] ${source} ${event}\n${JSON.stringify(metadata).slice(0, 6000)}`;
          await fetch(`${base}/api/v1/ops/agent/message`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-ops-key": key },
            body: JSON.stringify({ message: msg, history: [] })
          }).catch(() => {});
        }
        await maybeNotifyTelegram(`CRITICAL ${source} ${event}`);
      } else {
        alertId = await insertOpsAlert(client, { source, severity, event, metadata, action_taken: "logged" });
      }
    } finally {
      client.release();
    }

    let hint;
    if (event === "win_rate_drop" && metadata?.suggest_weights_rollback) {
      hint = "Consider POST /api/v1/ops/tools/rollback with type calibration and target previous.";
    }

    return res.json({ ok: true, alert_id: alertId, action_taken: actionTaken, hint });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "inbound_failed" });
  }
});

module.exports = router;
