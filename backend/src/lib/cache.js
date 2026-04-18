const { Redis } = require("@upstash/redis");

const inMemory = new Map();
let disabledUntil = 0;

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

function nowMs() {
  return Date.now();
}

function readMemory(key) {
  const entry = inMemory.get(key);
  if (!entry) return null;
  if (entry.expiresAt && entry.expiresAt <= nowMs()) {
    inMemory.delete(key);
    return null;
  }
  return normalizeValue(entry.value);
}

function writeMemory(key, value, options = {}) {
  if (options?.nx) {
    const existing = readMemory(key);
    if (existing !== null) return null;
  }
  const ex = Number(options?.ex || 0);
  const expiresAt = ex > 0 ? nowMs() + ex * 1000 : null;
  inMemory.set(key, { value, expiresAt });
  return "OK";
}

function normalizeValue(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (!(trimmed.startsWith("{") || trimmed.startsWith("[") || trimmed === "null")) return value;
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    return value;
  }
}

function shouldUseMemoryFallback(error) {
  const msg = String(error?.message || "");
  const lc = msg.toLowerCase();
  return (
    lc.includes("max requests limit exceeded") ||
    lc.includes("without url or token") ||
    lc.includes("failed to parse url")
  );
}

async function safeGet(key) {
  if (disabledUntil > nowMs()) return readMemory(key);
  try {
    const value = await redis.get(key);
    return normalizeValue(value);
  } catch (error) {
    if (shouldUseMemoryFallback(error)) {
      disabledUntil = nowMs() + 15 * 60 * 1000;
      console.warn("Redis REST unavailable; using in-memory cache fallback for 15m.");
      return readMemory(key);
    }
    throw error;
  }
}

async function safeSet(key, value, options = {}) {
  if (disabledUntil > nowMs()) return writeMemory(key, value, options);
  try {
    return await redis.set(key, value, options);
  } catch (error) {
    if (shouldUseMemoryFallback(error)) {
      disabledUntil = nowMs() + 15 * 60 * 1000;
      console.warn("Redis REST unavailable; writing cache to in-memory fallback for 15m.");
      return writeMemory(key, value, options);
    }
    throw error;
  }
}

async function safeDel(key) {
  inMemory.delete(key);
  if (disabledUntil > nowMs()) return 1;
  try {
    return await redis.del(key);
  } catch (error) {
    if (shouldUseMemoryFallback(error)) {
      disabledUntil = nowMs() + 15 * 60 * 1000;
      console.warn("Redis REST unavailable; delete handled by in-memory fallback.");
      return 1;
    }
    throw error;
  }
}

module.exports = {
  get: safeGet,
  set: safeSet,
  del: safeDel
};

