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
const { billingRouter, stripeWebhookHandler } = require("./routes/billing");
const { startDeployerWorker } = require("./queues/deployerWorker");
const { startTelegramBot } = require("./bots/telegramBot");
const { startSubscriptionExpiryCron } = require("./services/subscriptionCron");
const { corsMiddlewareOptions, socketIoCors } = require("./lib/corsOptions");
const { isProbableSolanaPubkey } = require("./lib/solanaAddress");

const app = express();
app.set("trust proxy", 1);
const server = http.createServer(app);
const io = new Server(server, { cors: socketIoCors });
global.io = io;

app.use(helmet());
app.use(cors(corsMiddlewareOptions));
app.post(
  "/api/v1/stripe-webhook",
  express.raw({ type: "application/json" }),
  stripeWebhookHandler
);
app.use(express.json({ limit: "1mb" }));

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false
  })
);

app.get("/health", (_, res) =>
  res.json({
    ok: true,
    service: "sentinel-ledger-backend",
    commit:
      process.env.RAILWAY_GIT_COMMIT_SHA ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.COMMIT_SHA ||
      null
  })
);

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/token", tokenRouter);
app.use("/api/v1/smart-wallets", smartWalletsRouter);
app.use("/api/v1/watchlist", watchlistRouter);
app.use("/api/v1/user", userRouter);
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
  startDeployerWorker();
  startTelegramBot();
  startSubscriptionExpiryCron();
  console.log(`Sentinel Ledger backend on :${port}`);
});
