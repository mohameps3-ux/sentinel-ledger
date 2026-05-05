"use strict";

const { Redis } = require("@upstash/redis");
const {
  heliusRateLimitRps,
  estimateHeliusRpsWindow5s
} = require("../lib/rateLimiter");

let client = null;

function getRedisRaw() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  if (!client) client = new Redis({ url, token });
  return client;
}

function budgetGuardEnabled() {
  return String(process.env.FF_BUDGET_GUARD ?? "true").toLowerCase() !== "false";
}

function dailyBudgetLimit() {
  const n = Number(process.env.DAILY_BUDGET_LIMIT ?? 330_000);
  if (!Number.isFinite(n) || n < 1000) return 330_000;
  return Math.min(50_000_000, Math.floor(n));
}

function utcDateKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function budgetCreditsKey(dateStr) {
  return `budget:credits:${dateStr}`;
}

function alertSentKey(kind, dateStr) {
  return `budget:alert:${kind}:${dateStr}`;
}

async function sendOpsBudgetWebhook(message, title) {
  const url = String(process.env.OPS_ALERT_WEBHOOK_URL || "").trim();
  if (!url) return;
  const payload = {
    content: message,
    text: message,
    username: "Sentinel Budget",
    embeds: [{ title: title || "BUDGET", description: message, color: 16747520 }]
  };
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch {
    /* transport must not break budget path */
  }
}

/**
 * Increment daily Helius credit counter (1 per outbound JSON-RPC). Fail-open if Redis down.
 */
async function recordHeliusCredit(amount = 1) {
  if (!budgetGuardEnabled()) return;

  const redis = getRedisRaw();
  if (!redis) return;

  const dateStr = utcDateKey();
  const key = budgetCreditsKey(dateStr);
  const limit = dailyBudgetLimit();
  const a = Math.max(1, Math.min(1000, Math.floor(Number(amount) || 1)));

  try {
    const n = await redis.incrby(key, a);
    if (n === a) {
      await redis.expire(key, 172800);
    }

    const prev = n - a;
    const alert80 = Math.floor(limit * 0.8);

    if (n >= alert80 && prev < alert80) {
      const sent = await redis.set(alertSentKey("80pct", dateStr), "1", { nx: true, ex: 86400 });
      if (sent) {
        await sendOpsBudgetWebhook(
          `[OPS_ALERT] ⚠️ HELIUS_DAILY_BUDGET 80% | ${n} / ${limit} credits (${dateStr})`,
          "HELIUS_DAILY_BUDGET_80PCT"
        );
      }
    }

    if (n > limit && prev <= limit) {
      console.warn("[budget] ECO_MODE active, limiting non-critical features");
      const sent = await redis.set(alertSentKey("eco", dateStr), "1", { nx: true, ex: 86400 });
      if (sent) {
        await sendOpsBudgetWebhook(
          `[OPS_ALERT] 🔻 ECO_MODE | daily Helius credits ${n} > limit ${limit} (${dateStr})`,
          "ECO_MODE"
        );
      }
    }
  } catch (e) {
    console.warn("[budget] recordHeliusCredit failed (fail-open):", e?.message || e);
  }
}

async function getCreditsSpentToday() {
  const redis = getRedisRaw();
  const dateStr = utcDateKey();
  if (!redis) return 0;
  try {
    const v = await redis.get(budgetCreditsKey(dateStr));
    return Number(v) || 0;
  } catch {
    return 0;
  }
}

async function ecoModeActive() {
  if (!budgetGuardEnabled()) return false;
  const spent = await getCreditsSpentToday();
  return spent > dailyBudgetLimit();
}

async function getBudgetHealthJson() {
  const dateStr = utcDateKey();
  const daily_limit = dailyBudgetLimit();
  const credits_spent = await getCreditsSpentToday();
  const eco = await ecoModeActive();
  const { sum, maxRps } = await estimateHeliusRpsWindow5s();
  const current_rps = Math.round((sum / 5) * 10) / 10;

  return {
    date: dateStr,
    credits_spent,
    daily_limit,
    percentage: daily_limit > 0 ? Math.round((credits_spent / daily_limit) * 1000) / 10 : 0,
    eco_mode: eco,
    rate_limit: {
      current_rps,
      max_rps: maxRps
    },
    flags: {
      FF_RATE_LIMITER: String(process.env.FF_RATE_LIMITER ?? "true").toLowerCase() !== "false",
      FF_BUDGET_GUARD: budgetGuardEnabled()
    }
  };
}

module.exports = {
  budgetGuardEnabled,
  dailyBudgetLimit,
  recordHeliusCredit,
  ecoModeActive,
  getCreditsSpentToday,
  getBudgetHealthJson,
  utcDateKey
};
