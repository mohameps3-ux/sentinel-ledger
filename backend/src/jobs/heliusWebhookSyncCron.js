"use strict";

const cron = require("node-cron");
const { syncHeliusAccountAddresses } = require("../services/heliusWebhookSync");

const DEFAULT_CRON_EXPRESSION = "0 3 * * *";
const STALE_ALERT_MS = Math.max(
  60 * 60 * 1000,
  Number(process.env.HELIUS_SYNC_STALE_MS || 26 * 60 * 60 * 1000)
);

let scheduledTask = null;
let bootstrapTimer = null;

function isEnabled() {
  return String(process.env.HELIUS_SYNC_CRON_ENABLED || "true").toLowerCase() !== "false";
}

function cronExpression() {
  return String(process.env.HELIUS_SYNC_CRON_EXPRESSION || DEFAULT_CRON_EXPRESSION).trim();
}

async function runHeliusWebhookSyncTick() {
  if (!isEnabled()) return { ok: false, reason: "disabled" };
  return syncHeliusAccountAddresses();
}

function getHeliusWebhookSyncCronStatus() {
  return {
    enabled: isEnabled(),
    cronExpression: cronExpression(),
    staleAlertMs: STALE_ALERT_MS
  };
}

function startHeliusWebhookSyncCron() {
  if (scheduledTask || bootstrapTimer) return;
  if (!isEnabled()) {
    console.log("[helius-sync] cron disabled via HELIUS_SYNC_CRON_ENABLED=false");
    return;
  }

  const expr = cronExpression();
  const tz = String(process.env.HELIUS_SYNC_CRON_TZ || "UTC").trim() || "UTC";
  if (typeof cron.validate === "function" && !cron.validate(expr)) {
    console.warn(`[helius-sync] invalid CRON "${expr}", using ${DEFAULT_CRON_EXPRESSION}`);
  }

  const runExpr = typeof cron.validate === "function" && cron.validate(expr) ? expr : DEFAULT_CRON_EXPRESSION;
  scheduledTask = cron.schedule(
    runExpr,
    () => {
      runHeliusWebhookSyncTick().catch((e) =>
        console.warn("[helius-sync] tick failed:", e?.message || e)
      );
    },
    { timezone: tz }
  );
  console.log(`[helius-sync] node-cron expr="${runExpr}" timezone=${tz}`);

  // Best-effort bootstrap shortly after startup (does not replace daily schedule).
  bootstrapTimer = setTimeout(() => {
    bootstrapTimer = null;
    runHeliusWebhookSyncTick()
      .then((r) => {
        if (r?.ok) console.log("[helius-sync] bootstrap ok", { addressCount: r.addressCount });
      })
      .catch((e) => console.warn("[helius-sync] bootstrap failed:", e?.message || e));
  }, 120_000);
  if (typeof bootstrapTimer.unref === "function") bootstrapTimer.unref();
}

module.exports = {
  startHeliusWebhookSyncCron,
  runHeliusWebhookSyncTick,
  getHeliusWebhookSyncCronStatus,
  STALE_ALERT_MS
};
