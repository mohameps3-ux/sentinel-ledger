const axios = require("axios");
const redis = require("../lib/cache");

const CACHE_TTL_SECONDS = 20;

async function cacheSetJson(key, ttlSeconds, value) {
  // @upstash/redis uses SET with { ex } instead of SETEX.
  return redis.set(key, JSON.stringify(value), { ex: ttlSeconds });
}

async function getMarketData(address) {
  const cacheKey = `market:${address}`;
  const cached = await redis.get(cacheKey);
  if (cached) return { ...cached, _source: "cache" };

  try {
    const { data } = await axios.get(
      `https://api.dexscreener.com/latest/dex/tokens/${address}`,
      { timeout: 5000 }
    );
    const pairs = data.pairs || [];
    if (!pairs.length) throw new Error("No pair found");

    const bestPair = pairs.sort(
      (a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
    )[0];
    const deployerAddress =
      bestPair.info?.deployerAddress ||
      bestPair.info?.deployer ||
      bestPair.baseToken?.deployerAddress ||
      null;

    const marketData = {
      price: Number(bestPair.priceUsd) || 0,
      priceChange24h: bestPair.priceChange?.h24 || 0,
      volume24h: Number(bestPair.volume?.h24) || 0,
      marketCap: Number(bestPair.fdv) || 0,
      liquidity: Number(bestPair.liquidity?.usd) || 0,
      symbol: bestPair.baseToken?.symbol || "?",
      name: bestPair.baseToken?.name || "",
      deployerAddress,
      lpLocked: false,
      lpLockDuration: 0
    };

    await cacheSetJson(cacheKey, CACHE_TTL_SECONDS, marketData);
    return { ...marketData, _source: "api" };
  } catch (error) {
    console.error("DexScreener error:", error.message);
    return null;
  }
}

module.exports = { getMarketData };

