"use strict";

const TICK_MS_RAW = Number(process.env.OPS_HEARTBEAT_TICK_MS || 24 * 60 * 60 * 1000);
const TICK_MS = Number.isFinite(TICK_MS_RAW) && TICK_MS_RAW >= 60 * 60 * 1000 ? TICK_MS_RAW : 24 * 60 * 60 * 1000;

let intervalRef = null;
let lastTickStartedAt = null;
let lastTickFinishedAt = null;
let lastStats = {
  ok: false,
  sent: false,
  reason: "not_run",
  statusCode: null
};

function isEnabled() {
  return String(process.env.OPS_HEARTBEAT_ENABLED || "true").toLowerCase() !== "false";
}

function getWebhookUrl() {
  return String(process.env.OPS_ALERT_WEBHOOK_URL || "").trim();
}

async function runOpsHeartbeatTick() {
  if (!isEnabled()) return;
  lastTickStartedAt = Date.now();
  try {
    const url = getWebhookUrl();
    if (!url) {
      lastStats = { ok: false, sent: false, reason: "webhook_not_configured", statusCode: null };
      return;
    }
    const msg = `[OPS_HEARTBEAT] ok ${new Date().toISOString()}`;
    const payload = {
      content: msg,
      text: msg,
      username: "Sentinel Ops Heartbeat",
      // Prevent accidental pings in shared Discord/Slack-like bridges.
      allowed_mentions: { parse: [] }
    };
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const ok = res.status >= 200 && res.status < 300;
    lastStats = {
      ok,
      sent: true,
      reason: ok ? null : "webhook_non_2xx",
      statusCode: res.status
    };
    if (!ok) {
      console.warn(`[ops-heartbeat] webhook non-2xx status=${res.status}`);
    }
  } catch (e) {
    lastStats = {
      ok: false,
      sent: false,
      reason: e?.message || "heartbeat_exception",
      statusCode: null
    };
    console.warn("[ops-heartbeat] tick_exception:", e?.message || e);
  } finally {
    lastTickFinishedAt = Date.now();
  }
}

function getOpsHeartbeatCronStatus() {
  return {
    cronEnabled: isEnabled(),
    webhookConfigured: Boolean(getWebhookUrl()),
    tickIntervalMs: TICK_MS,
    lastTickStartedAt,
    lastTickFinishedAt,
    lastTickDurationMs:
      lastTickStartedAt && lastTickFinishedAt ? lastTickFinishedAt - lastTickStartedAt : null,
    lastStats
  };
}

function startOpsHeartbeatCron() {
  if (intervalRef) return;
  if (!isEnabled()) {
    console.log("Ops heartbeat cron disabled via OPS_HEARTBEAT_ENABLED=false");
    return;
  }
  intervalRef = setInterval(() => {
    runOpsHeartbeatTick().catch((e) => console.warn("[ops-heartbeat] tick_failed:", e?.message || e));
  }, TICK_MS);
  if (intervalRef && typeof intervalRef.unref === "function") intervalRef.unref();
  console.log(`[ops-heartbeat] scheduled every ${Math.round(TICK_MS / 60000)}m`);
}

module.exports = {
  startOpsHeartbeatCron,
  runOpsHeartbeatTick,
  getOpsHeartbeatCronStatus
};
