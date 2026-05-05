"use strict";

const redis = require("./cache");

const TX_PREFIX = "tx:";

function txKey(signature) {
  const s = String(signature || "").trim();
  if (!s) return "";
  return `${TX_PREFIX}${s}`;
}

async function isTransactionProcessed(signature) {
  const key = txKey(signature);
  if (!key) return false;
  try {
    const v = await redis.get(key);
    return v != null && v !== "";
  } catch {
    return false;
  }
}

/**
 * Atomically marks a transaction as seen (SET NX + EX). Returns true if this call won the race (first processor).
 */
async function markTransactionProcessed(signature, ttlSeconds = 604800) {
  const key = txKey(signature);
  if (!key) return false;
  const ttl = Number(ttlSeconds);
  const ex = Number.isFinite(ttl) && ttl > 0 ? Math.floor(ttl) : 604800;
  try {
    const r = await redis.set(key, "1", { nx: true, ex });
    return r != null && r !== "";
  } catch {
    return false;
  }
}

/** Remove claim so a failed RPC path can retry (use sparingly). */
async function releaseTransactionClaim(signature) {
  const key = txKey(signature);
  if (!key) return;
  try {
    await redis.del(key);
  } catch (_) {}
}

module.exports = {
  isTransactionProcessed,
  markTransactionProcessed,
  releaseTransactionClaim
};
