const express = require("express");
const publicTerminalLimiter = require("../middleware/publicTerminalLimiter");
const { getSupabase } = require("../lib/supabase");
const { getHotTokensCached } = require("../services/homeTerminalApi");
const { getMarketData } = require("../services/marketData");
const { isProbableSolanaPubkey } = require("../lib/solanaAddress");

const router = express.Router();

function safeSupabase() {
  try {
    return getSupabase();
  } catch {
    return null;
  }
}

/**
 * GET /api/v1/tokens/hot
 * Hot tokens + terminal fields (sentinelScore, decision, quickBuy, …). Cached ~3m.
 * Cost $0: DexScreener public + optional Supabase tokens_analyzed merge (no paid APIs).
 */
router.get("/hot", publicTerminalLimiter, async (req, res) => {
  try {
    const supabase = safeSupabase();
    const lim = Math.min(24, Math.max(1, Number(req.query.limit) || 12));
    const body = await getHotTokensCached(lim, supabase);
    const narrative = String(req.query.narrative || "").trim().toUpperCase();
    const filteredData =
      narrative.length > 0
        ? (body.data || []).filter((t) =>
            Array.isArray(t.narrativeTags) && t.narrativeTags.map((x) => String(x).toUpperCase()).includes(narrative)
          )
        : body.data;
    return res.json({
      ok: body.ok,
      data: filteredData,
      meta: { ...(body.meta || {}), narrative: narrative || null, count: filteredData?.length || 0 }
    });
  } catch (e) {
    console.error("tokens/hot:", e.message);
    return res.status(500).json({
      ok: false,
      error: e.message || "tokens_hot_failed",
      data: [],
      meta: { source: "strict_real_error", degraded: true, count: 0 }
    });
  }
});

const QUOTES_MAX_MINTS = 16;
const QUOTES_BATCH = 4;

/**
 * GET /api/v1/tokens/quotes?mints=m1,m2,…
 * Lightweight spot rows for LIVE decision feed refresh (batched getMarketData).
 */
router.get("/quotes", publicTerminalLimiter, async (req, res) => {
  const raw = String(req.query.mints || "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => isProbableSolanaPubkey(s));
  const mints = [...new Set(raw)].slice(0, QUOTES_MAX_MINTS);
  if (!mints.length) {
    return res.json({ ok: true, data: [], meta: { count: 0, generatedAt: Date.now() } });
  }
  const out = [];
  for (let i = 0; i < mints.length; i += QUOTES_BATCH) {
    const batch = mints.slice(i, i + QUOTES_BATCH);
    const chunk = await Promise.all(
      batch.map(async (mint) => {
        try {
          const m = await getMarketData(mint);
          const price = Number(m?.price);
          const priceChange24h = Number(m?.priceChange24h);
          return {
            mint,
            symbol: m?.symbol || null,
            price: Number.isFinite(price) && price > 0 ? price : null,
            priceChange24h: Number.isFinite(priceChange24h) ? priceChange24h : null,
            liquidity: Number.isFinite(Number(m?.liquidity)) ? Number(m.liquidity) : null,
            volume24h: Number.isFinite(Number(m?.volume24h)) ? Number(m.volume24h) : null,
            providerUsed: m?._provider || null
          };
        } catch {
          return { mint, symbol: null, price: null, priceChange24h: null, liquidity: null, volume24h: null, providerUsed: null };
        }
      })
    );
    out.push(...chunk);
  }
  return res.json({
    ok: true,
    data: out,
    meta: { count: out.length, generatedAt: Date.now(), maxMints: QUOTES_MAX_MINTS }
  });
});

module.exports = router;
