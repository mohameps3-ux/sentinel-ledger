"use strict";

const { getSupabase } = require("../lib/supabase");

const TICK_MS_RAW = Number(process.env.SMART_SIGNAL_BACKFILL_TICK_MS || 180_000);
const TICK_MS = Number.isFinite(TICK_MS_RAW) && TICK_MS_RAW >= 60_000 ? TICK_MS_RAW : 180_000;
const BATCH_RAW = Number(process.env.SMART_SIGNAL_BACKFILL_BATCH || 40);
const BATCH = Number.isFinite(BATCH_RAW) ? Math.min(200, Math.max(10, Math.floor(BATCH_RAW))) : 40;
const LOOKBACK_HOURS_RAW = Number(process.env.SMART_SIGNAL_BACKFILL_LOOKBACK_HOURS || 24);
const LOOKBACK_HOURS = Number.isFinite(LOOKBACK_HOURS_RAW)
  ? Math.min(168, Math.max(6, Math.floor(LOOKBACK_HOURS_RAW)))
  : 24;
const DEDUPE_MIN_RAW = Number(process.env.SMART_SIGNAL_BACKFILL_DEDUPE_MINUTES || 120);
const DEDUPE_MINUTES = Number.isFinite(DEDUPE_MIN_RAW)
  ? Math.min(24 * 60, Math.max(15, Math.floor(DEDUPE_MIN_RAW)))
  : 120;
const MIN_WIN_RATE = Number(process.env.SMART_SIGNAL_BACKFILL_MIN_WIN_RATE || 70);

let intervalRef = null;
let lastTickStartedAt = null;
let lastTickFinishedAt = null;
let lastStats = {
  candidates: 0,
  smartCandidates: 0,
  deduped: 0,
  inserted: 0,
  skipped: 0,
  error: null
};

function isEnabled() {
  return String(process.env.SMART_SIGNAL_BACKFILL_ENABLED || "true").toLowerCase() !== "false";
}

function confidenceFromWallet(wallet) {
  const smart = Number(wallet?.smart_score);
  if (Number.isFinite(smart) && smart > 0) return Math.max(1, Math.min(100, Math.round(smart)));
  const win = Number(wallet?.win_rate);
  if (Number.isFinite(win) && win > 0) return Math.max(1, Math.min(100, Math.round(win)));
  return 70;
}

async function runSmartWalletSignalBackfillTick() {
  if (!isEnabled()) return;
  lastTickStartedAt = Date.now();
  try {
    const supabase = getSupabase();
    const sinceIso = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
    const dedupeSinceIso = new Date(Date.now() - DEDUPE_MINUTES * 60 * 1000).toISOString();

    const { data: rows, error: rowsError } = await supabase
      .from("wallet_tokens")
      .select("wallet_address, token_address, bought_at")
      .gte("bought_at", sinceIso)
      .order("bought_at", { ascending: false })
      .limit(BATCH * 8);
    if (rowsError) throw rowsError;

    const walletSet = new Set();
    const tokenSet = new Set();
    const byPair = new Map();
    for (const row of rows || []) {
      const wallet = String(row?.wallet_address || "");
      const token = String(row?.token_address || "");
      if (!wallet || !token) continue;
      walletSet.add(wallet);
      tokenSet.add(token);
      const key = `${wallet}:${token}`;
      if (!byPair.has(key)) byPair.set(key, row);
    }
    const walletAddresses = [...walletSet];
    const tokenAddresses = [...tokenSet];

    if (!walletAddresses.length || !tokenAddresses.length) {
      lastStats = {
        candidates: byPair.size,
        smartCandidates: 0,
        deduped: 0,
        inserted: 0,
        skipped: byPair.size,
        error: null
      };
      return;
    }

    const { data: smartWalletRows, error: walletError } = await supabase
      .from("smart_wallets")
      .select("wallet_address, win_rate, smart_score")
      .in("wallet_address", walletAddresses)
      .gte("win_rate", MIN_WIN_RATE);
    if (walletError) throw walletError;
    const smartByWallet = new Map((smartWalletRows || []).map((w) => [String(w.wallet_address), w]));

    const { data: recentSignals, error: signalError } = await supabase
      .from("smart_wallet_signals")
      .select("wallet_address, token_address")
      .in("wallet_address", walletAddresses)
      .in("token_address", tokenAddresses)
      .gte("created_at", dedupeSinceIso)
      .limit(BATCH * 20);
    if (signalError) throw signalError;
    const existing = new Set(
      (recentSignals || []).map((r) => `${String(r.wallet_address || "")}:${String(r.token_address || "")}`)
    );

    const insertRows = [];
    let smartCandidates = 0;
    let deduped = 0;
    for (const [pairKey, row] of byPair.entries()) {
      const wallet = String(row.wallet_address || "");
      const token = String(row.token_address || "");
      const smart = smartByWallet.get(wallet);
      if (!smart) continue;
      smartCandidates += 1;
      if (existing.has(pairKey)) {
        deduped += 1;
        continue;
      }
      const createdAtIso = row?.bought_at ? new Date(row.bought_at).toISOString() : new Date().toISOString();
      const createdMinuteIso = new Date(Math.floor(Date.parse(createdAtIso) / 60_000) * 60_000).toISOString();
      insertRows.push({
        token_address: token,
        wallet_address: wallet,
        last_action: "buy",
        confidence: confidenceFromWallet(smart),
        created_minute: createdMinuteIso,
        created_at: createdAtIso
      });
      if (insertRows.length >= BATCH) break;
    }

    let inserted = 0;
    for (const row of insertRows) {
      const { error: insertError } = await supabase.from("smart_wallet_signals").insert(row);
      if (!insertError) {
        inserted += 1;
        continue;
      }
      const msg = String(insertError?.message || "").toLowerCase();
      if (msg.includes("duplicate key")) {
        deduped += 1;
        continue;
      }
      throw insertError;
    }

    lastStats = {
      candidates: byPair.size,
      smartCandidates,
      deduped,
      inserted,
      skipped: Math.max(0, byPair.size - inserted),
      error: null
    };
  } catch (e) {
    lastStats = {
      ...lastStats,
      error: e?.message || "tick_failed"
    };
    console.warn("[smart-signal-backfill] tick_exception:", e?.message || e);
  } finally {
    lastTickFinishedAt = Date.now();
  }
}

function getSmartWalletSignalBackfillStatus() {
  return {
    cronEnabled: isEnabled(),
    tickIntervalMs: TICK_MS,
    batch: BATCH,
    lookbackHours: LOOKBACK_HOURS,
    dedupeMinutes: DEDUPE_MINUTES,
    minWinRate: MIN_WIN_RATE,
    lastTickStartedAt,
    lastTickFinishedAt,
    lastTickDurationMs:
      lastTickStartedAt && lastTickFinishedAt ? lastTickFinishedAt - lastTickStartedAt : null,
    lastStats
  };
}

function startSmartWalletSignalBackfillCron() {
  if (intervalRef) return;
  if (!isEnabled()) {
    console.log("Smart signal backfill cron disabled via SMART_SIGNAL_BACKFILL_ENABLED=false");
    return;
  }
  runSmartWalletSignalBackfillTick().catch((e) =>
    console.warn("[smart-signal-backfill] bootstrap_failed:", e?.message || e)
  );
  intervalRef = setInterval(() => {
    runSmartWalletSignalBackfillTick().catch((e) =>
      console.warn("[smart-signal-backfill] tick_failed:", e?.message || e)
    );
  }, TICK_MS);
  if (intervalRef && typeof intervalRef.unref === "function") intervalRef.unref();
}

module.exports = {
  startSmartWalletSignalBackfillCron,
  runSmartWalletSignalBackfillTick,
  getSmartWalletSignalBackfillStatus
};
