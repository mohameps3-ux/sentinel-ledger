"use strict";

/**
 * Per-mint signal emission cooldown (Redis NX + TTL).
 * First emission in the window claims the slot; repeats are blocked until TTL expires.
 */

const cache = require("../lib/cache");

const COOLDOWN_PREFIX = "sentinel:emission:mint:";

const counters = {
  claims: 0,
  blocked: 0,
  errors: 0
};

function cooldownMinutes() {
  const raw = process.env.SIGNAL_EMISSION_MINT_COOLDOWN_MIN;
  if (raw == null || raw === "") return 15;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 15;
  return n;
}

function cooldownTtlSec() {
  const min = cooldownMinutes();
  if (min <= 0) return 0;
  return Math.floor(min * 60);
}

function cooldownKey(mint) {
  return `${COOLDOWN_PREFIX}${mint}`;
}

/**
 * Try to claim an exclusive emission slot for a mint.
 * @param {string} mint
 * @returns {Promise<boolean>} true = allowed (claim won or fail-open); false = in cooldown
 */
async function claimMintEmission(mint) {
  const normalized = String(mint || "").trim();
  if (!normalized) return true;

  const ttl = cooldownTtlSec();
  if (ttl <= 0) return true;

  counters.claims += 1;
  try {
    const result = await cache.set(cooldownKey(normalized), "1", { nx: true, ex: ttl });
    if (result == null) {
      counters.blocked += 1;
      return false;
    }
    return true;
  } catch (error) {
    counters.errors += 1;
    console.warn("[emission-mint-cooldown] Redis error (fail-open):", error?.message || error);
    return true;
  }
}

function getEmissionMintCooldownStats() {
  return {
    claims: counters.claims,
    blocked: counters.blocked,
    errors: counters.errors,
    cooldownMinutes: cooldownMinutes(),
    ttlSec: cooldownTtlSec()
  };
}

module.exports = {
  claimMintEmission,
  cooldownMinutes,
  cooldownTtlSec,
  getEmissionMintCooldownStats,
  COOLDOWN_PREFIX
};
