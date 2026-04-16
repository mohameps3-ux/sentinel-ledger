const axios = require("axios");
const redis = require("../lib/cache");

const DEFAULT_LIMIT = 100;
const CACHE_TTL_SECONDS = 480;

async function fetchHeliusMintTransactionsRaw(mint, apiKey, limit) {
  const url = `https://api-mainnet.helius-rpc.com/v0/addresses/${encodeURIComponent(
    mint
  )}/transactions?api-key=${encodeURIComponent(apiKey)}&limit=${limit}`;
  const { data, status } = await axios.get(url, {
    timeout: 22000,
    validateStatus: () => true
  });
  if (status !== 200) {
    console.warn(
      "Helius mint transactions:",
      status,
      typeof data === "string" ? data.slice(0, 120) : ""
    );
    return [];
  }
  return Array.isArray(data) ? data : [];
}

/**
 * Cached Helius enhanced history for a mint (shared by smart money + wallet intel).
 * $0: uses existing HELIUS_KEY only.
 */
async function getHeliusMintTransactionsCached(mint, options = {}) {
  const limit = options.limit || DEFAULT_LIMIT;
  const apiKey = process.env.HELIUS_KEY;
  if (!apiKey || !mint) return [];

  const cacheKey = `helius:mint_txs:v1:${mint}:${limit}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = typeof cached === "string" ? JSON.parse(cached) : cached;
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn("helius mint tx cache read:", e.message);
  }

  const txs = await fetchHeliusMintTransactionsRaw(mint, apiKey, limit);
  try {
    await redis.set(cacheKey, JSON.stringify(txs), { ex: CACHE_TTL_SECONDS });
  } catch (e) {
    console.warn("helius mint tx cache write:", e.message);
  }
  return txs;
}

module.exports = { getHeliusMintTransactionsCached, fetchHeliusMintTransactionsRaw };
