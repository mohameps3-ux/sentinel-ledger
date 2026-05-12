const cron = require("node-cron");
const { getSupabase } = require("../lib/supabase");
const { randomUUID } = require("crypto");
const { getSmartWalletQueue } = require("../queues/smartWallet.queue");
const { analyzeWallet } = require("../services/analyzeWallet");
const { ecoModeActive } = require("../services/budgetGuard");
const { verifyLeadershipFence } = require("../services/leaderService");
const {
  shouldDeferBackfillForRecentWebhook,
  backfillQuietMinutes,
  BULLMQ_PRIORITY_LOW
} = require("../lib/eventPriority");

/** Fase 4: por defecto 02:00 UTC diario. Rollback: SMART_WALLET_CRON_INTERVAL_MS=21600000 */
const DEFAULT_CRON_EXPRESSION = "0 2 * * *";
const LEGACY_INTERVAL_MS = 6 * 60 * 60 * 1000;

let legacyIntervalRef = null;
let scheduledTask = null;
/** One-shot retry after webhook quiet window (avoids losing the whole cron tick). */
let deferredWebhookRetryTimer = null;
/** ISO timestamp of last `enqueueActiveWallets` invocation (set before skips/defers). */
let lastCronRun = null;

function getLastSmartWalletCronRun() {
  return lastCronRun;
}

function getDirectLimit() {
  const raw = Number(process.env.SMART_WALLET_DIRECT_LIMIT || 20);
  if (!Number.isFinite(raw) || raw <= 0) return 20;
  return Math.min(100, Math.floor(raw));
}

function scheduleSmartWalletEnqueueAfterWebhookQuiet(triggerRequestId) {
  if (deferredWebhookRetryTimer != null) {
    console.log(
      `[smart-wallet-cron][${triggerRequestId}] defer retry already scheduled, skipping duplicate`
    );
    return;
  }
  const quiet = backfillQuietMinutes();
  const delayMs = Math.max(60_000, (quiet + 1) * 60 * 1000);
  console.log(
    `[smart-wallet-cron][${triggerRequestId}] scheduling enqueue retry in ${Math.round(delayMs / 60000)}m (post webhook quiet)`
  );
  deferredWebhookRetryTimer = setTimeout(() => {
    deferredWebhookRetryTimer = null;
    enqueueActiveWallets({ skipWebhookDefer: true }).catch((e) =>
      console.warn("[smart-wallet-cron] deferred enqueue after quiet:", e?.message || e)
    );
  }, delayMs);
  if (typeof deferredWebhookRetryTimer.unref === "function") deferredWebhookRetryTimer.unref();
}

async function enqueueActiveWallets(options = {}) {
  const skipWebhookDefer = Boolean(options?.skipWebhookDefer);
  lastCronRun = new Date().toISOString();
  const requestId = randomUUID();
  const runAt = new Date().toISOString();
  console.log(
    `[smart-wallet-cron][${requestId}] run_at=${runAt} enqueue_start${skipWebhookDefer ? " skip_webhook_defer=1" : ""}`
  );
  if (!(await verifyLeadershipFence())) {
    console.log(`[smart-wallet-cron][${requestId}] skip: not_leader`);
    return 0;
  }
  if (await ecoModeActive()) {
    console.log(`[smart-wallet-cron][${requestId}] skip: ECO_MODE`);
    return 0;
  }
  if (!skipWebhookDefer && (await shouldDeferBackfillForRecentWebhook())) {
    console.log(`[smart-wallet-cron][${requestId}] defer: recent webhook activity`);
    scheduleSmartWalletEnqueueAfterWebhookQuiet(requestId);
    return 0;
  }
  const queue = getSmartWalletQueue();

  const supabase = getSupabase();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("wallet_tokens")
    .select("wallet_address")
    .gte("bought_at", sevenDaysAgo);
  if (error) {
    console.warn(`[smart-wallet-cron][${requestId}] skipped:`, error.message);
    return 0;
  }

  const counts = new Map();
  for (const row of data || []) {
    const key = row?.wallet_address;
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const topWallets = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 100)
    .map(([addr]) => addr);
  let targetWallets = topWallets;

  if (!targetWallets.length) {
    const { data: seedRows, error: seedError } = await supabase
      .from("smart_wallets")
      .select("wallet_address")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (seedError) {
      console.warn(`[smart-wallet-cron][${requestId}] seed fallback skipped:`, seedError.message);
    } else {
      targetWallets = (seedRows || []).map((row) => row?.wallet_address).filter(Boolean);
    }
  }

  if (!queue) {
    const directLimit = getDirectLimit();
    const sample = targetWallets.slice(0, directLimit);
    let ok = 0;
    for (const walletAddress of sample) {
      try {
        await analyzeWallet(walletAddress);
        ok += 1;
      } catch (error) {
        console.warn(`[smart-wallet-cron][${requestId}] direct analysis failed (${walletAddress}): ${error.message}`);
      }
    }
    console.log(
      `[smart-wallet-cron][${requestId}] direct analysis complete at=${new Date().toISOString()} ok_wallets=${ok}/${sample.length}`
    );
    return ok;
  }

  for (const walletAddress of targetWallets) {
    await queue.add(
      "analyze-wallet",
      { walletAddress },
      {
        jobId: `smart-wallet_${walletAddress.replace(/:/g, "_")}`,
        priority: BULLMQ_PRIORITY_LOW,
        removeOnComplete: 500,
        removeOnFail: 500
      }
    );
  }
  console.log(
    `[smart-wallet-cron][${requestId}] enqueued at=${new Date().toISOString()} count=${targetWallets.length}`
  );
  return targetWallets.length;
}

function startSmartWalletCron() {
  if (legacyIntervalRef || scheduledTask) return;

  const legacyMs = Number(process.env.SMART_WALLET_CRON_INTERVAL_MS || 0);
  if (Number.isFinite(legacyMs) && legacyMs >= 60_000) {
    console.log(
      `[smart-wallet-cron] legacy interval_ms=${legacyMs} (${legacyMs / 3600000}h) — set SMART_WALLET_CRON_EXPRESSION for 2AM daily`
    );
    enqueueActiveWallets().catch((e) => console.warn("smart wallet bootstrap enqueue:", e.message));
    legacyIntervalRef = setInterval(() => {
      console.log(`[smart-wallet-cron] scheduled_tick at=${new Date().toISOString()}`);
      enqueueActiveWallets().catch((e) => console.warn("smart wallet scheduled enqueue:", e.message));
    }, legacyMs);
    return;
  }

  const expr = String(process.env.SMART_WALLET_CRON_EXPRESSION || DEFAULT_CRON_EXPRESSION).trim();
  const tz = String(process.env.SMART_WALLET_CRON_TZ || "UTC").trim() || "UTC";

  if (typeof cron.validate === "function" && !cron.validate(expr)) {
    console.warn(`[smart-wallet-cron] invalid CRON "${expr}", using ${LEGACY_INTERVAL_MS}ms interval`);
    enqueueActiveWallets().catch((e) => console.warn("smart wallet bootstrap enqueue:", e.message));
    legacyIntervalRef = setInterval(() => {
      enqueueActiveWallets().catch((e) => console.warn("smart wallet scheduled enqueue:", e.message));
    }, LEGACY_INTERVAL_MS);
    return;
  }

  scheduledTask = cron.schedule(
    expr,
    () => {
      console.log(`[smart-wallet-cron] cron_tick at=${new Date().toISOString()} expr=${expr}`);
      enqueueActiveWallets().catch((e) => console.warn("smart wallet scheduled enqueue:", e.message));
    },
    { timezone: tz }
  );
  console.log(`[smart-wallet-cron] node-cron expr="${expr}" timezone=${tz}`);
  enqueueActiveWallets().catch((e) => console.warn("smart wallet bootstrap enqueue:", e.message));
}

module.exports = { enqueueActiveWallets, startSmartWalletCron, getLastSmartWalletCronRun };
