const redis = require("../lib/cache");
const { randomUUID } = require("crypto");
const { getSupabase } = require("../lib/supabase");
const { getMarketData } = require("../services/marketData");
const { tokenPageUrl } = require("../services/marketingLinks");
const { sendProUserAlert } = require("../bots/telegramBot");
const { resolveProAlertPrefs, shouldFireForDirection } = require("../services/proAlertRules");
const { getSmartMoneyHintForMint } = require("../services/proAlertSmartHint");
const { recordProAlertFeedItem, tierForWatchlistMove } = require("../services/proAlertFeed");

const SMART_HINT_MIN_CONF = Number(process.env.PRO_ALERT_SMART_HINT_MIN_CONF || 38);
const SMART_HINT_MIN_COUNT_WEAK = 4;

const TICK_MS_RAW = Number(process.env.PRO_ALERTS_TICK_MS || 10 * 60 * 1000);
const TICK_MS = Number.isFinite(TICK_MS_RAW) && TICK_MS_RAW >= 60_000 ? TICK_MS_RAW : 10 * 60 * 1000;

let intervalRef = null;
let lastTickStartedAt = null;
let lastTickFinishedAt = null;
let lastTickStats = {
  usersConsidered: 0,
  watchlistChecks: 0,
  messagesSent: 0,
  skippedBelowThreshold: 0,
  skippedDirection: 0,
  skippedDedup: 0,
  error: null
};

function baselineKey(userId, mint) {
  return `proalert:baseline:${userId}:${mint}`;
}

function dedupKey(userId, mint, bucket) {
  return `proalert:dedup:${userId}:${mint}:${bucket}`;
}

async function getBaseline(userId, mint) {
  try {
    const raw = await redis.get(baselineKey(userId, mint));
    if (!raw) return null;
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    return obj && typeof obj.price === "number" ? obj : null;
  } catch (_) {
    return null;
  }
}

async function setBaseline(userId, mint, price) {
  try {
    await redis.set(
      baselineKey(userId, mint),
      JSON.stringify({ price, t: Date.now() }),
      { ex: 7 * 24 * 60 * 60 }
    );
  } catch (_) {}
}

/** Bucket id changes every `dedupHours` wall-clock window. */
function dedupBucket(dedupHours) {
  const ms = dedupHours * 60 * 60 * 1000;
  return Math.floor(Date.now() / ms);
}

async function shouldNotify(userId, mint, dedupHours) {
  const bucket = dedupBucket(dedupHours);
  const key = dedupKey(userId, mint, bucket);
  try {
    const hit = await redis.get(key);
    if (hit != null) return { ok: false, reason: "dedup" };
    await redis.set(key, "1", { ex: Math.ceil(dedupHours * 60 * 60) });
    return { ok: true };
  } catch (_) {
    return { ok: true };
  }
}

async function runProAlertTick() {
  const requestId = randomUUID();
  lastTickStats = { ...lastTickStats, error: null };
  if (String(process.env.PRO_ALERTS_CRON_ENABLED || "true").toLowerCase() === "false") return;

  lastTickStartedAt = Date.now();
  let usersConsidered = 0;
  let watchlistChecks = 0;
  let messagesSent = 0;
  let skippedBelowThreshold = 0;
  let skippedDirection = 0;
  let skippedDedup = 0;

  try {
    console.log(`[pro-alert-cron][${requestId}] tick_start`);
    const supabase = getSupabase();
    const { data: users, error } = await supabase
      .from("users")
      .select("id, telegram_chat_id, pro_alerts_enabled, pro_alert_prefs")
      .eq("pro_alerts_enabled", true)
      .not("telegram_chat_id", "is", null);

    if (error) {
      console.warn(`[pro-alert-cron][${requestId}] users query:`, error.message);
      lastTickStats = { ...lastTickStats, error: error.message };
      lastTickFinishedAt = Date.now();
      return;
    }

    if (!users?.length) {
      lastTickFinishedAt = Date.now();
      lastTickStats = {
        usersConsidered: 0,
        watchlistChecks: 0,
        messagesSent: 0,
        skippedBelowThreshold: 0,
        skippedDirection: 0,
        skippedDedup: 0,
        error: null
      };
      return;
    }

    for (const user of users) {
      usersConsidered += 1;
      const chatId = user.telegram_chat_id;
      const userId = user.id;
      if (!chatId) continue;

      const prefs = resolveProAlertPrefs(user.pro_alert_prefs);
      const { minMovePct, direction, dedupHours } = prefs;

      const { data: rows } = await supabase
        .from("watchlists")
        .select("token_address")
        .eq("user_id", userId)
        .limit(25);

      if (!rows?.length) continue;

      for (const row of rows) {
        watchlistChecks += 1;
        const mint = row.token_address;
        if (!mint) continue;

        const md = await getMarketData(mint).catch(() => null);
        if (!md || !Number.isFinite(Number(md.price))) continue;

        const price = Number(md.price);
        const prev = await getBaseline(userId, mint);

        if (!prev) {
          await setBaseline(userId, mint, price);
          continue;
        }

        const signedMovePct =
          prev.price > 0 ? ((price - prev.price) / prev.price) * 100 : 0;
        const absMove = Math.abs(signedMovePct);

        if (absMove < minMovePct) {
          skippedBelowThreshold += 1;
          continue;
        }

        if (!shouldFireForDirection(direction, signedMovePct)) {
          skippedDirection += 1;
          continue;
        }

        const allow = await shouldNotify(userId, mint, dedupHours);
        if (!allow.ok) {
          skippedDedup += 1;
          await setBaseline(userId, mint, price);
          continue;
        }

        const sym = md.symbol || "?";
        const dirLabel = signedMovePct >= 0 ? "up" : "down";
        const url = tokenPageUrl(mint);

        let smartLine = "";
        try {
          const hint = await getSmartMoneyHintForMint(mint);
          const n = Number(hint?.count || 0);
          const tc = Number(hint?.topConfidence || 0);
          const src = hint?.source || "intel";
          if (n >= 1 && tc >= SMART_HINT_MIN_CONF) {
            smartLine = `🧠 Smart money: ${n} wallet(s) on radar · top ~${tc}% conf (${src}).`;
          } else if (n >= SMART_HINT_MIN_COUNT_WEAK) {
            smartLine = `🧠 Smart money: ${n} wallet(s) recently active (${src}).`;
          }
        } catch (_) {}

        const msg = [
          `🔔 PRO · Watchlist move`,
          `${sym} · ${absMove.toFixed(1)}% ${dirLabel} (threshold ${minMovePct}%)`,
          `Strategy: ${prefs.strategy} · Dir: ${direction}`,
          `Price: $${price.toFixed(price < 1 ? 6 : 4)}`,
          smartLine.trimEnd(),
          ``,
          `Not financial advice. Scout: ${url}`
        ]
          .filter((line) => line !== "")
          .join("\n");

        const sent = await sendProUserAlert(chatId, msg);
        if (sent) {
          messagesSent += 1;
          await setBaseline(userId, mint, price);
          const feedTier = tierForWatchlistMove(absMove, minMovePct);
          await recordProAlertFeedItem({
            userId,
            tier: feedTier,
            source: "watchlist_move",
            headline: `${sym} ${signedMovePct >= 0 ? "+" : ""}${signedMovePct.toFixed(1)}% (${dirLabel})`,
            detail: `Δ vs prior mark · threshold ${minMovePct}% · ${prefs.strategy} · ${direction}`,
            tokenAddress: mint,
            meta: {
              absMovePct: Math.round(absMove * 100) / 100,
              minMovePct,
              strategy: prefs.strategy,
              direction,
              priceUsd: price
            }
          });
        }
      }
    }

    lastTickStats = {
      usersConsidered,
      watchlistChecks,
      messagesSent,
      skippedBelowThreshold,
      skippedDirection,
      skippedDedup,
      error: null
    };
  } catch (e) {
    lastTickStats = {
      ...lastTickStats,
      error: e.message || String(e)
    };
    console.warn(`[pro-alert-cron][${requestId}] tick_exception:`, e.message);
  } finally {
    console.log(`[pro-alert-cron][${requestId}] tick_end`, {
      usersConsidered,
      watchlistChecks,
      messagesSent
    });
    lastTickFinishedAt = Date.now();
  }
}

function getProAlertCronStatus() {
  return {
    tickIntervalMs: TICK_MS,
    cronEnabled: String(process.env.PRO_ALERTS_CRON_ENABLED || "true").toLowerCase() !== "false",
    lastTickStartedAt,
    lastTickFinishedAt,
    lastTickDurationMs:
      lastTickStartedAt && lastTickFinishedAt ? lastTickFinishedAt - lastTickStartedAt : null,
    lastTickStats
  };
}

function startProAlertCron() {
  if (intervalRef) return;
  if (String(process.env.PRO_ALERTS_CRON_ENABLED || "true").toLowerCase() === "false") {
    console.log("PRO alert cron disabled via PRO_ALERTS_CRON_ENABLED=false");
    return;
  }
  runProAlertTick().catch((e) => console.warn("pro alert bootstrap:", e.message));
  intervalRef = setInterval(() => {
    runProAlertTick().catch((e) => console.warn("pro alert tick:", e.message));
  }, TICK_MS);
}

module.exports = { runProAlertTick, startProAlertCron, getProAlertCronStatus };
