const cron = require("node-cron");
const { getSupabase } = require("../lib/supabase");
const { getOpsPostgresPool } = require("../lib/opsPostgresPool");
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
const { fetchLeaderboardWalletAddresses } = require("../lib/smartWalletLeaderboardPool");

/** Fase 4: por defecto 02:00 UTC diario. Rollback: SMART_WALLET_CRON_INTERVAL_MS=21600000 */
const DEFAULT_CRON_EXPRESSION = "0 2 * * *";
const LEGACY_INTERVAL_MS = 6 * 60 * 60 * 1000;
const CRON_RETRY_JOB_NAME = "smart-wallet-cron-retry";

let legacyIntervalRef = null;
let scheduledTask = null;
/** One-shot retry after webhook quiet window (fallback when BullMQ unavailable). */
let deferredWebhookRetryTimer = null;
/** ISO timestamp of last `enqueueActiveWallets` invocation (set before skips/defers). */
let lastCronRun = null;
/** ISO timestamp of last staleness-cap forced run (ignores webhook defer). */
let lastForceRunAt = null;

function getLastSmartWalletCronRun() {
  return lastCronRun;
}

function maxStalenessMinutesCap() {
  const raw = Number(process.env.SMART_WALLET_MAX_STALENESS_MIN ?? 90);
  if (!Number.isFinite(raw) || raw <= 0) return 90;
  return Math.min(24 * 60, Math.floor(raw));
}

/** Minutes since MAX(last_checked_at) — Infinity when no wallet has ever been polled. */
async function getSmartWalletPollStalenessMinutes() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("smart_wallets")
    .select("last_checked_at")
    .not("last_checked_at", "is", null)
    .order("last_checked_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data?.last_checked_at) return Infinity;
  return (Date.now() - new Date(data.last_checked_at).getTime()) / 60_000;
}

function getSmartWalletCronHealthSnapshot() {
  return {
    lastEnqueueIso: lastCronRun,
    lastForceRunAt,
    maxStalenessCapMin: maxStalenessMinutesCap()
  };
}

function getDirectLimit() {
  const raw = Number(process.env.SMART_WALLET_DIRECT_LIMIT || 20);
  if (!Number.isFinite(raw) || raw <= 0) return 20;
  return Math.min(100, Math.floor(raw));
}

function refreshLeaderboardEnabled() {
  return String(process.env.SMART_WALLET_REFRESH_LEADERBOARD ?? "true").trim().toLowerCase() !== "false";
}

function refreshLeaderboardLimit() {
  const raw = Number(process.env.SMART_WALLET_REFRESH_LEADERBOARD_LIMIT ?? 240);
  if (!Number.isFinite(raw) || raw <= 0) return 240;
  return Math.min(1000, Math.floor(raw));
}

function cronUnionMax() {
  const raw = Number(process.env.SMART_WALLET_CRON_UNION_MAX ?? 240);
  if (!Number.isFinite(raw) || raw <= 0) return 240;
  return Math.min(1000, Math.floor(raw));
}

function safeAddrForJobId(walletAddress) {
  return String(walletAddress || "").replace(/:/g, "_");
}

function cronJobBucketMinutes() {
  const raw = Number(process.env.SMART_WALLET_CRON_JOB_BUCKET_MINUTES ?? 60);
  if (!Number.isFinite(raw) || raw <= 0) return 60;
  return Math.min(60, Math.floor(raw));
}

/**
 * UTC time bucket for stable BullMQ jobId. bucketMinutes>=60 → YYYYMMDDHH (legacy hourly).
 * bucketMinutes<60 → YYYYMMDDHH + zero-padded minute slot (e.g. 10 → 00,10,…,50).
 */
function cronJobTimeBucket(d = new Date()) {
  const bucketMin = cronJobBucketMinutes();
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const prefix = `${y}${mo}${day}${h}`;
  if (bucketMin >= 60) return prefix;
  const slot = Math.floor(d.getUTCMinutes() / bucketMin) * bucketMin;
  return `${prefix}${String(slot).padStart(2, "0")}`;
}

/** UTC bucketed jobId so each cron tick can enqueue a fresh analyze-wallet job. */
function cronAnalyzeWalletJobId(walletAddress, at = new Date()) {
  const bucket = cronJobTimeBucket(at);
  return `smart-wallet_${safeAddrForJobId(walletAddress)}_${bucket}`.slice(0, 200);
}

async function enqueueAnalyzeWalletJob(queue, walletAddress, requestId) {
  const jobId = cronAnalyzeWalletJobId(walletAddress);
  try {
    await queue.add(
      "analyze-wallet",
      { walletAddress },
      {
        jobId,
        priority: BULLMQ_PRIORITY_LOW,
        removeOnComplete: { count: 1000, age: 3600 },
        removeOnFail: { count: 500, age: 86400 }
      }
    );
    return true;
  } catch (e) {
    const msg = e?.message || String(e);
    if (/already exists|duplicate job id/i.test(msg)) return false;
    console.warn(
      `[smart-wallet-cron][${requestId}] enqueue analyze-wallet failed (${String(walletAddress).slice(0, 6)}…):`,
      msg
    );
    return false;
  }
}

/** Sync total_trades from wallet_tokens for wallets without signal-derived win_rate. */
const SYNC_TOTAL_TRADES_FROM_WALLET_TOKENS_SQL = `
UPDATE smart_wallets sw
SET total_trades = wt.cnt, updated_at = NOW()
FROM (
  SELECT wallet_address, COUNT(*) AS cnt
  FROM wallet_tokens
  GROUP BY wallet_address
) wt
WHERE sw.wallet_address = wt.wallet_address
AND (sw.win_rate IS NULL OR sw.win_rate = 0)
`;

async function syncTotalTradesFromWalletTokens(requestId) {
  const pool = getOpsPostgresPool();
  if (!pool) {
    console.warn(
      `[smart-wallet-cron][${requestId}] sync total_trades skipped: DATABASE_URL or SUPABASE_DB_PASSWORD required`
    );
    return;
  }
  try {
    const result = await pool.query(SYNC_TOTAL_TRADES_FROM_WALLET_TOKENS_SQL);
    console.log(
      `[smart-wallet-cron][${requestId}] sync total_trades from wallet_tokens updated=${result.rowCount ?? 0}`
    );
  } catch (error) {
    console.warn(
      `[smart-wallet-cron][${requestId}] sync total_trades failed:`,
      error?.message || error
    );
  }
}

async function scheduleSmartWalletEnqueueAfterWebhookQuiet(triggerRequestId) {
  const quiet = backfillQuietMinutes();
  const delayMs = Math.max(60_000, (quiet + 1) * 60 * 1000);
  const queue = getSmartWalletQueue();

  if (queue) {
    const bucket = cronJobTimeBucket();
    const jobId = `sw_cron_defer_retry_${bucket}`.slice(0, 200);
    try {
      await queue.add(
        CRON_RETRY_JOB_NAME,
        { trigger: "webhook-defer-retry", skipWebhookDefer: true, triggerRequestId },
        {
          jobId,
          delay: delayMs,
          priority: BULLMQ_PRIORITY_LOW,
          removeOnComplete: { count: 1000, age: 3600 },
          removeOnFail: { count: 500, age: 86400 }
        }
      );
      console.log(
        `[smart-wallet-cron][${triggerRequestId}] scheduled BullMQ retry in ${Math.round(delayMs / 60000)}m jobId=${jobId}`
      );
      return;
    } catch (e) {
      const msg = e?.message || String(e);
      if (/already exists|duplicate job id/i.test(msg)) {
        console.log(
          `[smart-wallet-cron][${triggerRequestId}] defer retry already scheduled (BullMQ jobId=${jobId})`
        );
        return;
      }
      console.warn(`[smart-wallet-cron][${triggerRequestId}] BullMQ retry enqueue failed:`, msg);
    }
  }

  if (deferredWebhookRetryTimer != null) {
    console.log(
      `[smart-wallet-cron][${triggerRequestId}] defer retry already scheduled, skipping duplicate`
    );
    return;
  }
  console.log(
    `[smart-wallet-cron][${triggerRequestId}] scheduling in-process retry in ${Math.round(delayMs / 60000)}m (post webhook quiet, no BullMQ)`
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
  let skipWebhookDefer = Boolean(options?.skipWebhookDefer);
  lastCronRun = new Date().toISOString();
  const requestId = randomUUID();
  const runAt = new Date().toISOString();

  const stalenessMin = await getSmartWalletPollStalenessMinutes();
  const maxStaleness = maxStalenessMinutesCap();
  if (!skipWebhookDefer && stalenessMin > maxStaleness) {
    console.log(
      `[smart-wallet-cron][${requestId}] force run: staleness ${Math.round(stalenessMin)}min > ${maxStaleness}min cap`
    );
    skipWebhookDefer = true;
    lastForceRunAt = new Date().toISOString();
  }

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
    await scheduleSmartWalletEnqueueAfterWebhookQuiet(requestId);
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

  const activitySet = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 100)
    .map(([addr]) => addr);
  let targetWallets = activitySet;
  let leaderboardCount = 0;

  if (refreshLeaderboardEnabled()) {
    try {
      const leaderboardSet = await fetchLeaderboardWalletAddresses(supabase, {
        limit: refreshLeaderboardLimit()
      });
      leaderboardCount = leaderboardSet.length;
      const unionMax = cronUnionMax();
      targetWallets = [...new Set([...activitySet, ...leaderboardSet])].slice(0, unionMax);
    } catch (lbErr) {
      console.warn(
        `[smart-wallet-cron][${requestId}] leaderboard pool skipped:`,
        lbErr?.message || lbErr
      );
    }
  }

  console.log(
    `[smart-wallet-cron][${requestId}] wallet_pool activity=${activitySet.length} leaderboard=${leaderboardCount} union=${targetWallets.length}`
  );

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

  let processedCount = 0;
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
    processedCount = ok;
  } else {
    let enqueued = 0;
    for (const walletAddress of targetWallets) {
      if (await enqueueAnalyzeWalletJob(queue, walletAddress, requestId)) enqueued += 1;
    }
    console.log(
      `[smart-wallet-cron][${requestId}] enqueued at=${new Date().toISOString()} ok=${enqueued}/${targetWallets.length}`
    );
    processedCount = enqueued;
  }

  await syncTotalTradesFromWalletTokens(requestId);
  return processedCount;
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

module.exports = {
  CRON_RETRY_JOB_NAME,
  enqueueActiveWallets,
  startSmartWalletCron,
  getLastSmartWalletCronRun,
  getSmartWalletCronHealthSnapshot,
  getSmartWalletPollStalenessMinutes
};
