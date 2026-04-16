const redis = require("../lib/cache");
const { getSupabase } = require("../lib/supabase");
const { tierFromScore } = require("../lib/smartMoneyTier");
const { getMarketData } = require("./marketData");
const { buildOnChainSmartMoney } = require("./smartMoneyOnChain");

const MIN_WIN_RATE = 70;
const MAX_RESULTS = 20;
const CACHE_TTL_SECONDS = 600;
const CACHE_PREFIX = "smartmoney:onchain:v2:";

function mapSmartWallet(wallet, signal) {
  const confidence = Number(signal?.confidence || wallet.confidence || wallet.win_rate || 0);
  return {
    wallet: wallet.wallet_address,
    winRate: Number(wallet.win_rate || 0),
    realizedPnl: Number(wallet.pnl_30d || 0),
    avgPositionSize: Number(wallet.avg_position_size || 0),
    recentHits: Number(wallet.recent_hits || 0),
    lastSeen: wallet.last_seen || null,
    lastAction: signal?.last_action || "unknown",
    confidence,
    ...tierFromScore(confidence)
  };
}

async function getLegacySupabaseWallets(tokenAddress) {
  let supabase;
  try {
    supabase = getSupabase();
  } catch (e) {
    console.warn("Supabase unavailable for legacy smart money:", e.message);
    return [];
  }

  try {
    const { data: signals, error: signalsError } = await supabase
      .from("smart_wallet_signals")
      .select("wallet_address,last_action,confidence")
      .eq("token_address", tokenAddress)
      .order("confidence", { ascending: false })
      .limit(MAX_RESULTS);

    if (!signalsError && signals?.length) {
      const wallets = signals.map((s) => s.wallet_address);
      const { data: smartWallets, error: walletsError } = await supabase
        .from("smart_wallets")
        .select(
          "wallet_address,win_rate,pnl_30d,avg_position_size,recent_hits,last_seen,confidence"
        )
        .in("wallet_address", wallets)
        .gte("win_rate", MIN_WIN_RATE)
        .order("win_rate", { ascending: false })
        .limit(MAX_RESULTS);

      if (!walletsError && smartWallets?.length) {
        const byWallet = new Map(signals.map((s) => [s.wallet_address, s]));
        return smartWallets
          .map((wallet) => mapSmartWallet(wallet, byWallet.get(wallet.wallet_address)))
          .slice(0, MAX_RESULTS);
      }
    }
  } catch (error) {
    console.error("Smart wallet token-signal lookup error:", error.message);
  }

  try {
    const { data: smartWallets, error } = await supabase
      .from("smart_wallets")
      .select(
        "wallet_address,win_rate,pnl_30d,avg_position_size,recent_hits,last_seen,confidence"
      )
      .gte("win_rate", MIN_WIN_RATE)
      .order("win_rate", { ascending: false })
      .limit(MAX_RESULTS);

    if (error || !smartWallets?.length) return [];
    return smartWallets.map((wallet) => mapSmartWallet(wallet, null));
  } catch (error) {
    console.error("Smart wallet global lookup error:", error.message);
    return [];
  }
}

/**
 * Returns ranked wallets + meta. Primary source: on-chain (Helius + RPC).
 * Optional DB fallback when SMART_MONEY_DB_FALLBACK=true (demo/curated rows).
 */
async function getSmartWalletsForToken(tokenAddress) {
  const cacheKey = CACHE_PREFIX + tokenAddress;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = typeof cached === "string" ? JSON.parse(cached) : cached;
      if (parsed?.wallets && Array.isArray(parsed.wallets)) {
        return {
          wallets: parsed.wallets,
          meta: parsed.meta || { source: "cache" }
        };
      }
    }
  } catch (e) {
    console.warn("smart money cache read:", e.message);
  }

  let deployerAddress = null;
  try {
    const md = await getMarketData(tokenAddress);
    deployerAddress = md?.deployerAddress || null;
  } catch (_) {
    /* optional */
  }

  const onChain = await buildOnChainSmartMoney(tokenAddress, { deployerAddress });
  if (onChain.wallets.length) {
    const payload = {
      wallets: onChain.wallets,
      meta: {
        ...onChain.meta,
        source: "on_chain",
        count: onChain.wallets.length
      }
    };
    try {
      await redis.set(cacheKey, JSON.stringify(payload), {
        ex: CACHE_TTL_SECONDS
      });
    } catch (e) {
      console.warn("smart money cache write:", e.message);
    }
    return payload;
  }

  if (process.env.SMART_MONEY_DB_FALLBACK === "true") {
    const legacy = await getLegacySupabaseWallets(tokenAddress);
    return {
      wallets: legacy,
      meta: {
        source: "db_seed",
        minWinRate: MIN_WIN_RATE,
        count: legacy.length,
        metricLabel: "Curated demo rows (set SMART_MONEY_DB_FALLBACK=false for on-chain only)"
      }
    };
  }

  return {
    wallets: [],
    meta: {
      ...onChain.meta,
      source: "on_chain_empty",
      count: 0,
      metricLabel:
        "No on-chain activity snapshot yet (or Helius/RPC returned nothing)."
    }
  };
}

module.exports = { getSmartWalletsForToken };
