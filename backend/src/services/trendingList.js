const axios = require("axios");
const { getMarketData } = require("./marketData");

const STRICT_MIN_LIQUIDITY = 15000;
const STRICT_MIN_VOLUME_24H = 25000;
const RELAXED_MIN_LIQUIDITY = 2000;
const RELAXED_MIN_VOLUME_24H = 5000;

function deriveTrendingGrade(market) {
  const liq = Number(market?.liquidity || 0);
  const vol = Number(market?.volume24h || 0);
  const chg = Number(market?.priceChange24h || 0);
  if (liq >= 500000 && vol >= 1000000 && chg >= 5) return "A+";
  if (liq >= 200000 && vol >= 500000 && chg >= 0) return "A";
  if (liq >= 50000 && vol >= 100000) return "B";
  if (liq >= 10000) return "C";
  return "D";
}

function deriveFlowLabel(market) {
  const chg = Number(market?.priceChange24h || 0);
  const vol = Number(market?.volume24h || 0);
  if (chg >= 8 && vol >= 500000) return "Smart inflow";
  if (chg >= 0) return "Buy pressure";
  if (chg <= -8) return "Heavy sell pressure";
  return "Mixed flow";
}

function deriveAlphaSpeedMinutes(market) {
  const liq = Number(market?.liquidity || 0);
  const vol = Number(market?.volume24h || 0);
  if (liq <= 0 || vol <= 0) return null;
  const turnover = vol / Math.max(liq, 1);
  if (turnover >= 8) return 4;
  if (turnover >= 4) return 7;
  if (turnover >= 2) return 12;
  if (turnover >= 1) return 18;
  return 25;
}

function deriveWhyTrade(market) {
  const reasons = [];
  const liq = Number(market?.liquidity || 0);
  const vol = Number(market?.volume24h || 0);
  const chg = Number(market?.priceChange24h || 0);
  const speed = deriveAlphaSpeedMinutes(market);

  if (chg >= 12) reasons.push("Breakout momentum: strong upside in last 24h.");
  else if (chg >= 5) reasons.push("Positive trend: consistent buy-side pressure.");
  else if (chg <= -20) reasons.push("Capitulation bounce setup: deep pullback with active tape.");

  if (liq >= 150000) reasons.push("Liquidity depth supports entries with lower slippage.");
  else if (liq >= 50000) reasons.push("Tradable liquidity with manageable execution risk.");
  else if (liq >= 15000) reasons.push("Early liquidity band: higher upside with tighter risk control.");

  if (vol >= 1000000) reasons.push("High participation: volume confirms market attention.");
  else if (vol >= 250000) reasons.push("Volume expansion signals accelerating interest.");

  if (speed !== null) reasons.push(`Alpha speed: detected in ~${speed}m from flow/liquidity profile.`);

  return reasons.slice(0, 3);
}

function normalizeTrendingEntry(mint, market) {
  const alphaSpeedMins = deriveAlphaSpeedMinutes(market);
  return {
    mint,
    symbol: market.symbol,
    price: Number(market.price || 0),
    change: Number(market.priceChange24h || 0),
    volume24h: Number(market.volume24h || 0),
    liquidity: Number(market.liquidity || 0),
    grade: deriveTrendingGrade(market),
    flowLabel: deriveFlowLabel(market),
    alphaSpeedMins,
    whyTrade: deriveWhyTrade(market)
  };
}

/**
 * DexScreener latest profiles → enriched trending rows (same shape as legacy /token/trending).
 */
async function fetchTrendingList(limit = 6) {
  const cap = Math.min(24, Math.max(1, Number(limit) || 6));
  const { data } = await axios.get("https://api.dexscreener.com/token-profiles/latest/v1", {
    timeout: 5000
  });
  const candidates = Array.isArray(data) ? data.filter((x) => x?.chainId === "solana") : [];
  const strict = [];
  const relaxed = [];
  const seenMints = new Set();

  for (const item of candidates.slice(0, 36)) {
    const mint = item?.tokenAddress;
    if (!mint || typeof mint !== "string" || seenMints.has(mint)) continue;
    const market = await getMarketData(mint);
    if (!market || !market.symbol) continue;
    seenMints.add(mint);

    const liq = Number(market?.liquidity || 0);
    const vol = Number(market?.volume24h || 0);
    const normalized = normalizeTrendingEntry(mint, market);

    if (liq >= STRICT_MIN_LIQUIDITY && vol >= STRICT_MIN_VOLUME_24H) {
      strict.push(normalized);
    } else if (liq >= RELAXED_MIN_LIQUIDITY && vol >= RELAXED_MIN_VOLUME_24H) {
      relaxed.push(normalized);
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
      source: "dexscreener",
      count: out.length,
      strictCount: strict.length,
      generatedAt: Date.now(),
      minLiquidityUsd: STRICT_MIN_LIQUIDITY
    }
  };
}

module.exports = { fetchTrendingList };
