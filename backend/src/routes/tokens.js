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
    return res.json({
      ok: true,
      data: [],
      meta: {
        source: "route_fallback",
        degraded: true,
        fallbackReason: "route_exception",
        count: 0
      }
    });
  }
});

module.exports = router;
