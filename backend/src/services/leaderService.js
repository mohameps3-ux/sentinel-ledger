"use strict";

const { randomUUID } = require("crypto");
const { Redis } = require("@upstash/redis");

const LOCK_KEY = "sentinel:leader:lock";
const LOCK_TTL_SEC = 30;
const HEARTBEAT_MS = 10_000;

let redisClient = null;
let localToken = null;
let heartbeatTimer = null;
let started = false;

function getLeaderRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  if (!redisClient) redisClient = new Redis({ url, token });
  return redisClient;
}

function leaderFeatureDisabled() {
  return String(process.env.FF_LEADER_ENABLED || "true").trim().toLowerCase() === "false";
}

function isLeader() {
  if (leaderFeatureDisabled()) return true;
  return localToken !== null;
}

/**
 * Confirm lock value still matches our fencing token (async).
 * Use before heavy work; clears local leadership if token was stolen or lock expired.
 */
async function verifyLeadershipFence() {
  if (leaderFeatureDisabled()) return true;
  if (!localToken) return false;
  const r = getLeaderRedis();
  if (!r) return false;
  try {
    const current = await r.get(LOCK_KEY);
    const cur = current == null ? "" : typeof current === "string" ? current : String(current);
    if (cur !== localToken) {
      localToken = null;
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[leader] verifyLeadershipFence error — fail closed:", e?.message || e);
    localToken = null;
    return false;
  }
}

async function heartbeatTick() {
  const r = getLeaderRedis();
  if (!r) {
    localToken = null;
    return;
  }
  try {
    if (localToken) {
      const current = await r.get(LOCK_KEY);
      const cur = current == null ? "" : typeof current === "string" ? current : String(current);
      if (cur !== localToken) {
        console.warn("[leader] lost lock (fencing / TTL); ceasing leader duties");
        localToken = null;
        return;
      }
      await r.set(LOCK_KEY, localToken, { ex: LOCK_TTL_SEC });
    } else {
      const token = `${Date.now()}-${randomUUID()}`;
      const ok = await r.set(LOCK_KEY, token, { nx: true, ex: LOCK_TTL_SEC });
      if (ok) {
        localToken = token;
        console.log("[leader] acquired lock", { fencingToken: token.slice(0, 28) + "…" });
      }
    }
  } catch (e) {
    console.warn("[leader] heartbeat error — fail closed:", e?.message || e);
    localToken = null;
  }
}

/**
 * Start leader election + renewal. Idempotent. Uses dedicated Upstash client (no in-memory cache fallback).
 */
function getLeadershipHealthSnapshot() {
  const redisOk = Boolean(getLeaderRedis());
  return {
    fenceDisabled: leaderFeatureDisabled(),
    redisConfigured: redisOk,
    heartbeatSchedulerStarted: started,
    instanceHoldsLockToken: localToken !== null,
    lockKey: LOCK_KEY,
    lockTtlSec: LOCK_TTL_SEC,
    heartbeatIntervalMs: HEARTBEAT_MS
  };
}

/**
 * One Redis GET to compare remote lock vs this process (for /health deep probe).
 */
async function probeLeadershipLockRemote() {
  if (leaderFeatureDisabled()) {
    return { skipped: true, reason: "fence_disabled" };
  }
  const r = getLeaderRedis();
  if (!r) {
    return { skipped: true, reason: "redis_unconfigured" };
  }
  try {
    const current = await r.get(LOCK_KEY);
    const cur = current == null ? "" : typeof current === "string" ? current : String(current);
    const lockPresent = cur.length > 0;
    const matchesThisInstance = Boolean(localToken && cur === localToken);
    return { lockPresent, matchesThisInstance };
  } catch (e) {
    return { error: e?.message || "redis_probe_failed" };
  }
}

async function acquireLeadership() {
  console.log("[leader] acquireLeadership starting", {
    fenceDisabled: leaderFeatureDisabled(),
    redisConfigured: Boolean(getLeaderRedis())
  });
  if (leaderFeatureDisabled()) {
    console.log("[leader] FF_LEADER_ENABLED=false — all instances run heavy jobs (rollback mode)");
    return;
  }
  if (!getLeaderRedis()) {
    console.warn("[leader] Upstash URL/token missing — isLeader() stays false (heavy jobs skipped)");
    localToken = null;
    return;
  }
  if (started) return;
  started = true;

  await heartbeatTick();
  heartbeatTimer = setInterval(() => {
    heartbeatTick().catch((e) => console.warn("[leader] heartbeatTick:", e?.message || e));
  }, HEARTBEAT_MS);
  if (heartbeatTimer && typeof heartbeatTimer.unref === "function") heartbeatTimer.unref();
}

function stopLeadershipHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  started = false;
  localToken = null;
}

module.exports = {
  acquireLeadership,
  isLeader,
  verifyLeadershipFence,
  stopLeadershipHeartbeat,
  getLeadershipHealthSnapshot,
  probeLeadershipLockRemote,
  LOCK_KEY,
  HEARTBEAT_MS,
  LOCK_TTL_SEC
};
