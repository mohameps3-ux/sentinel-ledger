const { getMarketData, fetchDexHotProfilesLatest, fetchBirdeyeHotCandidates } = require("./marketData");

const STRICT_MIN_LIQUIDITY = 15000;
const STRICT_MIN_VOLUME_24H = 25000;
const RELAXED_MIN_LIQUIDITY = 2000;
const RELAXED_MIN_VOLUME_24H = 5000;

function fmtUsdCompact(n) {
  const x = Number(n || 0);
  if (!Number.isFinite(x) || x < 0) return "$0";
  if (x >= 1e9) return `$${(x / 1e9).toFixed(2)}B`;
  if (x >= 1e6) return `$${(x / 1e6).toFixed(2)}M`;
  if (x >= 1e3) return `$${(x / 1e3).toFixed(1)}k`;
  return `$${Math.round(x)}`;
}

/** Letter grades / narrative flow labels removed — only provider-reported numbers. */
function deriveProviderBadge(market) {
  const p = String(market?._provider || "").toLowerCase();
  if (p.includes("bird")) return "BE";
  if (p.includes("dex") || p.includes("screen")) return "DEX";
  return "MKT";
}

function deriveFlowFacts(market) {
  const liq = Number(market?.liquidity || 0);
  return `Liq ${fmtUsdCompact(liq)}`;
}

function deriveWhyFacts(market) {
  const liq = Number(market?.liquidity || 0);
  const vol = Number(market?.volume24h || 0);
  const chg = Number(market?.priceChange24h || 0);
  const prov = String(market?._provider || "proveedor");
  return [
    `Δ 24h: ${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`,
    `Vol 24h: ${fmtUsdCompact(vol)} · Liq: ${fmtUsdCompact(liq)}`,
    `Fuente métricas: ${prov}`
  ];
}

function normalizeTrendingEntry(mint, market) {
  return {
    mint,
    symbol: market.symbol,
    price: Number(market.price || 0),
    change: Number(market.priceChange24h || 0),
    volume24h: Number(market.volume24h || 0),
    liquidity: Number(market.liquidity || 0),
    providerUsed: market?._provider || "unknown",
    attempts: Number(market?._attempts || 1),
    circuitState: market?._circuitState || "UNKNOWN",
    grade: deriveProviderBadge(market),
    flowLabel: deriveFlowFacts(market),
    alphaSpeedMins: null,
    whyTrade: deriveWhyFacts(market)
  };
}

/**
 * DexScreener latest profiles → enriched trending rows (same shape as legacy /token/trending).
 */
async function fetchTrendingList(limit = 6) {
  const cap = Math.min(24, Math.max(1, Number(limit) || 6));
  let providerUsed = "dex_hot";
  let attempts = 0;
  let circuitState = "UNKNOWN";
  let mintCandidates = [];
  try {
    const dex = await fetchDexHotProfilesLatest();
    attempts += Number(dex?.attempts || 1);
    circuitState = dex?.circuitState || circuitState;
    const candidates = Array.isArray(dex?.data) ? dex.data.filter((x) => x?.chainId === "solana") : [];
    const seenMints = new Set();
    for (const item of candidates.slice(0, 120)) {
      const mint = item?.tokenAddress;
      if (!mint || typeof mint !== "string" || seenMints.has(mint)) continue;
      seenMints.add(mint);
      mintCandidates.push(mint);
    }
  } catch (_) {
    mintCandidates = [];
  }

  if (!mintCandidates.length) {
    try {
      const be = await fetchBirdeyeHotCandidates(120);
      attempts += Number(be?.attempts || 1);
      circuitState = be?.circuitState || circuitState;
      mintCandidates = Array.isArray(be?.mints) ? be.mints.slice(0, 120) : [];
      providerUsed = "birdeye_hot";
    } catch (_) {
      mintCandidates = [];
      providerUsed = "hot_provider_unavailable";
    }
  }

  const strict = [];
  const relaxed = [];

  const BATCH = 8;
  for (let i = 0; i < mintCandidates.length; i += BATCH) {
    const batch = mintCandidates.slice(i, i + BATCH);
    const markets = await Promise.all(
      batch.map(async (mint) => {
        try {
          const market = await getMarketData(mint);
          return { mint, market };
        } catch {
          return { mint, market: null };
        }
      })
    );
    for (const { mint, market } of markets) {
      if (!market || !market.symbol) continue;
      const liq = Number(market?.liquidity || 0);
      const vol = Number(market?.volume24h || 0);
      const normalized = normalizeTrendingEntry(mint, market);
      if (liq >= STRICT_MIN_LIQUIDITY && vol >= STRICT_MIN_VOLUME_24H) strict.push(normalized);
      else if (liq >= RELAXED_MIN_LIQUIDITY && vol >= RELAXED_MIN_VOLUME_24H) relaxed.push(normalized);
    }
    if (strict.length >= cap) break;
  }

  const out = [...strict];
  if (out.length < cap) {
    for (const token of relaxed) {
      out.push(token);
      if (out.length >= cap) break;
    }
  }

  return {
    ok: true,
    data: out,
    meta: {
      source: providerUsed === "dex_hot" ? "dexscreener" : providerUsed,
      providerUsed,
      attempts: Math.max(1, attempts || 1),
      circuitState,
      count: out.length,
      strictCount: strict.length,
      generatedAt: Date.now(),
      minLiquidityUsd: STRICT_MIN_LIQUIDITY
    }
  };
}

module.exports = { fetchTrendingList };
