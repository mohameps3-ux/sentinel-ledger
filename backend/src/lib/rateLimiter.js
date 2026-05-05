"use strict";

const { Redis } = require("@upstash/redis");

let client = null;
let missingRedisWarned = false;
let evalUnavailableWarned = false;

/** Sustained local 429 rejects → ops webhook (in-process window). */
const rejectTimestamps = [];
let lastSustainedRejectAlertAt = 0;

const TOKEN_BUCKET_LUA = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_per_sec = tonumber(ARGV[2])
local now_ms = tonumber(ARGV[3])
local data = redis.call('HMGET', key, 'tokens', 'updated_ms')
local tokens = tonumber(data[1])
local updated_ms = tonumber(data[2])
if not tokens then
  tokens = capacity
  updated_ms = now_ms
end
local elapsed_ms = math.max(0, now_ms - (updated_ms or now_ms))
local elapsed_sec = elapsed_ms / 1000
tokens = math.min(capacity, tokens + elapsed_sec * refill_per_sec)
if tokens < 1 then
  redis.call('HSET', key, 'tokens', string.format('%.6f', tokens), 'updated_ms', tostring(now_ms))
  redis.call('PEXPIRE', key, 180000)
  return 0
end
tokens = tokens - 1
redis.call('HSET', key, 'tokens', string.format('%.6f', tokens), 'updated_ms', tostring(now_ms))
redis.call('PEXPIRE', key, 180000)
return 1
`;

function getRedisRaw() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  if (!client) client = new Redis({ url, token });
  return client;
}

function rateLimiterEnabled() {
  return String(process.env.FF_RATE_LIMITER ?? "true").toLowerCase() !== "false";
}

function heliusRateLimitRps() {
  const n = Number(process.env.HELIUS_RATE_LIMIT_RPS ?? 40);
  if (!Number.isFinite(n) || n < 1) return 40;
  return Math.min(200, Math.floor(n));
}

function heliusRateBurst() {
  const n = Number(process.env.HELIUS_RATE_BURST ?? 50);
  if (!Number.isFinite(n) || n < 1) return 50;
  return Math.min(500, Math.floor(n));
}

function bucketKey() {
  return "rate:helius:token_bucket";
}

function metricSecondKey(unixSec) {
  return `rate:helius:${unixSec}`;
}

/**
 * Try to take one Helius outbound slot (token bucket). Fail-closed only when Redis works and denies.
 * Fail-open if Redis/eval unavailable (with warning).
 */
async function consumeHeliusSlotOrThrow() {
  if (!rateLimiterEnabled()) return;

  const redis = getRedisRaw();
  if (!redis) {
    if (!missingRedisWarned) {
      missingRedisWarned = true;
      console.warn("[rate-limiter] Upstash REST not configured; Helius rate limit disabled (fail-open).");
    }
    return;
  }

  const capacity = Math.max(heliusRateLimitRps(), heliusRateBurst());
  const refill = heliusRateLimitRps();
  const nowMs = Date.now();

  try {
    const allowed = await redis.eval(TOKEN_BUCKET_LUA, [bucketKey()], [
      String(capacity),
      String(refill),
      String(nowMs)
    ]);
    const ok = allowed === 1 || allowed === true || allowed === "1";
    if (!ok) {
      console.warn("[rate-limiter] Helius request rejected");
      noteSustainedRejectsAndMaybeAlert();
      const err = new Error("Helius rate limit (local guard)");
      err.code = "HELIUS_LOCAL_RATE_LIMIT";
      err.statusCode = 429;
      throw err;
    }
  } catch (e) {
    if (e?.code === "HELIUS_LOCAL_RATE_LIMIT" || e?.statusCode === 429) throw e;
    if (!evalUnavailableWarned) {
      evalUnavailableWarned = true;
      console.warn("[rate-limiter] Redis eval failed; allowing Helius calls (fail-open):", e?.message || e);
    }
  }
}

function noteSustainedRejectsAndMaybeAlert() {
  const now = Date.now();
  rejectTimestamps.push(now);
  const cutoff = now - 60_000;
  while (rejectTimestamps.length && rejectTimestamps[0] < cutoff) rejectTimestamps.shift();
  const url = String(process.env.OPS_ALERT_WEBHOOK_URL || "").trim();
  if (!url || rejectTimestamps.length < 15) return;
  if (now - lastSustainedRejectAlertAt < 300_000) return;
  lastSustainedRejectAlertAt = now;
  const msg =
    `[OPS_ALERT] ⚠️ HELIUS_LOCAL_RATE_LIMIT sustained | ~${rejectTimestamps.length} rejects/60s` +
    ` (threshold 15) | max_rps=${heliusRateLimitRps()} burst=${heliusRateBurst()}`;
  const payload = {
    content: msg,
    text: msg,
    username: "Sentinel Budget",
    embeds: [{ title: "HELIUS_LOCAL_RATE_LIMIT", description: msg, color: 15105570 }]
  };
  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  }).catch(() => {});
}

/** Increment per-second counter for /health/budget current_rps (fail-open). */
async function recordHeliusMetricTick() {
  const redis = getRedisRaw();
  if (!redis) return;
  const sec = Math.floor(Date.now() / 1000);
  const k = metricSecondKey(sec);
  try {
    const n = await redis.incr(k);
    if (n === 1) await redis.expire(k, 12);
  } catch (e) {
    console.warn("[rate-limiter] metric incr failed:", e?.message || e);
  }
}

/**
 * Approximate current RPS: sum of counts in the last 5 full seconds / 5.
 */
async function estimateHeliusRpsWindow5s() {
  const redis = getRedisRaw();
  const sec = Math.floor(Date.now() / 1000);
  if (!redis) return { sum: 0, maxRps: heliusRateLimitRps() };

  try {
    const keys = [0, 1, 2, 3, 4].map((i) => metricSecondKey(sec - i));
    const values = await redis.mget(keys);
    let sum = 0;
    for (const v of values || []) {
      const n = Number(v);
      if (Number.isFinite(n)) sum += n;
    }
    return { sum, maxRps: heliusRateLimitRps() };
  } catch {
    return { sum: 0, maxRps: heliusRateLimitRps() };
  }
}

function isHeliusJsonRpcUrl(url) {
  const u = String(url || "").toLowerCase();
  return u.includes("helius-rpc.com") || u.includes("helius.dev");
}

module.exports = {
  rateLimiterEnabled,
  heliusRateLimitRps,
  heliusRateBurst,
  consumeHeliusSlotOrThrow,
  recordHeliusMetricTick,
  estimateHeliusRpsWindow5s,
  isHeliusJsonRpcUrl
};
