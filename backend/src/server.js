require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");

const { authRouter } = require("./routes/auth");
const tokenRouter = require("./routes/token");
const heliusWebhookRouter = require("./routes/heliusWebhook");
const watchlistRouter = require("./routes/watchlist");
const smartWalletsRouter = require("./routes/smartWallets");
const omniBotsRouter = require("./routes/omniBots");
const userRouter = require("./routes/user");
const alertsRouter = require("./routes/alerts");
const { billingRouter, stripeWebhookHandler } = require("./routes/billing");
const { startDeployerWorker } = require("./queues/deployerWorker");
const { startSmartWalletWorker } = require("./workers/smartWallet.worker");
const { startSmartWalletCron } = require("./jobs/smartWalletCron");
const { startProAlertCron, getProAlertCronStatus } = require("./jobs/proAlertCron");
const {
  startTacticalRegimeNotifyCron,
  getTacticalRegimeNotifyCronStatus
} = require("./jobs/tacticalRegimeNotifyCron");
const {
  startSmartWalletSignalPriceCron,
  getSignalPriceCronStatus
} = require("./jobs/smartWalletSignalPriceCron");
const {
  startSignalOutcomeCron,
  getSignalOutcomeCronStatus
} = require("./jobs/signalOutcomeCron");
const {
  startCoordinationOutcomeCron,
  getCoordinationOutcomeCronStatus,
  isCoordinationResolutionActive
} = require("./jobs/coordinationOutcomeCron");
const { runCoordinationOutcomeResolutionOnce } = require("./services/coordinationOutcomes");
const {
  startSignalCalibratorCron,
  getSignalCalibratorCronStatus,
  runSignalCalibratorTick
} = require("./jobs/signalCalibratorCron");
const {
  startOpsHeartbeatCron,
  getOpsHeartbeatCronStatus
} = require("./jobs/opsHeartbeatCron");
const {
  startMarketSnapshotWarmupCron,
  getMarketSnapshotWarmupStatus
} = require("./jobs/marketSnapshotWarmupCron");
const {
  startSmartWalletSignalBackfillCron,
  getSmartWalletSignalBackfillStatus
} = require("./jobs/smartWalletSignalBackfillCron");
const {
  startDataFreshnessHistoryCron,
  getDataFreshnessHistoryCronStatus
} = require("./jobs/dataFreshnessHistoryCron");
const {
  startWalletBehaviorCron,
  getWalletBehaviorCronStatus
} = require("./jobs/walletBehaviorCron");
const {
  startWalletCoordinationCron,
  getWalletCoordinationCronStatus
} = require("./jobs/walletCoordinationCron");
const { startFlipsideSyncCron } = require("./jobs/flipsideSyncCron");
const { startSolanaPoller } = require("./services/solanaPoller");
const { startValidationOracle } = require("./workers/validationOracle");
const { startPromotionCron: startAutoDiscoveryPromotionCron } = require("./workers/autoDiscovery");
const publicSurfaceRouter = require("./routes/publicSurface");
const portfolioRouter = require("./routes/portfolio");
const signalsRouter = require("./routes/signals");
const tokensRouter = require("./routes/tokens");
const nluRouter = require("./routes/nlu");
const walletStalkerRouter = require("./routes/walletStalker");
const walletNarrativeRouter = require("./routes/walletNarrative");
const scoringRouter = require("./routes/scoring");
const opsRouter = require("./routes/ops");
const pushRouter = require("./routes/push");
const telemetryRouter = require("./routes/telemetry");
const { verifyFreshnessHistorySignedExport } = require("./lib/freshnessSignedExport");
const { startTelegramBot } = require("./bots/telegramBot");
const { startSubscriptionExpiryCron } = require("./services/subscriptionCron");
const { corsMiddlewareOptions, socketIoCors } = require("./lib/corsOptions");
const { isProbableSolanaPubkey } = require("./lib/solanaAddress");
const redis = require("./lib/cache");
const { getIngestionSnapshot } = require("./ingestion/ingestionState");
const { getDedupeStats } = require("./ingestion/dedupe");
const { getMarketDataCircuitStatus, getMarketDataProviderStats } = require("./services/marketData");
const { getDataFreshnessSnapshot } = require("./services/homeTerminalApi");
const { isVapidKeyMaterialPresent } = require("./services/tacticalRegimeWebPush");
const { getSignalGateOpsSnapshot } = require("./services/signalEmissionGate");
const sentinelOrchestrator = require("./orchestrator/sentinelOrchestrator");
const {
  startSignalGateTunerCron,
  getSignalGateTunerCronStatus,
  runSignalGateTunerTick,
  isSignalGateTunerCronEnabled
} = require("./jobs/signalGateTunerCron");

/** Stripe envía `application/json; charset=utf-8`; el matcher por string estricto a veces no aplica raw. */
function stripeWebhookRawBody() {
  return express.raw({
    type: (req) => {
      const ct = String(req.headers["content-type"] || "").toLowerCase();
      return ct.includes("application/json");
    },
    limit: "1mb"
  });
}

function isWorkersEnabled() {
  const raw = String(process.env.SMART_WORKERS_ENABLED || "true").trim().toLowerCase();
  return raw !== "false";
}

const app = express();
app.set("trust proxy", 1);
const server = http.createServer(app);
const io = new Server(server, { cors: socketIoCors });
global.io = io;

app.use(helmet());
app.use(cors(corsMiddlewareOptions));
app.post(
  "/api/v1/stripe-webhook",
  stripeWebhookRawBody(),
  stripeWebhookHandler
);
// Alias for Stripe dashboard misconfigurations using /webhooks/stripe path.
app.post(
  "/api/v1/webhooks/stripe",
  stripeWebhookRawBody(),
  stripeWebhookHandler
);
app.use("/api/v1/nlu", express.json({ limit: "16kb" }));
app.use("/api/v1/bots/omni", express.json({ limit: "32kb" }));
app.use("/api/v1/public", express.json({ limit: "32kb" }));

const verifySignedExportLimiter = rateLimit({
  windowMs: Math.max(60_000, Number(process.env.FRESHNESS_HISTORY_VERIFY_WINDOW_MS || 900_000)),
  max: Math.max(1, Math.floor(Number(process.env.FRESHNESS_HISTORY_VERIFY_MAX_PER_WINDOW || 30))),
  standardHeaders: true,
  legacyHeaders: false
});

function signedExportVerifyEnabled() {
  return String(process.env.FRESHNESS_HISTORY_VERIFY_ENABLED || "true").toLowerCase() !== "false";
}

/**
 * F4.7 — Public integrity verification for signed freshness exports.
 * No auth: third parties POST the full export JSON; server returns PASS/FAIL only (secret never leaves).
 * Stricter body limit + dedicated rate limit (abuse protection).
 */
app.post(
  "/api/v1/ops/verify-signed-export",
  express.json({ limit: "4mb" }),
  verifySignedExportLimiter,
  (req, res) => {
    if (!signedExportVerifyEnabled()) {
      return res.status(404).json({ ok: false, error: "not_found" });
    }
    const out = verifyFreshnessHistorySignedExport(req.body);
    if (!out.ok) {
      return res.status(503).json({ ok: false, error: out.reason || "verify_unavailable" });
    }
    return res.status(200).json({
      ok: true,
      valid: out.valid,
      hashMatches: out.hashMatches,
      proofInputMatches: out.proofInputMatches,
      signatureMatches: out.signatureMatches,
      reason: out.valid ? null : out.reason,
      hashAlgorithm: "sha256",
      signatureAlgorithm: out.signatureAlgorithm || null
    });
  }
);

app.use(express.json({ limit: "1mb" }));

/**
 * Liveness: process is accepting HTTP. Does not validate Stripe/Helius secrets
 * (those are reflected in GET /health, which may return 503 until configured).
 */
app.get("/health/live", (_req, res) => {
  res.json({
    ok: true,
    service: "sentinel-ledger-backend",
    commit:
      process.env.RAILWAY_GIT_COMMIT_SHA ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.COMMIT_SHA ||
      null
  });
});

app.use("/api/v1/public", publicSurfaceRouter);

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false
  })
);

app.get("/health", async (_, res) => {
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

  const body = {
    ok: missingCritical.length === 0,
    service: "sentinel-ledger-backend",
    commit:
      process.env.RAILWAY_GIT_COMMIT_SHA ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.COMMIT_SHA ||
      null,
    cache: cacheOk,
    redisRestConfigured: Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
    bullMqTcpConfigured: Boolean(process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL),
    heliusWebhookConfigured: Boolean(process.env.HELIUS_WEBHOOK_SECRET),
    webPushVapidKeysConfigured: isVapidKeyMaterialPresent(),
    missingCriticalSecrets: missingCritical,
    smartWorkersEnabled: isWorkersEnabled(),
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
    signalGate: getSignalGateOpsSnapshot(),
    signalGateTuner: getSignalGateTunerCronStatus()
  };
  if (missingCritical.length) {
    return res.status(503).json(body);
  }
  return res.json(body);
});

/**
 * L2 — Ingestion feed health.
 * DEGRADED if no SentinelEvent observed in the last 60s; WAITING before the first event.
 * Always returns 200 so uptime monitors don't false-alarm during cold starts; consumers
 * must read `status` to decide.
 */
app.get("/health/ingestion", (_req, res) => {
  const snap = getIngestionSnapshot();
  res.json({
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
  });
});

/**
 * L3 — Sync state. Compares internal state vs chain reality. The frontend LED
 * (LIVE / SYNCING) reads this endpoint.
 */
app.get("/health/sync", async (_req, res) => {
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
  res.json({
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
  });
});

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/token", tokenRouter);
app.use("/api/v1/smart-wallets", smartWalletsRouter);
app.use("/api/v1/watchlist", watchlistRouter);
app.use("/api/v1/portfolio", portfolioRouter);
app.use("/api/v1/signals", signalsRouter);
app.use("/api/v1/tokens", tokensRouter);
app.use("/api/v1/scoring", scoringRouter);
app.use("/api/v1/ops", opsRouter);
app.use("/api/v1/wallet-stalker", walletStalkerRouter);
app.use("/api/v1/wallets", walletNarrativeRouter);
app.use("/api/v1/nlu", nluRouter);
app.use("/api/v1/user", userRouter);
app.use("/api/v1/alerts", alertsRouter);
app.use("/api/v1/push", pushRouter);
app.use("/api/v1/telemetry", telemetryRouter);
app.use("/api/v1", billingRouter);
app.use("/api/v1/webhooks", heliusWebhookRouter);
app.use("/api/v1/bots/omni", omniBotsRouter);

io.on("connection", (socket) => {
  socket.on("join-token", (address) => {
    if (typeof address !== "string" || !isProbableSolanaPubkey(address)) return;
    socket.join(address);
  });
  socket.on("leave-token", (address) => {
    if (typeof address !== "string" || !isProbableSolanaPubkey(address)) return;
    socket.leave(address);
  });
  socket.on("join-user", (payload) => {
    const token = typeof payload?.token === "string" ? payload.token : "";
    if (!token || !process.env.JWT_SECRET) return;
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (!decoded?.userId) return;
      socket.join(`user:${decoded.userId}`);
    } catch (_) {}
  });
});

const port = Number(process.env.PORT) || 3000;

/**
 * Hidrata calibración + adaptive gate desde DB, arranca crons y workers, y abre el puerto al final
 * (sin aceptar tráfico mientras el estado no está al menos calentado de forma best-effort).
 */
async function bootstrap() {
  console.log("[bootstrap] Hydrating signal calibrator + signal gate + coordination outcomes (best-effort)...");
  const gateRun = isSignalGateTunerCronEnabled() ? runSignalGateTunerTick() : Promise.resolve(null);
  const coordOutRun = isCoordinationResolutionActive() ? runCoordinationOutcomeResolutionOnce() : Promise.resolve(null);
  const hydration = await Promise.allSettled([runSignalCalibratorTick(), gateRun, coordOutRun]);
  for (const [i, r] of hydration.entries()) {
    if (r.status === "rejected") {
      console.warn(`[bootstrap] hydration[${i}] failed:`, r.reason?.message || r.reason);
    }
  }
  const tunerWarmed =
    isSignalGateTunerCronEnabled() && hydration[1] && hydration[1].status === "fulfilled";
  const coordOutWarmed = isCoordinationResolutionActive() && hydration[2] && hydration[2].status === "fulfilled";

  if (isWorkersEnabled()) {
    startDeployerWorker();
    startSmartWalletWorker();
    startSmartWalletCron();
  } else {
    console.log("Background workers disabled via SMART_WORKERS_ENABLED=false");
  }
  startTelegramBot();
  startSolanaPoller();
  startProAlertCron();
  startTacticalRegimeNotifyCron();
  startSmartWalletSignalPriceCron();
  startSignalOutcomeCron();
  startValidationOracle();
  startAutoDiscoveryPromotionCron();
  startCoordinationOutcomeCron({ skipInitialTick: Boolean(coordOutWarmed) });
  startSignalCalibratorCron({ skipInitialTick: true });
  startOpsHeartbeatCron();
  startMarketSnapshotWarmupCron();
  startSmartWalletSignalBackfillCron();
  startDataFreshnessHistoryCron();
  startWalletBehaviorCron();
  startWalletCoordinationCron();
  startFlipsideSyncCron();
  startSignalGateTunerCron({ skipInitialTick: tunerWarmed });
  startSubscriptionExpiryCron();
  sentinelOrchestrator.start(io);
  return new Promise((resolve, reject) => {
    server.listen(port, () => {
      console.log(
        `[bootstrap] Sentinel Ledger backend listening on :${port} (signal path warmed: calibrator=ok, gateTuner=${
          tunerWarmed ? "ok" : "deferred"
        }, coordinationOutcomes=${coordOutWarmed ? "ok" : isCoordinationResolutionActive() ? "deferred" : "off"})`
      );
      resolve();
    });
    server.once("error", reject);
  });
}

bootstrap().catch((e) => {
  console.error("[bootstrap] fatal:", e);
  process.exit(1);
});
