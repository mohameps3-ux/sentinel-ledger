const redis = require("../lib/cache");
const { getSupabase } = require("../lib/supabase");
const { detectHistoricalCoordinationAlert } = require("./walletCoordinationService");

const WINDOW_SEC = 10 * 60;
const MIN_WALLETS = 3;
const SIGNAL_INSERT_DEDUP_SEC = Math.max(20, Number(process.env.SMART_WALLET_SIGNAL_DEDUP_SEC || 120));

function keyForMint(mint) {
  return `convergence:mint:${mint}`;
}

async function isSmartWallet(walletAddress) {
  if (!walletAddress) return false;
  const cacheKey = `convergence:smartwallet:${walletAddress}`;
  try {
    const hit = await redis.get(cacheKey);
    if (hit != null) return String(hit) === "1";
  } catch (_) {}

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("smart_wallets")
      .select("wallet_address, win_rate")
      .eq("wallet_address", walletAddress)
      .maybeSingle();
    if (error) return false;
    const ok = Number(data?.win_rate || 0) >= 70;
    try {
      await redis.set(cacheKey, ok ? "1" : "0", { ex: 600 });
    } catch (_) {}
    return ok;
  } catch {
    return false;
  }
}

function confidenceFromWalletRow(row) {
  const smartScore = Number(row?.smart_score);
  if (Number.isFinite(smartScore) && smartScore > 0) return Math.max(1, Math.min(100, Math.round(smartScore)));
  const winRate = Number(row?.win_rate);
  if (Number.isFinite(winRate) && winRate > 0) return Math.max(1, Math.min(100, Math.round(winRate)));
  return 70;
}

async function reserveSignalInsert(mint, walletAddress, timestampMs) {
  const atSec = Math.floor((Number(timestampMs) || Date.now()) / 1000);
  const windowBucket = Math.floor(atSec / SIGNAL_INSERT_DEDUP_SEC);
  const dedupeKey = `smart-signal:${mint}:${walletAddress}:${windowBucket}`;
  try {
    const setRes = await redis.set(dedupeKey, "1", { nx: true, ex: SIGNAL_INSERT_DEDUP_SEC + 30 });
    return setRes != null;
  } catch (_) {
    // Fail-open: if cache is down we still try to persist signals.
    return true;
  }
}

async function recordSmartWalletSignal(mint, walletAddress, timestampMs, action = "buy") {
  if (!mint || !walletAddress) return;
  const shouldInsert = await reserveSignalInsert(mint, walletAddress, timestampMs);
  if (!shouldInsert) return;
  try {
    const supabase = getSupabase();
    const { data: walletRow } = await supabase
      .from("smart_wallets")
      .select("wallet_address, win_rate, smart_score")
      .eq("wallet_address", walletAddress)
      .maybeSingle();
    const confidence = confidenceFromWalletRow(walletRow);
    const createdAtIso = new Date(Number(timestampMs) || Date.now()).toISOString();
    const { error } = await supabase.from("smart_wallet_signals").insert({
      token_address: mint,
      wallet_address: walletAddress,
      last_action: action === "sell" ? "sell" : "buy",
      confidence,
      created_minute: new Date(Math.floor(Date.parse(createdAtIso) / 60_000) * 60_000).toISOString(),
      created_at: createdAtIso
    });
    if (error) {
      const msg = String(error.message || "");
      if (msg.toLowerCase().includes("duplicate key")) return;
      console.warn(`[convergence] smart_wallet_signals insert skipped: ${error.message}`);
    }
  } catch (e) {
    console.warn(`[convergence] smart_wallet_signals insert failed: ${e?.message || e}`);
  }
}

async function getConvergenceState(mint) {
  if (!mint) return { detected: false, wallets: [], threshold: MIN_WALLETS, windowMinutes: 10 };
  const key = keyForMint(mint);
  try {
    const raw = await redis.get(key);
    const nowSec = Math.floor(Date.now() / 1000);
    const minSec = nowSec - WINDOW_SEC;
    const parsed = raw && typeof raw === "object" ? raw : {};
    const wallets = Object.entries(parsed || {})
      .filter(([, ts]) => Number(ts) >= minSec)
      .map(([wallet]) => wallet)
      .slice(0, 12);
    return {
      detected: wallets.length >= MIN_WALLETS,
      wallets,
      threshold: MIN_WALLETS,
      windowMinutes: 10
    };
  } catch {
    return { detected: false, wallets: [], threshold: MIN_WALLETS, windowMinutes: 10 };
  }
}

async function trackSmartBuyAndDetect(mint, walletAddress, timestampMs, action = "buy") {
  if (!mint || !walletAddress) return null;
  const smart = await isSmartWallet(walletAddress);
  if (!smart) return null;
  // Never block webhook ingestion on analytics persistence.
  recordSmartWalletSignal(mint, walletAddress, timestampMs, action).catch(() => {});

  const key = keyForMint(mint);
  const score = Math.floor((Number(timestampMs) || Date.now()) / 1000);
  let state = null;
  try {
    const raw = await redis.get(key);
    const parsed = raw && typeof raw === "object" ? raw : {};
    parsed[walletAddress] = score;
    await redis.set(key, parsed, { ex: WINDOW_SEC + 120 });
    state = await getConvergenceState(mint);
  } catch (_) {
    return null;
  }
  if (!state) return null;

  let redAlert = null;
  if (state.detected && Array.isArray(state.wallets) && state.wallets.length >= 3) {
    try {
      redAlert = await detectHistoricalCoordinationAlert({
        mint,
        wallets: state.wallets,
        detectedAtMs: Number(timestampMs) || Date.now()
      });
    } catch (_) {
      redAlert = null;
    }
  }
  return {
    ...state,
    redAlert
  };
}

module.exports = {
  getConvergenceState,
  trackSmartBuyAndDetect
};

