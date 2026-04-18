require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

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
const publicSurfaceRouter = require("./routes/publicSurface");
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
  let cacheOk = null;
  try {
    await redis.set("health:ping", "1", { ex: 15 });
    const ping = await redis.get("health:ping");
    cacheOk = ping != null;
  } catch {
    cacheOk = false;
  }

  res.json({
    ok: true,
    service: "sentinel-ledger-backend",
    commit:
      process.env.RAILWAY_GIT_COMMIT_SHA ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.COMMIT_SHA ||
      null,
    cache: cacheOk,
    redisRestConfigured: Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
    bullMqTcpConfigured: Boolean(process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL),
    smartWorkersEnabled: isWorkersEnabled(),
    proAlerts: getProAlertCronStatus()
  });
});

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/token", tokenRouter);
app.use("/api/v1/smart-wallets", smartWalletsRouter);
app.use("/api/v1/watchlist", watchlistRouter);
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
  startSubscriptionExpiryCron();
  console.log(`Sentinel Ledger backend on :${port}`);
});
