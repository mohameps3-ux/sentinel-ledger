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
  startSmartWalletSignalPriceCron,
  getSignalPriceCronStatus
} = require("./jobs/smartWalletSignalPriceCron");
const publicSurfaceRouter = require("./routes/publicSurface");
const portfolioRouter = require("./routes/portfolio");
const signalsRouter = require("./routes/signals");
const tokensRouter = require("./routes/tokens");
const nluRouter = require("./routes/nlu");
const walletStalkerRouter = require("./routes/walletStalker");
const { startTelegramBot } = require("./bots/telegramBot");
const { startSubscriptionExpiryCron } = require("./services/subscriptionCron");
const { corsMiddlewareOptions, socketIoCors } = require("./lib/corsOptions");
const { isProbableSolanaPubkey } = require("./lib/solanaAddress");
const redis = require("./lib/cache");

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
app.use(express.json({ limit: "1mb" }));

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
    missingCriticalSecrets: missingCritical,
    smartWorkersEnabled: isWorkersEnabled(),
    proAlerts: getProAlertCronStatus(),
    signalPrices: getSignalPriceCronStatus()
  };
  if (missingCritical.length) {
    return res.status(503).json(body);
  }
  return res.json(body);
});

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/token", tokenRouter);
app.use("/api/v1/smart-wallets", smartWalletsRouter);
app.use("/api/v1/watchlist", watchlistRouter);
app.use("/api/v1/portfolio", portfolioRouter);
app.use("/api/v1/signals", signalsRouter);
app.use("/api/v1/tokens", tokensRouter);
app.use("/api/v1/wallet-stalker", walletStalkerRouter);
app.use("/api/v1/nlu", nluRouter);
app.use("/api/v1/user", userRouter);
app.use("/api/v1/alerts", alertsRouter);
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

const port = process.env.PORT || 3000;
server.listen(port, () => {
  if (isWorkersEnabled()) {
    startDeployerWorker();
    startSmartWalletWorker();
    startSmartWalletCron();
  } else {
    console.log("Background workers disabled via SMART_WORKERS_ENABLED=false");
  }
  startTelegramBot();
  startProAlertCron();
  startSmartWalletSignalPriceCron();
  startSubscriptionExpiryCron();
  console.log(`Sentinel Ledger backend on :${port}`);
});
