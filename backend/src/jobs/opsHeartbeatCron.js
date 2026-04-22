"use strict";

const { getDataFreshnessSnapshot } = require("../services/homeTerminalApi");
const { getSignalPerformanceSummary } = require("../services/signalPerformance");

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

function signalPerfHeartbeatEnabled() {
  return String(process.env.OPS_HEARTBEAT_SIGNAL_PERF || "true").toLowerCase() !== "false";
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
    const freshness = await getDataFreshnessSnapshot();
    const signals = freshness?.signalsLatest || {};
    const topFallback = Object.entries(signals?.fallbackReasonBreakdown24h || {}).sort(
      (a, b) => Number(b[1] || 0) - Number(a[1] || 0)
    )[0];
    const topProvider = Object.entries(signals?.providerUsedBreakdown24h || {}).sort(
      (a, b) => Number(b[1] || 0) - Number(a[1] || 0)
    )[0];
    let perfSuffix = "";
    if (signalPerfHeartbeatEnabled()) {
      try {
        const perf = await getSignalPerformanceSummary({
          lookbackHours: Math.min(168, Math.max(24, Number(process.env.OPS_HEARTBEAT_SIGNAL_PERF_LOOKBACK_H || 48)))
        });
        if (perf?.ok) {
          const m = perf.metrics || {};
          perfSuffix =
            ` | perf.winRatePct=${Number(m.winRatePct || 0).toFixed(2)}` +
            ` | perf.profitFactor=${Number(m.profitFactor || 0).toFixed(3)}` +
            ` | perf.resolved=${Number(perf.resolvedRows || 0)}` +
            ` | perf.pending=${Number(perf.pendingRows || 0)}`;
        } else {
          perfSuffix = ` | perf.err=${String(perf?.error || "unavailable")}`;
        }
      } catch (e) {
        perfSuffix = ` | perf.err=${String(e?.message || e)}`;
      }
    }
    const msg =
      `[OPS_HEARTBEAT] ok ${new Date().toISOString()}` +
      ` | signals.realRatio24h=${Number(signals?.realRatio24h || 0).toFixed(3)}` +
      ` | signals.supabaseRate24h=${Number(signals?.supabaseSourceRate24h || 0).toFixed(3)}` +
      ` | signals.staticFallbackRate24h=${Number(signals?.staticFallbackRate24h || 0).toFixed(3)}` +
      ` | topFallback=${topFallback ? `${topFallback[0]}:${topFallback[1]}` : "n/a"}` +
      ` | topProvider=${topProvider ? `${topProvider[0]}:${topProvider[1]}` : "n/a"}` +
      perfSuffix;
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
