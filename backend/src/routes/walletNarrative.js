const express = require("express");
const rateLimit = require("express-rate-limit");
const { isProbableSolanaPubkey } = require("../lib/solanaAddress");
const { getWalletNarrative } = require("../services/walletNarrative");
const {
  getWalletBehaviorSummary,
  getWalletBehaviorTokenFeatures
} = require("../services/walletBehaviorMemory");
const { getSupabase } = require("../lib/supabase");

const router = express.Router();

const walletNarrativeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 45,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "rate_limit_exceeded" }
});

function safeSupabase() {
  try {
    return getSupabase();
  } catch {
    return null;
  }
}

router.get("/:address/summary", walletNarrativeLimiter, async (req, res) => {
  try {
    const address = String(req.params.address || "").trim();
    if (!isProbableSolanaPubkey(address)) {
      return res.status(400).json({ ok: false, error: "invalid_address" });
    }
    const supabase = safeSupabase();
    if (!supabase) {
      return res.json({ ok: true, data: null, meta: { source: "unconfigured" } });
    }

    const { data: walletRow, error } = await supabase
      .from("smart_wallets")
      .select(
        "wallet_address, win_rate, pnl_30d, avg_position_size, recent_hits, total_trades, last_seen, smart_score, created_at"
      )
      .eq("wallet_address", address)
      .maybeSingle();
    if (error) throw error;
    if (!walletRow) return res.status(404).json({ ok: false, error: "wallet_not_found" });

    const { data: bestTradeRows } = await supabase
      .from("smart_wallet_signals")
      .select("token_address, result_pct, created_at")
      .eq("wallet_address", address)
      .not("result_pct", "is", null)
      .order("result_pct", { ascending: false })
      .limit(1);
    const best = Array.isArray(bestTradeRows) && bestTradeRows.length ? bestTradeRows[0] : null;

    return res.json({
      ok: true,
      data: {
        wallet: walletRow.wallet_address,
        winRate: Number(walletRow.win_rate || 0),
        pnl30d: Number(walletRow.pnl_30d || 0),
        avgPositionSize: Number(walletRow.avg_position_size || 0),
        recentHits: Number(walletRow.recent_hits || 0),
        totalTrades: Number(walletRow.total_trades || 0),
        lastSeen: walletRow.last_seen || null,
        smartScore: walletRow.smart_score != null ? Number(walletRow.smart_score) : null,
        createdAt: walletRow.created_at || null,
        bestTradePct: best?.result_pct != null ? Number(best.result_pct) : null,
        bestTradeMint: best?.token_address || null,
        bestTradeAt: best?.created_at || null
      },
      meta: { source: "supabase" }
    });
  } catch (error) {
    console.error("wallet summary route:", error.message);
    return res.status(500).json({ ok: false, error: "wallet_summary_failed" });
  }
});

router.get("/:address/narrative", walletNarrativeLimiter, async (req, res) => {
  try {
    const address = String(req.params.address || "").trim();
    if (!isProbableSolanaPubkey(address)) {
      return res.status(400).json({ ok: false, error: "invalid_address" });
    }
    const lang = String(req.query.lang || "es").toLowerCase();
    const payload = await getWalletNarrative(address, { lang });
    if (!payload) {
      return res.status(404).json({ ok: false, error: "wallet_not_found" });
    }
    return res.json(payload);
  } catch (error) {
    console.error("wallet narrative route:", error.message);
    return res.status(500).json({ ok: false, error: "wallet_narrative_failed" });
  }
});

router.get("/:address/behavior", walletNarrativeLimiter, async (req, res) => {
  try {
    const address = String(req.params.address || "").trim();
    if (!isProbableSolanaPubkey(address)) {
      return res.status(400).json({ ok: false, error: "invalid_address" });
    }
    const out = await getWalletBehaviorSummary(address);
    if (!out.ok) return res.status(503).json({ ok: false, error: out.reason || "wallet_behavior_unavailable" });
    if (!out.data) return res.status(404).json({ ok: false, error: "wallet_behavior_not_found" });
    return res.json({ ok: true, data: out.data });
  } catch (error) {
    console.error("wallet behavior route:", error.message);
    return res.status(500).json({ ok: false, error: "wallet_behavior_failed" });
  }
});

router.get("/:address/behavior/tokens", walletNarrativeLimiter, async (req, res) => {
  try {
    const address = String(req.params.address || "").trim();
    if (!isProbableSolanaPubkey(address)) {
      return res.status(400).json({ ok: false, error: "invalid_address" });
    }
    const limit = Math.min(500, Math.max(1, Number(req.query.limit || 100)));
    const out = await getWalletBehaviorTokenFeatures(address, limit);
    if (!out.ok) return res.status(503).json({ ok: false, error: out.reason || "wallet_behavior_unavailable" });
    return res.json({ ok: true, data: out.rows || [] });
  } catch (error) {
    console.error("wallet behavior tokens route:", error.message);
    return res.status(500).json({ ok: false, error: "wallet_behavior_tokens_failed" });
  }
});

module.exports = router;

