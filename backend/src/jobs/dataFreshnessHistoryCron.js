"use strict";

const { getDataFreshnessSnapshot } = require("../services/homeTerminalApi");
const {
  appendFreshnessSnapshotHistory,
  pruneFreshnessHistory,
  getFreshnessHistory
} = require("../services/freshnessHistoryStore");

const TICK_MS_RAW = Number(process.env.FRESHNESS_HISTORY_TICK_MS || 300_000);
const TICK_MS = Number.isFinite(TICK_MS_RAW) && TICK_MS_RAW >= 60_000 ? TICK_MS_RAW : 300_000;
const RETENTION_DAYS_RAW = Number(process.env.FRESHNESS_HISTORY_RETENTION_DAYS || 30);
const RETENTION_DAYS = Number.isFinite(RETENTION_DAYS_RAW)
  ? Math.min(365, Math.max(7, Math.floor(RETENTION_DAYS_RAW)))
  : 30;
const OPS_ALERT_WEBHOOK_URL = String(process.env.OPS_ALERT_WEBHOOK_URL || "").trim();
const HISTORY_ALERT_ENABLED =
  String(process.env.FRESHNESS_HISTORY_ALERT_ENABLED || "true").toLowerCase() !== "false";
const HISTORY_ALERT_LOOKBACK_HOURS = Math.min(
  24 * 14,
  Math.max(1, Math.floor(Number(process.env.FRESHNESS_HISTORY_ALERT_LOOKBACK_HOURS || 24)))
);
const HISTORY_ALERT_MIN_POINTS = Math.max(
  4,
  Math.floor(Number(process.env.FRESHNESS_HISTORY_ALERT_MIN_POINTS || 6))
);
const HISTORY_ALERT_SUSTAIN_POINTS = Math.max(
  2,
  Math.floor(Number(process.env.FRESHNESS_HISTORY_ALERT_SUSTAIN_POINTS || 4))
);
const HISTORY_ALERT_NEGATIVE_SLOPE_PER_HOUR = Number.isFinite(
  Number(process.env.FRESHNESS_HISTORY_ALERT_NEGATIVE_SLOPE_PER_HOUR)
)
  ? Math.min(-0.0001, Number(process.env.FRESHNESS_HISTORY_ALERT_NEGATIVE_SLOPE_PER_HOUR))
  : -0.005;
const HISTORY_ALERT_RATE_GAP = Number.isFinite(Number(process.env.FRESHNESS_HISTORY_ALERT_RATE_GAP))
  ? Math.min(0.5, Math.max(0, Number(process.env.FRESHNESS_HISTORY_ALERT_RATE_GAP)))
  : 0.02;
const HISTORY_ALERT_MIN_REQUESTS_24H = Math.max(
  1,
  Math.floor(Number(process.env.FRESHNESS_HISTORY_ALERT_MIN_REQUESTS_24H || 30))
);
const HISTORY_ALERT_COOLDOWN_MS = Math.max(
  60_000,
  Math.floor(Number(process.env.FRESHNESS_HISTORY_ALERT_COOLDOWN_MS || 300_000))
);

let intervalRef = null;
let lastTickStartedAt = null;
let lastTickFinishedAt = null;
const trendAlertState = {
  activeSinceMs: null,
  lastAlertAtMs: null,
  lastRecoveryAtMs: null,
  lastIncidentDurationMs: null,
  alertsSent: 0,
  lastRate: null,
  lastTarget: null,
  lastRequests24h: 0,
  lastSlopePerHour: null
};
let lastStats = {
  inserted: 0,
  pruned: 0,
  rowsWritten: 0,
  error: null,
  historyAlert: null
};

function isEnabled() {
  return String(process.env.FRESHNESS_HISTORY_CRON_ENABLED || "true").toLowerCase() !== "false";
}

function asMs(value) {
  const ms = Date.parse(value || 0);
  return Number.isFinite(ms) ? ms : 0;
}

function avgSlopePerHour(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return 0;
  let sumSlope = 0;
  let counted = 0;
  for (let i = 1; i < rows.length; i += 1) {
    const prev = rows[i - 1];
    const cur = rows[i];
    const prevRate = Number(prev?.supabase_source_rate_24h);
    const curRate = Number(cur?.supabase_source_rate_24h);
    if (!Number.isFinite(prevRate) || !Number.isFinite(curRate)) continue;
    const dtMs = asMs(cur?.captured_at) - asMs(prev?.captured_at);
    if (dtMs <= 0) continue;
    const hours = dtMs / 3_600_000;
    sumSlope += (curRate - prevRate) / hours;
    counted += 1;
  }
  return counted > 0 ? sumSlope / counted : 0;
}

function sendTrendAlert(summary) {
  if (!OPS_ALERT_WEBHOOK_URL) return;
  const msg =
    `[OPS_ALERT] ⚠️ SIGNALS_FRESHNESS_TREND_DEGRADING` +
    ` | lookback=${HISTORY_ALERT_LOOKBACK_HOURS}h` +
    ` | rate24h=${Number(summary.rate || 0).toFixed(4)}` +
    ` | target=${Number(summary.target || 0).toFixed(4)}` +
    ` | slope1h=${Number(summary.slopePerHour || 0).toFixed(4)}` +
    ` | points=${Number(summary.points || 0)}` +
    ` | requests24h=${Number(summary.requests24h || 0)}`;
  const payload = {
    text: msg,
    content: msg,
    username: "Sentinel Ops Guard",
    embeds: [
      {
        title: "SIGNALS_FRESHNESS_TREND_DEGRADING",
        description: msg,
        color: 15105570
      }
    ]
  };
  fetch(OPS_ALERT_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  }).catch(() => {
    // Silent by design: alert transport must never break cron flow.
  });
}

async function evaluateHistoryTrendAlert() {
  if (!HISTORY_ALERT_ENABLED) return { enabled: false, status: "disabled" };
  const out = await getFreshnessHistory({
    endpoint: "signalsLatest",
    hours: HISTORY_ALERT_LOOKBACK_HOURS,
    limit: 5000
  });
  if (!out?.ok) return { enabled: true, status: "history_unavailable", reason: out?.reason || "unknown" };

  const rows = Array.isArray(out.rows) ? out.rows : [];
  const points = rows.filter((r) => Number.isFinite(Number(r?.supabase_source_rate_24h)));
  const latest = points[points.length - 1] || null;
  const now = Date.now();
  const latestRate = Number(latest?.supabase_source_rate_24h || 0);
  const latestTarget = Number(latest?.slo_target || 0.8);
  const latestReq = Number(latest?.requests_24h || 0);
  const slopePerHour = avgSlopePerHour(points);
  trendAlertState.lastRate = latestRate;
  trendAlertState.lastTarget = latestTarget;
  trendAlertState.lastRequests24h = latestReq;
  trendAlertState.lastSlopePerHour = slopePerHour;

  const sustainSlice = points.slice(-HISTORY_ALERT_SUSTAIN_POINTS);
  const enoughPoints = points.length >= HISTORY_ALERT_MIN_POINTS;
  const enoughVolume = latestReq >= HISTORY_ALERT_MIN_REQUESTS_24H;
  const belowTarget = latestRate <= latestTarget - HISTORY_ALERT_RATE_GAP;
  const sustainedBelow =
    sustainSlice.length >= HISTORY_ALERT_SUSTAIN_POINTS &&
    sustainSlice.every((row) => Number(row?.supabase_source_rate_24h || 0) <= latestTarget);
  const negativeTrend = slopePerHour <= HISTORY_ALERT_NEGATIVE_SLOPE_PER_HOUR;
  const breach = enoughPoints && enoughVolume && belowTarget && sustainedBelow && negativeTrend;

  if (breach) {
    if (!trendAlertState.activeSinceMs) {
      trendAlertState.activeSinceMs = now;
    }
    const cooldownOk =
      !trendAlertState.lastAlertAtMs || now - trendAlertState.lastAlertAtMs >= HISTORY_ALERT_COOLDOWN_MS;
    if (cooldownOk) {
      trendAlertState.lastAlertAtMs = now;
      trendAlertState.alertsSent += 1;
      sendTrendAlert({
        rate: latestRate,
        target: latestTarget,
        slopePerHour,
        points: points.length,
        requests24h: latestReq
      });
    }
    return {
      enabled: true,
      status: "degrading_active",
      breach: true,
      points: points.length,
      rate24h: latestRate,
      target: latestTarget,
      slopePerHour,
      requests24h: latestReq
    };
  }

  if (trendAlertState.activeSinceMs) {
    trendAlertState.lastIncidentDurationMs = now - trendAlertState.activeSinceMs;
    trendAlertState.lastRecoveryAtMs = now;
    trendAlertState.activeSinceMs = null;
  }
  return {
    enabled: true,
    status: "healthy",
    breach: false,
    points: points.length,
    rate24h: latestRate,
    target: latestTarget,
    slopePerHour,
    requests24h: latestReq
  };
}

async function runDataFreshnessHistoryTick() {
  if (!isEnabled()) return;
  lastTickStartedAt = Date.now();
  try {
    const snapshot = getDataFreshnessSnapshot();
    const append = await appendFreshnessSnapshotHistory(snapshot);
    if (!append.ok) {
      lastStats = {
        inserted: 0,
        pruned: 0,
        rowsWritten: 0,
        error: append.reason || "append_failed"
      };
      return;
    }
    const pruned = await pruneFreshnessHistory(RETENTION_DAYS);
    const historyAlert = await evaluateHistoryTrendAlert();
    lastStats = {
      inserted: Number(append.inserted || 0),
      pruned: Number(pruned?.deleted || 0),
      rowsWritten: Number(append.inserted || 0),
      error: pruned?.ok === false ? pruned.reason || "prune_failed" : null,
      historyAlert
    };
  } catch (e) {
    lastStats = {
      inserted: 0,
      pruned: 0,
      rowsWritten: 0,
      error: e?.message || "tick_failed",
      historyAlert: null
    };
    console.warn("[freshness-history] tick_exception:", e?.message || e);
  } finally {
    lastTickFinishedAt = Date.now();
  }
}

function getDataFreshnessHistoryCronStatus() {
  const now = Date.now();
  const activeForMs = trendAlertState.activeSinceMs ? now - trendAlertState.activeSinceMs : 0;
  return {
    cronEnabled: isEnabled(),
    tickIntervalMs: TICK_MS,
    retentionDays: RETENTION_DAYS,
    lastTickStartedAt,
    lastTickFinishedAt,
    lastTickDurationMs:
      lastTickStartedAt && lastTickFinishedAt ? lastTickFinishedAt - lastTickStartedAt : null,
    lastStats,
    trendAlert: {
      enabled: HISTORY_ALERT_ENABLED,
      config: {
        lookbackHours: HISTORY_ALERT_LOOKBACK_HOURS,
        minPoints: HISTORY_ALERT_MIN_POINTS,
        sustainPoints: HISTORY_ALERT_SUSTAIN_POINTS,
        negativeSlopePerHour: HISTORY_ALERT_NEGATIVE_SLOPE_PER_HOUR,
        rateGap: HISTORY_ALERT_RATE_GAP,
        minRequests24h: HISTORY_ALERT_MIN_REQUESTS_24H,
        cooldownMs: HISTORY_ALERT_COOLDOWN_MS
      },
      latest: {
        rate24h: trendAlertState.lastRate,
        target: trendAlertState.lastTarget,
        requests24h: trendAlertState.lastRequests24h,
        slopePerHour: trendAlertState.lastSlopePerHour
      },
      breach: {
        active: Boolean(trendAlertState.activeSinceMs),
        activeSince: trendAlertState.activeSinceMs
          ? new Date(trendAlertState.activeSinceMs).toISOString()
          : null,
        activeForMs,
        alertsSent: trendAlertState.alertsSent,
        lastAlertAt: trendAlertState.lastAlertAtMs
          ? new Date(trendAlertState.lastAlertAtMs).toISOString()
          : null,
        lastRecoveryAt: trendAlertState.lastRecoveryAtMs
          ? new Date(trendAlertState.lastRecoveryAtMs).toISOString()
          : null,
        lastIncidentDurationMs: trendAlertState.lastIncidentDurationMs
      }
    }
  };
}

function startDataFreshnessHistoryCron() {
  if (intervalRef) return;
  if (!isEnabled()) {
    console.log("Freshness history cron disabled via FRESHNESS_HISTORY_CRON_ENABLED=false");
    return;
  }
  runDataFreshnessHistoryTick().catch((e) =>
    console.warn("[freshness-history] bootstrap_failed:", e?.message || e)
  );
  intervalRef = setInterval(() => {
    runDataFreshnessHistoryTick().catch((e) =>
      console.warn("[freshness-history] tick_failed:", e?.message || e)
    );
  }, TICK_MS);
  if (intervalRef && typeof intervalRef.unref === "function") intervalRef.unref();
}

module.exports = {
  startDataFreshnessHistoryCron,
  runDataFreshnessHistoryTick,
  getDataFreshnessHistoryCronStatus
};
