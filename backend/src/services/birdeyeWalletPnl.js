const axios = require("axios");
const crypto = require("crypto");
const redis = require("../lib/cache");
const {
  inspectBirdeyeRestResponse,
  isBirdeyeRestBlocked,
  getBirdeyeRestHealth
} = require("./birdeyeRestStatus");

const BIRDEYE_BASE = "https://public-api.birdeye.so";
const CACHE_TTL_SECONDS = 300;

/**
 * Map Birdeye profit % to a 0–100 score for the UI bar (not a literal "win rate" unless Birdeye supplies it).
 */
function scoreFromBirdeyePnl(pnl) {
  if (!pnl || typeof pnl !== "object") return null;
  const pct = Number(
    pnl.realized_profit_percent ?? pnl.total_percent ?? pnl.unrealized_percent ?? 0
  );
  if (!Number.isFinite(pct)) return null;
  // Rough display curve: heavy losses → low score, strong gains → high score
  return Math.min(
    99,
    Math.max(5, Math.round(52 + Math.min(45, pct / 4)))
  );
}

/**
 * GET /wallet/v2/pnl/multiple — up to 50 wallets for one token.
 * @returns {Map<string, object>} wallet -> Birdeye nested row
 */
async function fetchTokenWalletPnlMap(tokenAddress, walletAddresses) {
  const key = process.env.BIRDEYE_API_KEY;
  if (!key || !tokenAddress || !walletAddresses?.length) {
    return { map: new Map(), restStatus: getBirdeyeRestHealth().status };
  }
  if (isBirdeyeRestBlocked()) {
    return { map: new Map(), restStatus: getBirdeyeRestHealth().status };
  }

  const unique = [...new Set(walletAddresses)].filter(Boolean).slice(0, 50);
  const walletsParam = unique.join(",");

  const { data, status } = await axios.get(`${BIRDEYE_BASE}/wallet/v2/pnl/multiple`, {
    params: {
      token_address: tokenAddress,
      wallets: walletsParam
    },
    headers: {
      "X-API-KEY": key,
      "x-chain": "solana"
    },
    timeout: 20000,
    validateStatus: () => true
  });

  const inspected = inspectBirdeyeRestResponse(status, data, "wallet_pnl");
  if (inspected.exhausted || status !== 200 || !data?.success) {
    if (!inspected.exhausted) {
      console.warn("Birdeye pnl/multiple:", status, data?.message || data?.error || "");
    }
    return { map: new Map(), restStatus: getBirdeyeRestHealth().status };
  }

  const inner = data.data;
  const mapRaw = inner?.data;
  if (!mapRaw || typeof mapRaw !== "object") {
    return { map: new Map(), restStatus: getBirdeyeRestHealth().status };
  }

  const out = new Map();
  for (const w of unique) {
    if (mapRaw[w]) out.set(w, mapRaw[w]);
  }
  return { map: out, restStatus: getBirdeyeRestHealth().status };
}

async function getCachedOrFetchTokenWalletPnl(tokenAddress, walletAddresses) {
  const key = process.env.BIRDEYE_API_KEY;
  if (!key) {
    return { map: new Map(), restStatus: "operational", restReason: null };
  }
  if (isBirdeyeRestBlocked()) {
    const health = getBirdeyeRestHealth();
    return { map: new Map(), restStatus: health.status, restReason: health.reason };
  }

  const sorted = [...walletAddresses].filter(Boolean).sort();
  const hash = crypto
    .createHash("sha256")
    .update(`${tokenAddress}:${sorted.join(",")}`)
    .digest("hex")
    .slice(0, 16);
  const cacheKey = `birdeye:pnl:v1:${hash}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = typeof cached === "string" ? JSON.parse(cached) : cached;
      if (parsed && typeof parsed === "object") {
        return {
          map: new Map(Object.entries(parsed)),
          restStatus: getBirdeyeRestHealth().status,
          restReason: getBirdeyeRestHealth().reason
        };
      }
    }
  } catch (e) {
    console.warn("Birdeye cache read:", e.message);
  }

  const fresh = await fetchTokenWalletPnlMap(tokenAddress, walletAddresses);
  const health = getBirdeyeRestHealth();
  if (fresh.map.size > 0 && health.status === "operational") {
    try {
      const obj = Object.fromEntries(fresh.map);
      await redis.set(cacheKey, JSON.stringify(obj), { ex: CACHE_TTL_SECONDS });
    } catch (e) {
      console.warn("Birdeye cache write:", e.message);
    }
  }

  return {
    map: fresh.map,
    restStatus: fresh.restStatus || health.status,
    restReason: health.reason
  };
}

/**
 * Merge Birdeye per-token PnL into smart-money wallet rows.
 */
function enrichWalletsWithBirdeye(wallets, birdeyeMap, onChainScores) {
  const prev = onChainScores || new Map();
  if (!birdeyeMap || birdeyeMap.size === 0) {
    return wallets.map((w) => ({ ...w, pnlSource: w.pnlSource ?? null }));
  }

  return wallets.map((w) => {
    const row = birdeyeMap.get(w.wallet);
    if (!row?.pnl) {
      return { ...w, pnlSource: null };
    }

    const pnl = row.pnl;
    const realized = Number(pnl.realized_profit_usd ?? pnl.total_usd ?? 0);
    const brScore = scoreFromBirdeyePnl(pnl);
    const signal = prev.get(w.wallet) ?? w.confidence ?? w.winRate ?? 50;
    const blended =
      brScore != null
        ? Math.min(100, Math.round(signal * 0.35 + brScore * 0.65))
        : signal;

    const counts = row.counts || {};
    const cf = row.cashflow_usd || {};
    let hits = w.recentHits;
    if (counts.total_trade != null) hits = Number(counts.total_trade);
    else if (counts.total_buy != null || counts.total_sell != null) {
      hits = Number(counts.total_buy || 0) + Number(counts.total_sell || 0);
    }
    const invested = Number(cf.total_invested || 0);

    return {
      ...w,
      winRate: blended,
      confidence: blended,
      realizedPnl: Number.isFinite(realized) ? Math.round(realized * 100) / 100 : w.realizedPnl,
      recentHits: hits || w.recentHits,
      avgPositionSize:
        invested > 0
          ? Math.round(invested)
          : w.avgPositionSize,
      pnlSource: "birdeye",
      pnlPercentRealized: Number.isFinite(Number(pnl.realized_profit_percent))
        ? Math.round(Number(pnl.realized_profit_percent) * 100) / 100
        : null
    };
  });
}

module.exports = {
  getCachedOrFetchTokenWalletPnl,
  enrichWalletsWithBirdeye,
  scoreFromBirdeyePnl
};
