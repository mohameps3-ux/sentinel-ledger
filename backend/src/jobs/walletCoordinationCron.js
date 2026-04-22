"use strict";

const { rebuildCoordinationPairs } = require("../services/walletCoordinationService");

const TICK_MS_RAW = Number(process.env.WALLET_COORD_CRON_TICK_MS || 6 * 60 * 60 * 1000);
const TICK_MS = Number.isFinite(TICK_MS_RAW) && TICK_MS_RAW >= 60_000 ? TICK_MS_RAW : 6 * 60 * 60 * 1000;
const LOOKBACK_DAYS_RAW = Number(process.env.WALLET_COORD_LOOKBACK_DAYS || 30);
const LOOKBACK_DAYS = Number.isFinite(LOOKBACK_DAYS_RAW)
  ? Math.min(180, Math.max(7, Math.floor(LOOKBACK_DAYS_RAW)))
  : 30;
const MAX_WALLETS_RAW = Number(process.env.WALLET_COORD_MAX_WALLETS || 400);
const MAX_WALLETS = Number.isFinite(MAX_WALLETS_RAW) ? Math.min(1500, Math.max(20, Math.floor(MAX_WALLETS_RAW))) : 400;
const WINDOW_MIN_RAW = Number(process.env.WALLET_COORD_WINDOW_MIN || 10);
const WINDOW_MIN = Number.isFinite(WINDOW_MIN_RAW) ? Math.min(60, Math.max(2, Math.floor(WINDOW_MIN_RAW))) : 10;

let intervalRef = null;
let lastTickStartedAt = null;
let lastTickFinishedAt = null;
let lastStats = {
  wallets: 0,
  tokens: 0,
  updatedPairs: 0,
  error: null
};

function isEnabled() {
  return String(process.env.WALLET_COORD_CRON_ENABLED || "true").toLowerCase() !== "false";
}

async function runWalletCoordinationTick() {
  if (!isEnabled()) return;
  lastTickStartedAt = Date.now();
  try {
    const out = await rebuildCoordinationPairs({
      lookbackDays: LOOKBACK_DAYS,
      maxWallets: MAX_WALLETS,
      windowMin: WINDOW_MIN
    });
    if (!out.ok) {
      lastStats = { wallets: 0, tokens: 0, updatedPairs: 0, error: out.reason || "tick_failed" };
    } else {
      lastStats = {
        wallets: Number(out.wallets || 0),
        tokens: Number(out.tokens || 0),
        updatedPairs: Number(out.updatedPairs || 0),
        error: null
      };
    }
  } catch (e) {
    lastStats = { wallets: 0, tokens: 0, updatedPairs: 0, error: e?.message || "tick_exception" };
    console.warn("[wallet-coordination] tick_exception:", e?.message || e);
  } finally {
    lastTickFinishedAt = Date.now();
  }
}

function getWalletCoordinationCronStatus() {
  return {
    cronEnabled: isEnabled(),
    tickIntervalMs: TICK_MS,
    lookbackDays: LOOKBACK_DAYS,
    maxWallets: MAX_WALLETS,
    windowMin: WINDOW_MIN,
    lastTickStartedAt,
    lastTickFinishedAt,
    lastTickDurationMs:
      lastTickStartedAt && lastTickFinishedAt ? lastTickFinishedAt - lastTickStartedAt : null,
    lastStats
  };
}

function startWalletCoordinationCron() {
  if (intervalRef) return;
  if (!isEnabled()) {
    console.log("Wallet coordination cron disabled via WALLET_COORD_CRON_ENABLED=false");
    return;
  }
  runWalletCoordinationTick().catch((e) =>
    console.warn("[wallet-coordination] bootstrap_failed:", e?.message || e)
  );
  intervalRef = setInterval(() => {
    runWalletCoordinationTick().catch((e) =>
      console.warn("[wallet-coordination] tick_failed:", e?.message || e)
    );
  }, TICK_MS);
  if (intervalRef && typeof intervalRef.unref === "function") intervalRef.unref();
}

module.exports = {
  startWalletCoordinationCron,
  runWalletCoordinationTick,
  getWalletCoordinationCronStatus
};

