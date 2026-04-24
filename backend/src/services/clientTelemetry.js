"use strict";

const redis = require("../lib/cache");

const SUMMARY_KEY = "sentinel:client_telemetry:v1:summary";
/** Server-side: wallet-behavior → smart_wallets(early/cluster/consistency) sync counts (not client POST). */
const SW_PROFILE_TELEM_KEY = "sentinel:server:sw_profile_telemetry:v1";
const TTL_SECONDS = 7 * 24 * 60 * 60;
const VALID_TYPES = new Set(["tta_first_action", "freshness_state"]);

function cleanPath(raw) {
  const path = typeof raw === "string" ? raw.trim() : "";
  if (!path || !path.startsWith("/")) return "/";
  return path.split("?")[0].slice(0, 80) || "/";
}

function cleanState(raw) {
  const state = typeof raw === "string" ? raw.toUpperCase() : "";
  return ["LIVE", "STALE", "DEGRADED"].includes(state) ? state : null;
}

function stripSwProfileFromStoredBase(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (!("swProfile" in obj)) return obj;
  const { swProfile: _ignore, ...rest } = obj;
  return rest;
}

async function getClientTelemetrySummary() {
  const value = await redis.get(SUMMARY_KEY);
  const rawBase =
    value && typeof value === "object"
      ? stripSwProfileFromStoredBase(value)
      : { tta: { count: 0, avgMs: null, byPath: {} }, freshness: { LIVE: 0, STALE: 0, DEGRADED: 0 } };
  const base = rawBase;
  let swProfile = { totalRowUpdates: 0, lastAt: null };
  try {
    const x = await redis.get(SW_PROFILE_TELEM_KEY);
    if (x && typeof x === "object") {
      swProfile = {
        totalRowUpdates: Number(x.totalRowUpdates || 0),
        lastAt: x.lastAt || null
      };
    }
  } catch {
    // ignore
  }
  return { ...base, swProfile };
}

async function recordClientTelemetryEvent(event = {}) {
  const type = typeof event.type === "string" ? event.type.trim() : "";
  if (!VALID_TYPES.has(type)) return { ok: false, reason: "invalid_type" };

  const full = await getClientTelemetrySummary();
  const { swProfile: _sw, ...summary } = full;
  const data = event.data && typeof event.data === "object" ? event.data : {};
  const path = cleanPath(data.path || event.path);

  if (type === "tta_first_action") {
    const ttaMs = Number(data.ttaMs);
    if (!Number.isFinite(ttaMs) || ttaMs < 0 || ttaMs > 10 * 60 * 1000) {
      return { ok: false, reason: "invalid_tta" };
    }
    const count = Number(summary.tta?.count || 0) + 1;
    const prevAvg = Number(summary.tta?.avgMs || 0);
    const avgMs = Math.round((prevAvg * (count - 1) + ttaMs) / count);
    const byPath = summary.tta?.byPath && typeof summary.tta.byPath === "object" ? summary.tta.byPath : {};
    const current = byPath[path] || { count: 0, avgMs: null };
    const pathCount = Number(current.count || 0) + 1;
    const pathAvgPrev = Number(current.avgMs || 0);
    byPath[path] = { count: pathCount, avgMs: Math.round((pathAvgPrev * (pathCount - 1) + ttaMs) / pathCount) };
    summary.tta = { count, avgMs, byPath };
  }

  if (type === "freshness_state") {
    const state = cleanState(data.state);
    if (!state) return { ok: false, reason: "invalid_state" };
    const freshness = summary.freshness && typeof summary.freshness === "object" ? summary.freshness : {};
    freshness[state] = Number(freshness[state] || 0) + 1;
    summary.freshness = {
      LIVE: Number(freshness.LIVE || 0),
      STALE: Number(freshness.STALE || 0),
      DEGRADED: Number(freshness.DEGRADED || 0)
    };
  }

  summary.updatedAt = new Date().toISOString();
  await redis.set(SUMMARY_KEY, summary, { ex: TTL_SECONDS });
  return { ok: true };
}

/**
 * Incremented when `walletBehaviorMemory.upsertWalletBehavior` updates `smart_wallets` profile columns.
 * Surfaced in GET /api/v1/telemetry/client/summary (Ops dashboard).
 */
async function recordSwProfileRowSync(count = 1) {
  const n = Math.max(1, Math.floor(Number(count) || 1));
  let cur = { totalRowUpdates: 0, lastAt: null };
  try {
    const raw = await redis.get(SW_PROFILE_TELEM_KEY);
    if (raw && typeof raw === "object") cur = { ...cur, ...raw };
  } catch {
    // ignore
  }
  const next = {
    totalRowUpdates: Number(cur.totalRowUpdates || 0) + n,
    lastAt: new Date().toISOString()
  };
  try {
    await redis.set(SW_PROFILE_TELEM_KEY, next, { ex: TTL_SECONDS });
  } catch {
    // ignore
  }
  return { ok: true, ...next };
}

module.exports = {
  getClientTelemetrySummary,
  recordClientTelemetryEvent,
  recordSwProfileRowSync
};
