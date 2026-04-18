const redis = require("../lib/cache");

const CACHE_SEC = Number(process.env.PRO_ALERT_SMART_HINT_TTL_SEC || 900);

/**
 * Lightweight smart-money context for PRO alerts (cached; may hit Helius/RPC via service).
 */
async function getSmartMoneyHintForMint(mint) {
  if (!mint) return { count: 0, source: "empty", topConfidence: 0 };

  const key = `proalert:smhint:${mint}`;
  try {
    const hit = await redis.get(key);
    if (hit != null) {
      const parsed = typeof hit === "string" ? JSON.parse(hit) : hit;
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch (_) {}

  try {
    const { getSmartWalletsForToken } = require("./smartMoneyService");
    const payload = await getSmartWalletsForToken(mint);
    const wallets = Array.isArray(payload?.wallets) ? payload.wallets : [];
    const topConfidence = wallets.reduce((m, w) => Math.max(m, Number(w?.confidence || 0)), 0);
    const hint = {
      count: wallets.length,
      source: payload?.meta?.source || "unknown",
      topConfidence: Math.round(topConfidence)
    };
    try {
      await redis.set(key, JSON.stringify(hint), { ex: Math.max(60, CACHE_SEC) });
    } catch (_) {}
    return hint;
  } catch (_) {
    return { count: 0, source: "error", topConfidence: 0 };
  }
}

module.exports = { getSmartMoneyHintForMint };
