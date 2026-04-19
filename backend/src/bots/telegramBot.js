const { Telegraf } = require("telegraf");
const redis = require("../lib/cache");
const { getSupabase } = require("../lib/supabase");
const { getMarketData } = require("../services/marketData");
const { getAnalysis } = require("../services/riskEngine");
const { tokenPageUrl } = require("../services/marketingLinks");
const { postMarketingTweet } = require("../services/xMarketing");
const { detectIntent, executeIntent, formatNluResponse } = require("../services/nluEngine");

let bot = null;

function isTruthy(value) {
  return String(value || "").trim().toLowerCase() === "true";
}

function fmtUsdPrice(n) {
  const x = Number(n || 0);
  if (!Number.isFinite(x)) return "0";
  const abs = Math.abs(x);
  const maxFrac = abs >= 1 ? 2 : abs >= 0.01 ? 6 : 8;
  return x.toLocaleString("en-US", { maximumFractionDigits: maxFrac, minimumFractionDigits: 0 });
}

function buildScanMessage(address, marketData, analysis) {
  const grade = analysis?.grade || "?";
  const confidence = analysis?.confidence ?? 0;
  const symbol = marketData?.symbol || "TOKEN";
  const pros = (analysis?.pros || []).slice(0, 2).map((p) => `+ ${p}`).join("\n");
  const cons = (analysis?.cons || []).slice(0, 2).map((c) => `- ${c}`).join("\n");

  return [
    `🛰️ Sentinel Scan: ${symbol}`,
    `Mint: ${address}`,
    `Grade: ${grade} (${confidence}%)`,
    `Price: $${fmtUsdPrice(marketData?.price)}`,
    "",
    pros ? `Pros:\n${pros}` : "",
    cons ? `Cons:\n${cons}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

async function sendGradeAlert(tokenAddress, analysis, marketData) {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!bot || !chatId) return;
  if (!analysis || !["A+", "A"].includes(analysis.grade)) return;

  const cooldownKey = `tg:grade-alert:${tokenAddress}:${analysis.grade}`;
  const seen = await redis.get(cooldownKey);
  if (seen) return;

  const url = tokenPageUrl(tokenAddress);
  const sym = marketData?.symbol || "TOKEN";
  const msg = [
    "🚨 Sentinel Grade Alert",
    `Token: ${sym} (${tokenAddress})`,
    `Grade: ${analysis.grade} (${analysis.confidence}%)`,
    `Price: $${fmtUsdPrice(marketData?.price)}`,
    "",
    `Scout in app: ${url}`
  ].join("\n");

  await bot.telegram.sendMessage(chatId, msg);
  await redis.set(cooldownKey, "1", { ex: 60 * 30 });

  const tweet = `🛰️ Sentinel · ${sym} graded ${analysis.grade} (${analysis.confidence}%) — scout on-chain intel\n${url}`;
  const x = await postMarketingTweet(tweet);
  if (!x.ok && x.reason !== "twitter_not_configured") {
    console.warn("grade alert X post:", x.reason);
  }
}

async function sendTelegramText(text) {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!bot || !chatId || !text) return false;
  await bot.telegram.sendMessage(chatId, text);
  return true;
}

/** One alert per mint per hour when wallet heuristics are high (dedup Redis). */
async function sendWalletThreatAlert(tokenAddress, walletIntel, marketData) {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!bot || !chatId || !walletIntel || walletIntel.level !== "high") return;

  const cooldownKey = `tg:wallet-threat:${tokenAddress}`;
  try {
    const seen = await redis.get(cooldownKey);
    if (seen) return;
  } catch (e) {
    console.warn("wallet-threat redis read:", e.message);
    return;
  }

  const sym = marketData?.symbol || "TOKEN";
  const scoutUrl = tokenPageUrl(tokenAddress);
  const lines = [
    "⚠️ Sentinel: actividad de wallets sospechosa (heurística)",
    `Token: ${sym}`,
    `Mint: ${tokenAddress}`,
    walletIntel.summary || "Patrones de fee / polvo / churn elevados en muestra reciente.",
    "",
    `Scout: ${scoutUrl}`
  ];
  const sigs = (walletIntel.signals || []).slice(0, 4);
  for (const s of sigs) {
    const w = s.wallet ? `${s.wallet.slice(0, 4)}…${s.wallet.slice(-4)}` : "?";
    lines.push(`· [${s.type}] ${w}: ${s.detail}`);
  }

  try {
    await bot.telegram.sendMessage(chatId, lines.join("\n"));
    await redis.set(cooldownKey, "1", { ex: 60 * 60 });
  } catch (e) {
    console.warn("wallet-threat telegram:", e.message);
  }
}

function startTelegramBot() {
  if (bot) return bot;

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn("Telegram bot disabled: TELEGRAM_BOT_TOKEN missing.");
    return null;
  }

  bot = new Telegraf(token);
  // Middleware/runtime errors should never crash the API process.
  bot.catch((err) => {
    console.warn("Telegram bot runtime error:", err?.message || err);
  });

  bot.start(async (ctx) => {
    const supabase = getSupabase();
    const telegramId = String(ctx.from?.id || "");
    const telegramUsername = ctx.from?.username || null;

    try {
      // Best-effort binding by telegram_id only.
      const { error } = await supabase
        .from("users")
        .upsert(
          {
            wallet_address: `tg_${telegramId}`,
            telegram_id: telegramId,
            telegram_username: telegramUsername
          },
          { onConflict: "wallet_address" }
        );
      if (error) {
        // Ignore if user model is managed elsewhere.
      }
    } catch (e) {
      // noop
    }

    return ctx.reply(
      "Welcome to Sentinel Ledger Bot.\nUse /price SOL, /signal WIF, /wallet <address>, /swap 1 SOL USDC, /scan <mint>, or /watchlist."
    );
  });

  bot.command("scan", async (ctx) => {
    const parts = (ctx.message?.text || "").trim().split(/\s+/);
    const address = parts[1];
    if (!address) return ctx.reply("Usage: /scan <token_mint_address>");

    try {
      const marketData = await getMarketData(address);
      if (!marketData) return ctx.reply("Token not found.");
      const analysis = await getAnalysis(address, marketData);
      return ctx.reply(buildScanMessage(address, marketData, analysis));
    } catch (error) {
      return ctx.reply("Scan failed. Try again in a moment.");
    }
  });

  bot.command("watchlist", async (ctx) => {
    try {
      const supabase = getSupabase();
      const telegramId = String(ctx.from?.id || "");
      const { data: user } = await supabase
        .from("users")
        .select("id")
        .eq("telegram_id", telegramId)
        .maybeSingle();
      if (!user) return ctx.reply("No watchlist linked yet.");

      const { data: items } = await supabase
        .from("watchlists")
        .select("token_address,note")
        .eq("user_id", user.id)
        .order("added_at", { ascending: false })
        .limit(10);

      if (!items?.length) return ctx.reply("Your watchlist is empty.");
      const msg = items
        .map((i, idx) => `${idx + 1}. ${i.token_address}${i.note ? ` — ${i.note}` : ""}`)
        .join("\n");
      return ctx.reply(`📌 Your Watchlist\n${msg}`);
    } catch (error) {
      return ctx.reply("Failed to load watchlist.");
    }
  });

  bot.command("support", async (ctx) => {
    return ctx.reply("Describe your issue in one message and we will escalate it to Sentinel support.");
  });

  bot.command("price", async (ctx) => {
    const parts = (ctx.message?.text || "").trim().split(/\s+/);
    const token = parts[1];
    if (!token) return ctx.reply("Usage: /price SOL");
    const result = await executeIntent("GET_PRICE", { token });
    return ctx.reply(formatNluResponse(result));
  });

  bot.command("signal", async (ctx) => {
    const parts = (ctx.message?.text || "").trim().split(/\s+/);
    const token = parts[1];
    if (!token) return ctx.reply("Usage: /signal WIF");
    const result = await executeIntent("GET_SIGNAL", { token });
    return ctx.reply(formatNluResponse(result));
  });

  bot.command("wallet", async (ctx) => {
    const parts = (ctx.message?.text || "").trim().split(/\s+/);
    const wallet = parts[1];
    if (!wallet) return ctx.reply("Usage: /wallet <address>");
    const result = await executeIntent("GET_WALLET", { wallet });
    return ctx.reply(formatNluResponse(result));
  });

  bot.command("swap", async (ctx) => {
    const parts = (ctx.message?.text || "").trim().split(/\s+/);
    const amount = Number(parts[1]);
    const inToken = parts[2];
    const outToken = parts[3] || "USDC";
    if (!amount || !inToken) return ctx.reply("Usage: /swap 1 SOL USDC");
    const result = await executeIntent("GET_SWAP_QUOTE", { amount, inToken, outToken });
    return ctx.reply(formatNluResponse(result));
  });

  bot.on("text", async (ctx) => {
    const message = String(ctx.message?.text || "").trim();
    if (!message || message.startsWith("/")) return;
    const detected = detectIntent(message);
    const routed = await executeIntent(detected.intent, detected.entities);
    return ctx.reply(formatNluResponse(routed));
  });

  // Commands via getUpdates polling are optional in production.
  // Outbound alerts (sendMessage) work without polling.
  const pollingEnabled =
    process.env.NODE_ENV !== "production" || isTruthy(process.env.TELEGRAM_POLLING_ENABLED);
  if (!pollingEnabled) {
    console.log("Telegram polling disabled (set TELEGRAM_POLLING_ENABLED=true to enable commands).");
    return bot;
  }

  bot
    .launch({ dropPendingUpdates: true })
    .then(() => {
      console.log("Telegram bot started.");
    })
    .catch((err) => {
      const message = String(err?.message || "");
      if (err?.response?.error_code === 409 || message.includes("terminated by other getUpdates")) {
        console.warn(
          "Telegram polling conflict (409). Polling disabled for this instance; outbound alerts remain available."
        );
        return;
      }
      console.warn("Telegram launch failed:", message || err);
    });

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));

  return bot;
}

/** Outbound PRO alert to a linked user (private chat id == Telegram user id). */
async function sendProUserAlert(telegramChatId, text) {
  if (!bot || telegramChatId == null || !text) return false;
  try {
    await bot.telegram.sendMessage(String(telegramChatId), String(text).slice(0, 4000));
    return true;
  } catch (e) {
    console.warn("sendProUserAlert:", e.message);
    return false;
  }
}

module.exports = {
  startTelegramBot,
  sendGradeAlert,
  sendTelegramText,
  sendWalletThreatAlert,
  sendProUserAlert
};

