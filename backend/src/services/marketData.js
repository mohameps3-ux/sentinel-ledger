const axios = require("axios");
const redis = require("../lib/cache");
const { detectNarrativeTags } = require("./narrativeTags");
const { createCircuitBreaker } = require("../lib/circuitBreaker");

const CACHE_TTL_SECONDS = 20;
const COINGECKO_SIMPLE_PRICE = "https://api.coingecko.com/api/v3/simple/price";
const WELL_KNOWN_MINT_TO_CG = {
  So11111111111111111111111111111111111111112: "solana"
};

const DEX_BREAKER = createCircuitBreaker({
  name: "dexscreener",
  failureThreshold: Number(process.env.MARKETDATA_DEX_CB_FAILURES || 4),
  openMs: Number(process.env.MARKETDATA_DEX_CB_OPEN_MS || 45_000),
  halfOpenMaxCalls: Number(process.env.MARKETDATA_DEX_CB_HALF_OPEN_CALLS || 2),
  halfOpenSuccessThreshold: Number(process.env.MARKETDATA_DEX_CB_HALF_OPEN_SUCCESS || 2)
});
const CG_BREAKER = createCircuitBreaker({
  name: "coingecko",
  failureThreshold: Number(process.env.MARKETDATA_CG_CB_FAILURES || 4),
  openMs: Number(process.env.MARKETDATA_CG_CB_OPEN_MS || 45_000),
  halfOpenMaxCalls: Number(process.env.MARKETDATA_CG_CB_HALF_OPEN_CALLS || 2),
  halfOpenSuccessThreshold: Number(process.env.MARKETDATA_CG_CB_HALF_OPEN_SUCCESS || 2)
});

async function cacheSetJson(key, ttlSeconds, value) {
  // @upstash/redis uses SET with { ex } instead of SETEX.
  return redis.set(key, JSON.stringify(value), { ex: ttlSeconds });
}

function pairLabels(pair) {
  const raw = pair?.labels;
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x));
}

function inferLpLockFromPair(pair) {
  const locks = pair?.locks;
  if (Array.isArray(locks) && locks.length) {
    const names = locks
      .map((l) => l?.name || l?.locker || l?.provider)
      .filter(Boolean)
      .map(String);
    return {
      lpLocked: true,
      lpLockDuration: 0,
      lpLockDetail: names.length ? names.join(" · ") : "Lock metadata present"
    };
  }
  const labs = pairLabels(pair).map((l) => l.toLowerCase());
  if (labs.some((l) => l.includes("lp") && (l.includes("lock") || l.includes("burn")))) {
    return { lpLocked: true, lpLockDuration: 0, lpLockDetail: "DEX label suggests LP lock/burn" };
  }
  return { lpLocked: null, lpLockDuration: 0, lpLockDetail: null };
}

function inferHoneypotFromLabels(allLabelsLower) {
  if (allLabelsLower.some((l) => l.includes("honeypot"))) return "flagged";
  return "unknown";
}

function extractSocials(info) {
  const websites = [];
  const out = { websites, twitter: null, telegram: null, discord: null };
  if (!info || typeof info !== "object") return out;
  for (const w of info.websites || []) {
    if (typeof w === "string") websites.push(w);
    else if (w?.url) websites.push(String(w.url));
  }
  for (const s of info.socials || []) {
    const url = String(s?.url || "");
    if (!url) continue;
    const type = String(s?.type || "").toLowerCase();
    if (type === "twitter" || url.includes("twitter.com") || url.includes("x.com")) out.twitter = url;
    else if (type === "telegram" || url.includes("t.me")) out.telegram = url;
    else if (type === "discord" || url.includes("discord.gg") || url.includes("discord.com")) out.discord = url;
  }
  return out;
}

function buildDexPairs(pairs, mintAddress) {
  const sorted = [...pairs].sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
  return sorted.slice(0, 20).map((p) => ({
    dexId: p.dexId || "unknown",
    pairAddress: p.pairAddress || null,
    quoteSymbol: p.quoteToken?.symbol || "",
    liquidityUsd: Number(p.liquidity?.usd) || 0,
    url: p.url || null,
    labels: pairLabels(p),
    jupiterSwapUrl: mintAddress ? `https://jup.ag/swap/SOL-${mintAddress}` : null
  }));
}

function toPositiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function resolveCoingeckoAsset(address, bestPair) {
  if (WELL_KNOWN_MINT_TO_CG[address]) return WELL_KNOWN_MINT_TO_CG[address];
  const symbol = String(bestPair?.baseToken?.symbol || "").toUpperCase();
  const name = String(bestPair?.baseToken?.name || "").toLowerCase();
  if (symbol === "SOL" || name.includes("solana")) return "solana";
  if (symbol === "BTC" || symbol === "WBTC" || name.includes("bitcoin")) return "bitcoin";
  if (symbol === "ETH" || symbol === "WETH" || name.includes("ethereum")) return "ethereum";
  return null;
}

async function fetchCoinGeckoMarketCap(assetId) {
  if (!assetId) return 0;
  try {
    const { data } = await CG_BREAKER.execute(() =>
      axios.get(COINGECKO_SIMPLE_PRICE, {
        timeout: 5000,
        params: {
          ids: assetId,
          vs_currencies: "usd",
          include_market_cap: "true"
        }
      })
    );
    return toPositiveNumber(data?.[assetId]?.usd_market_cap);
  } catch (error) {
    if (error?.code === "CIRCUIT_OPEN" || error?.code === "CIRCUIT_HALF_OPEN_THROTTLED") return 0;
    console.warn("CoinGecko fallback failed:", error.message);
    return 0;
  }
}

function getMarketDataCircuitStatus() {
  const dex = DEX_BREAKER.snapshot();
  const cg = CG_BREAKER.snapshot();
  return {
    dexscreener: dex,
    coingecko: cg,
    degraded: dex.state !== "CLOSED" || cg.state !== "CLOSED",
    reason:
      dex.state !== "CLOSED"
        ? `dexscreener_${dex.state.toLowerCase()}`
        : cg.state !== "CLOSED"
          ? `coingecko_${cg.state.toLowerCase()}`
          : null
  };
}

async function getMarketData(address) {
  const cacheKey = `market:${address}`;
  const cached = await redis.get(cacheKey);
  if (cached) return { ...cached, _source: "cache" };

  try {
    const { data } = await DEX_BREAKER.execute(() =>
      axios.get(`https://api.dexscreener.com/latest/dex/tokens/${address}`, { timeout: 5000 })
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

    const lock = inferLpLockFromPair(bestPair);
    const allLabels = pairs.flatMap((p) => pairLabels(p).map((l) => l.toLowerCase()));
    const honeypotHint = inferHoneypotFromLabels(allLabels);
    const dexPairs = buildDexPairs(pairs, address);
    const socials = extractSocials(bestPair.info);
    const labs = pairLabels(bestPair);
    const verifiedHint =
      labs.some((l) => /verified|vouched/i.test(String(l))) ||
      allLabels.some((l) => l.includes("verified") && !l.includes("unverified"));

    // Native mints may have market cap data at token-level providers, not in pair fdv.
    const pair0Fdv = toPositiveNumber(pairs?.[0]?.fdv);
    const bestPairFdv = toPositiveNumber(bestPair?.fdv);
    let marketCap = pair0Fdv || bestPairFdv;
    if (!marketCap) {
      const cgAsset = resolveCoingeckoAsset(address, bestPair);
      marketCap = await fetchCoinGeckoMarketCap(cgAsset);
    }

    const marketData = {
      price: Number(bestPair.priceUsd) || 0,
      priceChange24h: bestPair.priceChange?.h24 || 0,
      volume24h: Number(bestPair.volume?.h24) || 0,
      marketCap: marketCap || null,
      liquidity: Number(bestPair.liquidity?.usd) || 0,
      symbol: bestPair.baseToken?.symbol || "?",
      name: bestPair.baseToken?.name || "",
      deployerAddress,
      lpLocked: lock.lpLocked,
      lpLockDuration: lock.lpLockDuration,
      lpLockDetail: lock.lpLockDetail,
      dexPairs,
      socials,
      dexLabels: labs,
      honeypotHint,
      verifiedListingHint: Boolean(verifiedHint),
      pairUrl: bestPair.url || null,
      narrativeTags: detectNarrativeTags({
        name: bestPair.baseToken?.name,
        symbol: bestPair.baseToken?.symbol,
        websites: socials.websites || [],
        socials: [socials.twitter, socials.telegram, socials.discord].filter(Boolean)
      })
    };

    await cacheSetJson(cacheKey, CACHE_TTL_SECONDS, marketData);
    return { ...marketData, _source: "api" };
  } catch (error) {
    if (error?.code === "CIRCUIT_OPEN" || error?.code === "CIRCUIT_HALF_OPEN_THROTTLED") return null;
    console.error("DexScreener error:", error.message);
    return null;
  }
}

module.exports = { getMarketData, getMarketDataCircuitStatus };

