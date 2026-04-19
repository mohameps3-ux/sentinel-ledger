const axios = require("axios");
const redis = require("../lib/cache");

const CACHE_TTL_SECONDS = 20;

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

    const lock = inferLpLockFromPair(bestPair);
    const allLabels = pairs.flatMap((p) => pairLabels(p).map((l) => l.toLowerCase()));
    const honeypotHint = inferHoneypotFromLabels(allLabels);
    const dexPairs = buildDexPairs(pairs, address);
    const socials = extractSocials(bestPair.info);
    const labs = pairLabels(bestPair);
    const verifiedHint =
      labs.some((l) => /verified|vouched/i.test(String(l))) ||
      allLabels.some((l) => l.includes("verified") && !l.includes("unverified"));

    const marketData = {
      price: Number(bestPair.priceUsd) || 0,
      priceChange24h: bestPair.priceChange?.h24 || 0,
      volume24h: Number(bestPair.volume?.h24) || 0,
      marketCap: Number(bestPair.fdv) || 0,
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
      pairUrl: bestPair.url || null
    };

    await cacheSetJson(cacheKey, CACHE_TTL_SECONDS, marketData);
    return { ...marketData, _source: "api" };
  } catch (error) {
    console.error("DexScreener error:", error.message);
    return null;
  }
}

module.exports = { getMarketData };

