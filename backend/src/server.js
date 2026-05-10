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
const openaiAgentRouter = require("./routes/openaiAgent");
const { startDeployerWorker } = require("./queues/deployerWorker");
const { startSmartWalletWorker } = require("./workers/smartWallet.worker");
const { startWebhookScoringWorker } = require("./workers/webhookScoringWorker");
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
  runClusterBackfillCron,
  getClusterBackfillStats,
  INTERVAL_MS: CLUSTER_BACKFILL_INTERVAL_MS
} = require("./jobs/clusterBackfillCron");
const {
  runClusterRankingCron,
  getClusterRankingStats,
  INTERVAL_MS: CLUSTER_RANKING_INTERVAL_MS
} = require("./jobs/clusterRankingCron");
const { getActiveProbes } = require("./services/clusterProbing");
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
const botRouter = require("./routes/bot");const opsAgentRouter = require("./routes/opsAgent");
const guestTrialRouter = require("./routes/guestTrial");
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
const { getBudgetHealthJson } = require("./services/budgetGuard");
const { isVapidKeyMaterialPresent } = require("./services/tacticalRegimeWebPush");
const { getSignalGateOpsSnapshot } = require("./services/signalEmissionGate");
const { getClassifierStats } = require("./services/transactionClassifier");
const sentinelOrchestrator = require("./orchestrator/sentinelOrchestrator");
const {
  startSignalGateTunerCron,
  getSignalGateTunerCronStatus,
  runSignalGateTunerTick,
  isSignalGateTunerCronEnabled
} = require("./jobs/signalGateTunerCron");
const { startWebhookPollerWatchdog } = require("./jobs/watchdogWebhook");

const app = express();
app.set("trust proxy", 1);
const server = http.createServer(app);
const io = new Server(server, { cors: socketIoCors });
global.io = io;

app.use(helmet());
app.use(cors(corsMiddlewareOptions));
app.use(express.json({ limit: "1mb" }));

app.use("/api/openai", openaiAgentRouter);

app.get("/health/live", (_req, res) => {
  res.json({
    ok: true,
    service: "sentinel-ledger-backend"
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
app.use("/api/v1/bot", botRouter);app.use("/api/v1/ops/agent", opsAgentRouter);
app.use("/api/v1/trial", guestTrialRouter);
app.use("/api/v1", billingRouter);
app.use("/api/v1/webhooks", heliusWebhookRouter);
app.use("/api/v1/bots/omni", omniBotsRouter);

const port = Number(process.env.PORT) || 3000;

server.listen(port, () => {
  console.log(`[bootstrap] Sentinel Ledger backend listening on :${port}`);
});
