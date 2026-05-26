"use strict";

/**
 * Internal health snapshots for the ops Architect Agent (no HTTP round-trip).
 * Mirrors GET /health*, /health/ingestion, /health/sync, /health/webhook-queue.
 */

const redis = require("../lib/cache");
const { getIngestionSnapshot, getDedupeStats } = require("../ingestion/ingestionState");
const { getMarketDataCircuitStatus, getMarketDataProviderStats } = require("../services/marketData");
const { getDataFreshnessSnapshot } = require("../services/homeTerminalApi");
const { getLeadershipHealthSnapshot, probeLeadershipLockRemote } = require("../services/leaderService");
const { getLastSmartWalletCronRun } = require("../jobs/smartWalletCron");
const { getProAlertCronStatus } = require("../jobs/proAlertCron");
const { getTacticalRegimeNotifyCronStatus } = require("../jobs/tacticalRegimeNotifyCron");
const { getSignalPriceCronStatus } = require("../jobs/smartWalletSignalPriceCron");
const { getSignalOutcomeCronStatus } = require("../jobs/signalOutcomeCron");
const { getCoordinationOutcomeCronStatus } = require("../jobs/coordinationOutcomeCron");
const { getSignalCalibratorCronStatus } = require("../jobs/signalCalibratorCron");
const { getOpsHeartbeatCronStatus } = require("../jobs/opsHeartbeatCron");
const { getMarketSnapshotWarmupStatus } = require("../jobs/marketSnapshotWarmupCron");
const { getSmartWalletSignalBackfillStatus } = require("../jobs/smartWalletSignalBackfillCron");
const { getDataFreshnessHistoryCronStatus } = require("../jobs/dataFreshnessHistoryCron");
const { getWalletBehaviorCronStatus } = require("../jobs/walletBehaviorCron");
const { getWalletCoordinationCronStatus } = require("../jobs/walletCoordinationCron");
const { getClusterBackfillStats, INTERVAL_MS: CLUSTER_BACKFILL_INTERVAL_MS } = require("../jobs/clusterBackfillCron");
const { getClusterRankingStats, INTERVAL_MS: CLUSTER_RANKING_INTERVAL_MS } = require("../jobs/clusterRankingCron");
const { getActiveProbes } = require("./clusterProbing");
const { getSignalGateOpsSnapshot } = require("../services/signalEmissionGate");
const { getSignalGateTunerCronStatus } = require("../jobs/signalGateTunerCron");
const { getClassifierStats } = require("../services/transactionClassifier");
const { isVapidKeyMaterialPresent } = require("./tacticalRegimeWebPush");

function isWorkersEnabled() {
  const raw = String(process.env.SMART_WORKERS_ENABLED || "true").trim().toLowerCase();
  return raw !== "false";
}

async function probeHealthMain() {
  const missingCritical = [];
  if (!process.env.HELIUS_WEBHOOK_SECRET) missingCritical.push("HELIUS_WEBHOOK_SECRET");
  if (!process.env.STRIPE_SECRET_KEY) missingCritical.push("STRIPE_SECRET_KEY");
  if (
    !process.env.STRIPE_WEBHOOK_SECRET &&
    !process.env.STRIPE_WEBHOOK_SECRET_ALT &&
    !process.env.STRIPE_WEBHOOK_SECRETS
  ) {
    missingCritical.push("STRIPE_WEBHOOK_SECRET*");
  }

  let cacheOk = null;
  try {
    await redis.set("health:ping", "1", { ex: 15 });
    const ping = await redis.get("health:ping");
    cacheOk = ping != null;
  } catch {
    cacheOk = false;
  }

  let leadershipRedisProbe = null;
  try {
    leadershipRedisProbe = await probeLeadershipLockRemote();
  } catch (e) {
    leadershipRedisProbe = { error: e?.message || "leadership_probe_exception" };
  }

  return {
    ok: missingCritical.length === 0,
    service: "sentinel-ledger-backend",
    commit:
      process.env.RAILWAY_GIT_COMMIT_SHA ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.COMMIT_SHA ||
      null,
    cache: cacheOk,
    redisRestConfigured: Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
    bullMqTcpConfigured: Boolean(
      process.env.BULLMQ_REDIS_URL || process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL
    ),
    heliusWebhookConfigured: Boolean(process.env.HELIUS_WEBHOOK_SECRET),
    webPushVapidKeysConfigured: isVapidKeyMaterialPresent(),
    missingCriticalSecrets: missingCritical,
    smartWorkersEnabled: isWorkersEnabled(),
    lastSmartWalletCronRun: getLastSmartWalletCronRun(),
    leadership: {
      ...getLeadershipHealthSnapshot(),
      redisProbe: leadershipRedisProbe
    },
    proAlerts: getProAlertCronStatus(),
    tacticalRegimeNotify: getTacticalRegimeNotifyCronStatus(),
    signalPrices: getSignalPriceCronStatus(),
    signalOutcomes: getSignalOutcomeCronStatus(),
    coordinationOutcomes: getCoordinationOutcomeCronStatus(),
    signalCalibrator: getSignalCalibratorCronStatus(),
    opsHeartbeat: getOpsHeartbeatCronStatus(),
    marketSnapshotWarmup: getMarketSnapshotWarmupStatus(),
    smartSignalBackfill: getSmartWalletSignalBackfillStatus(),
    dataFreshnessHistory: getDataFreshnessHistoryCronStatus(),
    walletBehavior: getWalletBehaviorCronStatus(),
    walletCoordination: getWalletCoordinationCronStatus(),
    clusterBackfill: {
      cronEnabled: true,
      tickIntervalMs: CLUSTER_BACKFILL_INTERVAL_MS,
      lastStats: getClusterBackfillStats()
    },
    clusterRanking: {
      cronEnabled: true,
      tickIntervalMs: CLUSTER_RANKING_INTERVAL_MS,
      activeProbes: getActiveProbes(),
      lastStats: getClusterRankingStats()
    },
    signalGate: getSignalGateOpsSnapshot(),
    signalGateTuner: getSignalGateTunerCronStatus(),
    classifier: getClassifierStats()
  };
}

function probeHealthIngestion() {
  const snap = getIngestionSnapshot();
  return {
    ok: snap.ingestionStatus !== "DEGRADED",
    status: snap.ingestionStatus,
    lastEventAt: snap.lastEventAt,
    lastEventAgeMs: snap.lastEventAgeMs,
    lastEventType: snap.lastEventType,
    totalEventsEmitted: snap.totalEventsEmitted,
    totalRawReceived: snap.totalRawReceived,
    normalizationLatencyEmaMs: snap.normalizationLatencyEmaMs,
    bufferDepth: snap.bufferDepth,
    sources: snap.sources,
    dedupe: getDedupeStats()
  };
}

async function probeHealthSync() {
  const snap = getIngestionSnapshot();
  const market = getMarketDataCircuitStatus();
  const providerRates = getMarketDataProviderStats();
  const freshness = await getDataFreshnessSnapshot();
  const dexTokenState = market?.providers?.dex_token || market?.dexscreener || {};
  const dexToken429Rate = Number(providerRates?.dex_token?.rate429 || 0);
  const dexTokenOpenMs =
    dexTokenState?.state === "OPEN" && Number(dexTokenState?.openedAt)
      ? Math.max(0, Date.now() - Number(dexTokenState.openedAt))
      : 0;
  return {
    status: snap.syncStatus,
    reason: snap.syncReason,
    latency_ms: snap.normalizationLatencyEmaMs,
    bufferDepth: snap.bufferDepth,
    networks: snap.networks,
    services: {
      scoring_engine: "operational",
      alert_dispatcher: "operational",
      market_data: market.degraded ? "degraded" : "operational"
    },
    providers: {
      dex: {
        "429Rate": dexToken429Rate,
        circuitOpenMs: dexTokenOpenMs
      }
    },
    dataFreshness: {
      signalsLatest: {
        realRatio24h: freshness?.signalsLatest?.realRatio24h || 0
      },
      tokensHot: {
        realRatio24h: freshness?.tokensHot?.realRatio24h || 0
      }
    },
    marketData: market,
    measuredAt: snap.now
  };
}

async function probeHealthWebhookQueue() {
  const { getWebhookScoringQueue, webhookWorkerEnabled } = require("../queues/webhookScoring.queue");
  const { getLastWebhookActivityMs, isPollerForceModeActive } = require("../lib/eventPriority");
  const q = getWebhookScoringQueue();
  let jobCounts = null;
  if (q) {
    jobCounts = await q.getJobCounts("waiting", "active", "delayed", "failed", "completed", "paused");
  }
  const lastMs = await getLastWebhookActivityMs();
  return {
    ok: true,
    ffWebhookWorker: webhookWorkerEnabled(),
    queueName: "webhook-scoring",
    jobCounts,
    lastWebhookActivityMs: lastMs,
    lastWebhookActivityIso: lastMs ? new Date(lastMs).toISOString() : null,
    pollerForceMode: await isPollerForceModeActive()
  };
}

/**
 * @param {"main"|"ingestion"|"sync"|"webhook-queue"|"all"} target
 */
async function probeHealth(target = "main") {
  const t = String(target || "main").toLowerCase();
  if (t === "ingestion") return { target: t, body: probeHealthIngestion() };
  if (t === "sync") return { target: t, body: await probeHealthSync() };
  if (t === "webhook-queue" || t === "webhook_queue") {
    return { target: "webhook-queue", body: await probeHealthWebhookQueue() };
  }
  if (t === "all") {
    const [main, sync, webhook] = await Promise.all([
      probeHealthMain(),
      probeHealthSync(),
      probeHealthWebhookQueue()
    ]);
    return {
      target: "all",
      body: {
        main,
        ingestion: probeHealthIngestion(),
        sync,
        webhookQueue: webhook
      }
    };
  }
  return { target: "main", body: await probeHealthMain() };
}

module.exports = {
  probeHealth,
  probeHealthMain,
  probeHealthIngestion,
  probeHealthSync,
  probeHealthWebhookQueue
};
