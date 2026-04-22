"use strict";

const {
  getActiveWallets,
  computeWalletBehaviorForWindow,
  upsertWalletBehavior
} = require("../services/walletBehaviorMemory");

const TICK_MS_RAW = Number(process.env.WALLET_BEHAVIOR_TICK_MS || 6 * 60 * 60 * 1000);
const TICK_MS = Number.isFinite(TICK_MS_RAW) && TICK_MS_RAW >= 60_000 ? TICK_MS_RAW : 6 * 60 * 60 * 1000;
const LOOKBACK_DAYS_RAW = Number(process.env.WALLET_BEHAVIOR_LOOKBACK_DAYS || 30);
const LOOKBACK_DAYS = Number.isFinite(LOOKBACK_DAYS_RAW) ? Math.min(180, Math.max(7, Math.floor(LOOKBACK_DAYS_RAW))) : 30;
const MAX_WALLETS_RAW = Number(process.env.WALLET_BEHAVIOR_MAX_WALLETS || 200);
const MAX_WALLETS = Number.isFinite(MAX_WALLETS_RAW) ? Math.min(1000, Math.max(20, Math.floor(MAX_WALLETS_RAW))) : 200;
const MIN_SAMPLE_FOR_STYLE_RAW = Number(process.env.WALLET_BEHAVIOR_MIN_SAMPLE_FOR_STYLE || 5);
const MIN_SAMPLE_FOR_STYLE = Number.isFinite(MIN_SAMPLE_FOR_STYLE_RAW)
  ? Math.min(50, Math.max(3, Math.floor(MIN_SAMPLE_FOR_STYLE_RAW)))
  : 5;

let intervalRef = null;
let lastTickStartedAt = null;
let lastTickFinishedAt = null;
let lastStats = {
  wallets: 0,
  updated: 0,
  failed: 0,
  tokenFeaturesWritten: 0,
  error: null
};

function isEnabled() {
  return String(process.env.WALLET_BEHAVIOR_CRON_ENABLED || "true").toLowerCase() !== "false";
}

async function runWalletBehaviorTick() {
  if (!isEnabled()) return;
  lastTickStartedAt = Date.now();
  const pairCreatedAtCache = new Map();
  try {
    const active = await getActiveWallets(MAX_WALLETS);
    if (!active.ok) {
      lastStats = { wallets: 0, updated: 0, failed: 0, tokenFeaturesWritten: 0, error: active.reason || "wallets_query_failed" };
      return;
    }
    const wallets = active.rows || [];
    let updated = 0;
    let failed = 0;
    let tokenFeaturesWritten = 0;
    for (const wallet of wallets) {
      try {
        const computed = await computeWalletBehaviorForWindow({
          walletAddress: wallet,
          lookbackDays: LOOKBACK_DAYS,
          pairCreatedAtCache,
          minSampleForStyle: MIN_SAMPLE_FOR_STYLE
        });
        if (!computed.ok) {
          failed += 1;
          continue;
        }
        const up = await upsertWalletBehavior(computed);
        if (!up.ok) {
          failed += 1;
          continue;
        }
        updated += 1;
        tokenFeaturesWritten += Number(up.tokenFeatures || 0);
      } catch (_) {
        failed += 1;
      }
    }
    lastStats = {
      wallets: wallets.length,
      updated,
      failed,
      tokenFeaturesWritten,
      error: null
    };
  } catch (e) {
    lastStats = {
      wallets: 0,
      updated: 0,
      failed: 0,
      tokenFeaturesWritten: 0,
      error: e?.message || "tick_failed"
    };
    console.warn("[wallet-behavior] tick_exception:", e?.message || e);
  } finally {
    lastTickFinishedAt = Date.now();
  }
}

function getWalletBehaviorCronStatus() {
  return {
    cronEnabled: isEnabled(),
    tickIntervalMs: TICK_MS,
    lookbackDays: LOOKBACK_DAYS,
    maxWallets: MAX_WALLETS,
    minSampleForStyle: MIN_SAMPLE_FOR_STYLE,
    lastTickStartedAt,
    lastTickFinishedAt,
    lastTickDurationMs:
      lastTickStartedAt && lastTickFinishedAt ? lastTickFinishedAt - lastTickStartedAt : null,
    lastStats
  };
}

function startWalletBehaviorCron() {
  if (intervalRef) return;
  if (!isEnabled()) {
    console.log("Wallet behavior cron disabled via WALLET_BEHAVIOR_CRON_ENABLED=false");
    return;
  }
  runWalletBehaviorTick().catch((e) => console.warn("[wallet-behavior] bootstrap_failed:", e?.message || e));
  intervalRef = setInterval(() => {
    runWalletBehaviorTick().catch((e) => console.warn("[wallet-behavior] tick_failed:", e?.message || e));
  }, TICK_MS);
  if (intervalRef && typeof intervalRef.unref === "function") intervalRef.unref();
}

module.exports = {
  startWalletBehaviorCron,
  runWalletBehaviorTick,
  getWalletBehaviorCronStatus
};

