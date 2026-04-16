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
const { startDeployerWorker } = require("./queues/deployerWorker");
const { startTelegramBot } = require("./bots/telegramBot");

const app = express();
app.set("trust proxy", 1);
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true } });
global.io = io;

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
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
  res.json({ ok: true, service: "sentinel-ledger-backend" })
);

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/token", tokenRouter);
app.use("/api/v1/smart-wallets", smartWalletsRouter);
app.use("/api/v1/watchlist", watchlistRouter);
app.use("/api/v1/webhooks", heliusWebhookRouter);
app.use("/api/v1/bots/omni", omniBotsRouter);

io.on("connection", (socket) => {
  socket.on("join-token", (address) => {
    if (address) socket.join(address);
  });
  socket.on("leave-token", (address) => {
    if (address) socket.leave(address);
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  startDeployerWorker();
  startTelegramBot();
  console.log(`Sentinel Ledger backend on :${port}`);
});

