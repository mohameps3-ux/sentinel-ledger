const express = require("express");
const publicTerminalLimiter = require("../middleware/publicTerminalLimiter");
const { getSupabase } = require("../lib/supabase");
const { getHotTokensCached } = require("../services/homeTerminalApi");

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
    const lim = Math.min(24, Math.max(1, Number(req.query.limit) || 12));
    const body = await getHotTokensCached(lim, safeSupabase());
    return res.json({
      ok: body.ok,
      data: body.data,
      meta: body.meta || {}
    });
  } catch (e) {
    console.error("tokens/hot:", e.message);
    return res.status(500).json({ ok: false, error: "hot_tokens_failed", data: [] });
  }
});

module.exports = router;
