"use strict";

const redis = require("./cache");

function txParsedKey(signature) {
  const s = String(signature || "").trim();
  return s ? `tx_parsed:${s}` : "";
}

function txCacheTtlSeconds() {
  const raw = Number(process.env.TX_CACHE_TTL_SECONDS ?? 604800);
  if (!Number.isFinite(raw) || raw < 60) return 604800;
  return Math.min(14 * 24 * 3600, Math.floor(raw));
}

async function getCachedTransaction(signature) {
  const key = txParsedKey(signature);
  if (!key) return null;
  try {
    const v = await redis.get(key);
    if (v == null || v === "") return null;
    if (typeof v === "string") {
      try {
        return JSON.parse(v);
      } catch {
        return null;
      }
    }
    return typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

async function setCachedTransaction(signature, parsedTx) {
  const key = txParsedKey(signature);
  if (!key || !parsedTx || typeof parsedTx !== "object") return;
  try {
    await redis.set(key, JSON.stringify(parsedTx), { ex: txCacheTtlSeconds() });
  } catch (e) {
    console.warn("[tx-cache] set failed:", e?.message || e);
  }
}

module.exports = {
  getCachedTransaction,
  setCachedTransaction,
  txCacheTtlSeconds
};
