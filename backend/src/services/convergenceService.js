const redis = require("../lib/cache");
const { getSupabase } = require("../lib/supabase");

const WINDOW_SEC = 10 * 60;
const MIN_WALLETS = 3;

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

async function trackSmartBuyAndDetect(mint, walletAddress, timestampMs) {
  if (!mint || !walletAddress) return null;
  const smart = await isSmartWallet(walletAddress);
  if (!smart) return null;

  const key = keyForMint(mint);
  const score = Math.floor((Number(timestampMs) || Date.now()) / 1000);
  try {
    const raw = await redis.get(key);
    const parsed = raw && typeof raw === "object" ? raw : {};
    parsed[walletAddress] = score;
    await redis.set(key, parsed, { ex: WINDOW_SEC + 120 });
  } catch (_) {
    return null;
  }
  return getConvergenceState(mint);
}

module.exports = {
  getConvergenceState,
  trackSmartBuyAndDetect
};

