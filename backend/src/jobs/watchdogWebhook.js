"use strict";

/**
 * Fase 3 — Si no hay actividad de webhook en FALLBACK_POLLER_TRIGGER_MINUTES,
 * arma Redis poller_force_mode (1h) para que el poller no se salte ticks por Fase 2.
 */

const redis = require("../lib/cache");
const {
  getLastWebhookActivityMs,
  POLLER_FORCE_MODE_KEY,
  fallbackPollerTriggerMinutes
} = require("../lib/eventPriority");

const TICK_MS = 60_000;

async function webhookPollerWatchdogTick() {
  if (String(process.env.FF_WEBHOOK_WATCHDOG || "true").trim().toLowerCase() === "false") {
    return;
  }

  const minutes = fallbackPollerTriggerMinutes();
  const thresholdMs = minutes * 60 * 1000;
  const ms = await getLastWebhookActivityMs();
  const now = Date.now();
  const quiet = ms == null || now - ms > thresholdMs;

  if (quiet) {
    try {
      const existing = await redis.get(POLLER_FORCE_MODE_KEY);
      await redis.set(POLLER_FORCE_MODE_KEY, String(now), { ex: 3600 });
      if (!existing) {
        console.log(`[poller-watchdog] force mode armed (webhook quiet > ${minutes}m)`);
      }
    } catch (e) {
      console.warn("[poller-watchdog] set force mode:", e?.message || e);
    }
  } else {
    try {
      await redis.del(POLLER_FORCE_MODE_KEY);
    } catch (_) {}
  }
}

function startWebhookPollerWatchdog() {
  webhookPollerWatchdogTick().catch((e) => console.warn("[poller-watchdog] tick:", e?.message || e));
  setInterval(() => {
    webhookPollerWatchdogTick().catch((e) => console.warn("[poller-watchdog] tick:", e?.message || e));
  }, TICK_MS);
  console.log(`[poller-watchdog] started interval_ms=${TICK_MS}`);
}

module.exports = { startWebhookPollerWatchdog, webhookPollerWatchdogTick };
