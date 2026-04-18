const express = require("express");
const { getSupabase } = require("../lib/supabase");
const { authMiddleware } = require("./auth");
const { getMarketData } = require("../services/marketData");

const router = express.Router();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Lightweight score from Dex liquidity + 24h move (not on-chain PnL). */
function quickScore(md) {
  if (!md) return null;
  const liq = Number(md.liquidity) || 0;
  const ch = Number(md.priceChange24h) || 0;
  let s = 55;
  if (liq > 100_000) s += 15;
  else if (liq > 20_000) s += 8;
  else if (liq > 5_000) s += 3;
  if (ch >= 10) s += 12;
  else if (ch >= 0) s += 6;
  else if (ch > -15) s += 0;
  else s -= 12;
  return Math.max(0, Math.min(100, Math.round(s)));
}

/**
 * GET /api/v1/portfolio/watchlist-markets
 * Live DexScreener snapshot per watchlist mint (not wallet token balances).
 */
router.get("/watchlist-markets", authMiddleware, async (req, res) => {
  try {
    const rawLimit = Number(req.query.limit || process.env.PORTFOLIO_MAX_TOKENS || 24);
    const limit = Math.min(40, Math.max(1, Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 24));
    const delayMs = Math.min(
      400,
      Math.max(0, Number(process.env.PORTFOLIO_DEX_DELAY_MS || 120) || 0)
    );

    const supabase = getSupabase();
    const { data: rows, error } = await supabase
      .from("watchlists")
      .select("token_address, note, added_at")
      .eq("user_id", req.user.userId)
      .order("added_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    const positions = [];
    for (const row of rows || []) {
      const mint = row.token_address;
      const md = await getMarketData(mint);
      if (delayMs) await sleep(delayMs);
      positions.push({
        tokenAddress: mint,
        note: row.note || "",
        addedAt: row.added_at,
        symbol: md?.symbol || "?",
        name: md?.name || "",
        priceUsd: md != null && Number.isFinite(Number(md.price)) ? Number(md.price) : null,
        liquidityUsd: md != null && Number.isFinite(Number(md.liquidity)) ? Number(md.liquidity) : null,
        fdvUsd: md != null && Number.isFinite(Number(md.marketCap)) ? Number(md.marketCap) : null,
        change24hPct: md != null && Number.isFinite(Number(md.priceChange24h)) ? Number(md.priceChange24h) : null,
        score: quickScore(md)
      });
    }

    return res.json({
      ok: true,
      meta: { source: "watchlist+dexscreener", count: positions.length },
      positions
    });
  } catch (e) {
    console.error("portfolio watchlist-markets:", e);
    return res.status(500).json({ ok: false, error: "portfolio_failed" });
  }
});

module.exports = router;
