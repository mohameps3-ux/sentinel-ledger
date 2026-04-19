const { getSupabase } = require("../lib/supabase");
const { randomUUID } = require("crypto");
const { runSignalPriceEnrichmentOnce } = require("../services/smartWalletSignalPrices");

const TICK_MS_RAW = Number(process.env.SIGNAL_PRICE_TICK_MS || 5 * 60 * 1000);
const TICK_MS =
  Number.isFinite(TICK_MS_RAW) && TICK_MS_RAW >= 60_000 ? TICK_MS_RAW : 5 * 60 * 1000;

let intervalRef = null;
let lastTickStartedAt = null;
let lastTickFinishedAt = null;
let lastStats = { examined: 0, updated: 0, skipped: 0, errors: 0, tokensFetched: 0, error: null };

async function runSignalPriceTick() {
  const requestId = randomUUID();
  lastStats = { ...lastStats, error: null };
  if (String(process.env.SIGNAL_PRICE_CRON_ENABLED || "true").toLowerCase() === "false") return;

  lastTickStartedAt = Date.now();
  try {
    console.log(`[signal-price-cron][${requestId}] tick_start`);
    try {
      getSupabase();
    } catch (e) {
      lastStats = { ...lastStats, error: "supabase_unconfigured" };
      return;
    }
    const stats = await runSignalPriceEnrichmentOnce();
    lastStats = { ...stats, error: null };
  } catch (e) {
    lastStats = {
      ...lastStats,
      error: e.message || String(e)
    };
    console.warn(`[signal-price-cron][${requestId}] tick_exception:`, e.message);
  } finally {
    console.log(`[signal-price-cron][${requestId}] tick_end`, lastStats);
    lastTickFinishedAt = Date.now();
  }
}

function getSignalPriceCronStatus() {
  return {
    tickIntervalMs: TICK_MS,
    cronEnabled: String(process.env.SIGNAL_PRICE_CRON_ENABLED || "true").toLowerCase() !== "false",
    lastTickStartedAt,
    lastTickFinishedAt,
    lastTickDurationMs:
      lastTickStartedAt && lastTickFinishedAt ? lastTickFinishedAt - lastTickStartedAt : null,
    lastStats
  };
}

function startSmartWalletSignalPriceCron() {
  if (intervalRef) return;
  if (String(process.env.SIGNAL_PRICE_CRON_ENABLED || "true").toLowerCase() === "false") {
    console.log("Signal price cron disabled via SIGNAL_PRICE_CRON_ENABLED=false");
    return;
  }
  runSignalPriceTick().catch((e) => console.warn("signal price bootstrap:", e.message));
  intervalRef = setInterval(() => {
    runSignalPriceTick().catch((e) => console.warn("signal price tick:", e.message));
  }, TICK_MS);
}

module.exports = { runSignalPriceTick, startSmartWalletSignalPriceCron, getSignalPriceCronStatus };
