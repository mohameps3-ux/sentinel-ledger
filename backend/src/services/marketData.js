const axios = require("axios");
const { pairCreatedRawToUnixMs } = require("../lib/pairTime");
const redis = require("../lib/cache");
const { detectNarrativeTags } = require("./narrativeTags");
const { createCircuitBreaker } = require("../lib/circuitBreaker");
const { getRecentMarketSnapshot, upsertMarketSnapshot } = require("./marketSnapshots");

const CACHE_TTL_SECONDS = 20;
const COINGECKO_SIMPLE_PRICE = "https://api.coingecko.com/api/v3/simple/price";
const BIRDEYE_BASE = "https://public-api.birdeye.so";
const BIRDEYE_HEADER_CHAIN = "solana";
const RETRY_429_MAX = Math.max(1, Math.min(2, Number(process.env.MARKETDATA_RETRY_429_MAX || 2)));
const RETRY_429_MIN_JITTER_MS = Math.max(50, Number(process.env.MARKETDATA_RETRY_429_MIN_MS || 200));
const RETRY_429_MAX_JITTER_MS = Math.max(RETRY_429_MIN_JITTER_MS, Number(process.env.MARKETDATA_RETRY_429_MAX_MS || 600));
const REQUEST_DEDUP_WINDOW_MS = Math.max(250, Number(process.env.MARKETDATA_DEDUP_WINDOW_MS || 1500));
const WELL_KNOWN_MINT_TO_CG = {
  So11111111111111111111111111111111111111112: "solana"
};

const DEX_TOKEN_BREAKER = createCircuitBreaker({
  name: "dex_token",
  failureThreshold: Number(process.env.MARKETDATA_DEX_CB_FAILURES || 4),
  openMs: Number(process.env.MARKETDATA_DEX_CB_OPEN_MS || 45_000),
  halfOpenMaxCalls: Number(process.env.MARKETDATA_DEX_CB_HALF_OPEN_CALLS || 2),
  halfOpenSuccessThreshold: Number(process.env.MARKETDATA_DEX_CB_HALF_OPEN_SUCCESS || 2)
});
const DEX_HOT_BREAKER = createCircuitBreaker({
  name: "dex_hot",
  failureThreshold: Number(process.env.MARKETDATA_DEX_HOT_CB_FAILURES || process.env.MARKETDATA_DEX_CB_FAILURES || 4),
  openMs: Number(process.env.MARKETDATA_DEX_HOT_CB_OPEN_MS || process.env.MARKETDATA_DEX_CB_OPEN_MS || 45_000),
  halfOpenMaxCalls: Number(
    process.env.MARKETDATA_DEX_HOT_CB_HALF_OPEN_CALLS || process.env.MARKETDATA_DEX_CB_HALF_OPEN_CALLS || 2
  ),
  halfOpenSuccessThreshold: Number(
    process.env.MARKETDATA_DEX_HOT_CB_HALF_OPEN_SUCCESS || process.env.MARKETDATA_DEX_CB_HALF_OPEN_SUCCESS || 2
  )
});
const BIRDEYE_TOKEN_BREAKER = createCircuitBreaker({
  name: "birdeye_token",
  failureThreshold: Number(process.env.MARKETDATA_BIRDEYE_CB_FAILURES || 4),
  openMs: Number(process.env.MARKETDATA_BIRDEYE_CB_OPEN_MS || 45_000),
  halfOpenMaxCalls: Number(process.env.MARKETDATA_BIRDEYE_CB_HALF_OPEN_CALLS || 2),
  halfOpenSuccessThreshold: Number(process.env.MARKETDATA_BIRDEYE_CB_HALF_OPEN_SUCCESS || 2)
});
const CG_BREAKER = createCircuitBreaker({
  name: "coingecko",
  failureThreshold: Number(process.env.MARKETDATA_CG_CB_FAILURES || 4),
  openMs: Number(process.env.MARKETDATA_CG_CB_OPEN_MS || 45_000),
  halfOpenMaxCalls: Number(process.env.MARKETDATA_CG_CB_HALF_OPEN_CALLS || 2),
  halfOpenSuccessThreshold: Number(process.env.MARKETDATA_CG_CB_HALF_OPEN_SUCCESS || 2)
});
const inflightByMint = new Map();
const providerRateStats = {
  dex_token: { totalAttempts: 0, status429: 0, last429At: null },
  dex_hot: { totalAttempts: 0, status429: 0, last429At: null },
  birdeye_token: { totalAttempts: 0, status429: 0, last429At: null }
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toHttpStatus(err) {
  return Number(err?.response?.status || err?.status || 0);
}

function isRetryable429(err) {
  return toHttpStatus(err) === 429;
}

function noteProviderAttempt(label, status) {
  if (!label || !providerRateStats[label]) return;
  providerRateStats[label].totalAttempts += 1;
  if (Number(status) === 429) {
    providerRateStats[label].status429 += 1;
    providerRateStats[label].last429At = Date.now();
  }
}

async function with429Retry(fn, label = "") {
  let attempts = 0;
  let lastError = null;
  const totalAttempts = 1 + RETRY_429_MAX;
  while (attempts < totalAttempts) {
    attempts += 1;
    try {
      const out = await fn(attempts);
      noteProviderAttempt(label, out?.status || 200);
      return { out, attempts };
    } catch (error) {
      noteProviderAttempt(label, toHttpStatus(error) || 0);
      lastError = error;
      if (!isRetryable429(error) || attempts >= totalAttempts) break;
      const jitter = Math.floor(
        RETRY_429_MIN_JITTER_MS + Math.random() * (RETRY_429_MAX_JITTER_MS - RETRY_429_MIN_JITTER_MS)
      );
      await sleep(jitter);
    }
  }
  if (lastError) {
    lastError._attempts = attempts;
  }
  throw lastError || new Error("retry_failed");
}

function getBirdeyeHeaders() {
  const key = String(process.env.BIRDEYE_API_KEY || "").trim();
  if (!key) return null;
  return {
    "X-API-KEY": key,
    "x-chain": BIRDEYE_HEADER_CHAIN
  };
}

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

function buildMarketDataFromDex(address, data) {
  const pairs = data?.pairs || [];
  if (!pairs.length) throw new Error("No pair found");

  const bestPair = pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
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
  const pairCreatedRaw = bestPair?.pairCreatedAt ?? bestPair?.pairCreated ?? null;
  const pairCreatedAt = pairCreatedRawToUnixMs(pairCreatedRaw);
  return {
    marketData: {
      price: Number(bestPair.priceUsd) || 0,
      priceChange24h: bestPair.priceChange?.h24 || 0,
      volume24h: Number(bestPair.volume?.h24) || 0,
      marketCap: pair0Fdv || bestPairFdv || null,
      liquidity: Number(bestPair.liquidity?.usd) || 0,
      pairCreatedAt,
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
    },
    bestPair
  };
}

function buildMarketDataFromBirdeye(address, row) {
  const symbol = String(row?.symbol || "").trim() || "?";
  const name = String(row?.name || "").trim() || symbol;
  const websites = [];
  const website = String(row?.website || "").trim();
  if (website) websites.push(website);
  const twitter = String(row?.twitter || "").trim() || null;
  const telegram = String(row?.telegram || "").trim() || null;
  const discord = String(row?.discord || "").trim() || null;
  const marketData = {
    price: Number(row?.price || 0),
    priceChange24h: Number(row?.priceChange24h || row?.priceChange24hPercent || 0),
    volume24h: Number(row?.volume24h || row?.v24hUSD || 0),
    marketCap: Number(row?.marketCap || row?.mc || 0) || null,
    liquidity: Number(row?.liquidity || row?.liquidityUSD || 0),
    symbol,
    name,
    deployerAddress: row?.owner || null,
    lpLocked: null,
    lpLockDuration: 0,
    lpLockDetail: null,
    dexPairs: [],
    socials: { websites, twitter, telegram, discord },
    dexLabels: [],
    honeypotHint: "unknown",
    verifiedListingHint: false,
    pairUrl: null,
    narrativeTags: detectNarrativeTags({
      name,
      symbol,
      websites,
      socials: [twitter, telegram, discord].filter(Boolean)
    })
  };
  if (!marketData.symbol || (!marketData.price && !marketData.volume24h && !marketData.liquidity)) return null;
  return marketData;
}

async function fetchDexHotProfilesLatest() {
  const { out, attempts } = await with429Retry(() =>
    DEX_HOT_BREAKER.execute(() => axios.get("https://api.dexscreener.com/token-profiles/latest/v1", { timeout: 5000 })),
    "dex_hot"
  );
  return {
    data: out?.data,
    attempts,
    circuitState: DEX_HOT_BREAKER.snapshot()?.state || "UNKNOWN"
  };
}

async function fetchBirdeyeTokenOverview(address) {
  const headers = getBirdeyeHeaders();
  if (!headers) return { data: null, attempts: 0, skipped: "missing_api_key", circuitState: BIRDEYE_TOKEN_BREAKER.snapshot()?.state || "UNKNOWN" };
  const { out, attempts } = await with429Retry(() =>
    BIRDEYE_TOKEN_BREAKER.execute(() =>
      axios.get(`${BIRDEYE_BASE}/defi/token_overview`, {
        timeout: 5000,
        params: { address },
        headers,
        validateStatus: () => true
      })
    ),
    "birdeye_token"
  );
  const status = Number(out?.status || 0);
  if (status !== 200) {
    const err = new Error(`birdeye_overview_status_${status || "unknown"}`);
    err.status = status;
    throw err;
  }
  if (out?.data?.success !== true) {
    throw new Error(String(out?.data?.message || out?.data?.error || "birdeye_overview_failed"));
  }
  return {
    data: out?.data?.data || null,
    attempts,
    circuitState: BIRDEYE_TOKEN_BREAKER.snapshot()?.state || "UNKNOWN"
  };
}

async function fetchBirdeyeHotCandidates(limit = 120) {
  const headers = getBirdeyeHeaders();
  if (!headers) return { mints: [], attempts: 0, skipped: "missing_api_key", circuitState: BIRDEYE_TOKEN_BREAKER.snapshot()?.state || "UNKNOWN" };
  const cap = Math.min(200, Math.max(20, Number(limit) || 120));
  const tryEndpoints = [
    { path: "/defi/token_trending", params: { sort_by: "rank", sort_type: "asc", offset: 0, limit: cap } },
    { path: "/defi/tokenlist", params: { sort_by: "v24hUSD", sort_type: "desc", offset: 0, limit: cap } }
  ];
  let lastError = null;
  for (const endpoint of tryEndpoints) {
    try {
      const { out, attempts } = await with429Retry(() =>
        BIRDEYE_TOKEN_BREAKER.execute(() =>
          axios.get(`${BIRDEYE_BASE}${endpoint.path}`, {
            timeout: 5000,
            params: endpoint.params,
            headers,
            validateStatus: () => true
          })
        ),
        "birdeye_token"
      );
      const status = Number(out?.status || 0);
      if (status !== 200 || out?.data?.success !== true) {
        lastError = new Error(`birdeye_hot_status_${status || "unknown"}_${endpoint.path}`);
        continue;
      }
      const raw = out?.data?.data;
      const rows = Array.isArray(raw) ? raw : Array.isArray(raw?.tokens) ? raw.tokens : [];
      const mints = rows
        .map((r) => String(r?.address || r?.tokenAddress || r?.mint || "").trim())
        .filter(Boolean);
      if (!mints.length) continue;
      return {
        mints: [...new Set(mints)],
        attempts,
        circuitState: BIRDEYE_TOKEN_BREAKER.snapshot()?.state || "UNKNOWN",
        endpoint: endpoint.path
      };
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  return { mints: [], attempts: 0, circuitState: BIRDEYE_TOKEN_BREAKER.snapshot()?.state || "UNKNOWN" };
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
  const dexToken = DEX_TOKEN_BREAKER.snapshot();
  const dexHot = DEX_HOT_BREAKER.snapshot();
  const birdeyeToken = BIRDEYE_TOKEN_BREAKER.snapshot();
  const cg = CG_BREAKER.snapshot();
  const degraded =
    dexToken.state !== "CLOSED" ||
    dexHot.state !== "CLOSED" ||
    birdeyeToken.state !== "CLOSED" ||
    cg.state !== "CLOSED";
  const reason =
    dexToken.state !== "CLOSED"
      ? `dex_token_${dexToken.state.toLowerCase()}`
      : dexHot.state !== "CLOSED"
        ? `dex_hot_${dexHot.state.toLowerCase()}`
        : birdeyeToken.state !== "CLOSED"
          ? `birdeye_token_${birdeyeToken.state.toLowerCase()}`
          : cg.state !== "CLOSED"
            ? `coingecko_${cg.state.toLowerCase()}`
            : null;
  return {
    // Legacy alias kept for compatibility.
    dexscreener: dexToken,
    coingecko: cg,
    providers: {
      dex_token: dexToken,
      dex_hot: dexHot,
      birdeye_token: birdeyeToken,
      coingecko: cg
    },
    degraded,
    reason
  };
}

async function getMarketData(address) {
  const inFlight = inflightByMint.get(address);
  if (inFlight && inFlight.expiresAt > Date.now()) {
    return inFlight.promise;
  }
  const promise = getMarketDataUncached(address);
  inflightByMint.set(address, {
    promise,
    expiresAt: Date.now() + REQUEST_DEDUP_WINDOW_MS
  });
  try {
    return await promise;
  } finally {
    const current = inflightByMint.get(address);
    if (current?.promise === promise) inflightByMint.delete(address);
  }
}

async function getMarketDataUncached(address) {
  const cacheKey = `market:${address}`;
  const cached = await redis.get(cacheKey);
  if (cached) return { ...cached, _source: "cache" };

  let marketData = null;
  let providerUsed = null;
  let attempts = 0;
  let circuitState = null;
  let bestPair = null;
  try {
    const dex = await with429Retry(() =>
      DEX_TOKEN_BREAKER.execute(() =>
        axios.get(`https://api.dexscreener.com/latest/dex/tokens/${address}`, { timeout: 5000 })
      ),
      "dex_token"
    );
    attempts += Number(dex.attempts || 1);
    circuitState = dex?.out ? DEX_TOKEN_BREAKER.snapshot()?.state : circuitState;
    const parsed = buildMarketDataFromDex(address, dex?.out?.data || {});
    marketData = parsed.marketData;
    bestPair = parsed.bestPair;
    providerUsed = "dex_token";
  } catch (_) {
    marketData = null;
  }

  if (!marketData) {
    try {
      const be = await fetchBirdeyeTokenOverview(address);
      attempts += Number(be.attempts || 1);
      circuitState = be.circuitState || circuitState;
      marketData = buildMarketDataFromBirdeye(address, be.data || {});
      if (marketData) providerUsed = "birdeye_token";
    } catch (_) {
      marketData = null;
    }
  }

  if (!marketData) {
    const snap = await getRecentMarketSnapshot(address);
    if (!snap) return null;
    return {
      price: snap.price,
      priceChange24h: snap.priceChange24h,
      volume24h: snap.volume24h,
      marketCap: snap.marketCap,
      liquidity: snap.liquidity,
      symbol: snap.symbol,
      name: snap.name,
      deployerAddress: null,
      lpLocked: null,
      lpLockDuration: 0,
      lpLockDetail: null,
      dexPairs: [],
      socials: { websites: [], twitter: null, telegram: null, discord: null },
      dexLabels: [],
      honeypotHint: "unknown",
      verifiedListingHint: false,
      pairUrl: null,
      narrativeTags: detectNarrativeTags({ name: snap.name, symbol: snap.symbol }),
      _source: "snapshot",
      _provider: snap.providerUsed || "snapshot_db",
      _attempts: Math.max(1, attempts),
      _circuitState: circuitState || "UNKNOWN"
    };
  }

  // Native mints may have market cap data at token-level providers, not in pair fdv.
  if (!marketData.marketCap) {
    const cgAsset = resolveCoingeckoAsset(address, bestPair || {});
    marketData.marketCap = await fetchCoinGeckoMarketCap(cgAsset);
  }

  await cacheSetJson(cacheKey, CACHE_TTL_SECONDS, marketData);
  // Best-effort persistence for stale-safe reads when upstream degrades.
  upsertMarketSnapshot(address, marketData, {
    source: "market_data",
    providerUsed: providerUsed || "unknown"
  }).catch(() => {});
  return {
    ...marketData,
    _source: "api",
    _provider: providerUsed || "unknown",
    _attempts: Math.max(1, attempts),
    _circuitState: circuitState || "UNKNOWN"
  };
}

module.exports = {
  getMarketData,
  getMarketDataCircuitStatus,
  getMarketDataProviderStats: () => {
    const out = {};
    for (const [k, v] of Object.entries(providerRateStats)) {
      const total = Math.max(1, Number(v.totalAttempts || 0));
      out[k] = {
        totalAttempts: Number(v.totalAttempts || 0),
        status429: Number(v.status429 || 0),
        rate429: Number((Number(v.status429 || 0) / total).toFixed(4)),
        last429At: v.last429At
      };
    }
    return out;
  },
  fetchDexHotProfilesLatest,
  fetchBirdeyeHotCandidates
};

