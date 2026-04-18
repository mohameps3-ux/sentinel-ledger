const express = require("express");
const { getSupabase } = require("../lib/supabase");
const publicTerminalLimiter = require("../middleware/publicTerminalLimiter");
const {
  getLatestSignalsFeedCached,
  getOutcomesProofCached
} = require("../services/homeTerminalApi");
const { pctFromPrices } = require("../services/smartWalletSignalPrices");

const router = express.Router();

router.use(publicTerminalLimiter);

function safeSupabase() {
  try {
    return getSupabase();
  } catch {
    return null;
  }
}

function statusFromPct(pct) {
  if (pct == null || Number.isNaN(pct)) return "PENDING";
  if (pct > 0) return "WIN";
  if (pct < 0) return "LOSS";
  return "PENDING";
}

/**
 * GET /api/v1/signals/outcomes
 * Proof of Edge — rows with result_pct set (price worker). Redis TTL ~3m.
 * Flat shape: wins, losses, avgWin, avgLoss, netReturn, recentOutcomes (+ legacy summary/recent).
 */
router.get("/outcomes", async (req, res) => {
  const hoursRaw = Number(req.query.hours || 168);
  const hours = Math.min(168, Math.max(24, Number.isFinite(hoursRaw) ? Math.floor(hoursRaw) : 168));
  const recentN = Math.min(25, Math.max(1, Number(req.query.recent) || 10));
  const supabase = safeSupabase();
  try {
    const body = await getOutcomesProofCached(supabase, hours, recentN);
    return res.json(body);
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: e.message,
      wins: 0,
      losses: 0,
      avgWin: null,
      avgLoss: null,
      netReturn: null,
      recentOutcomes: []
    });
  }
});

/**
 * GET /api/v1/signals/latest
 * Decision feed cards — one row per token (latest signal). Redis TTL ~3m.
 * Query: limit (default 10), strategy=balanced|conservative|aggressive
 */
router.get("/latest", async (req, res) => {
  const lim = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  const strategy = ["conservative", "aggressive", "balanced"].includes(String(req.query.strategy))
    ? String(req.query.strategy)
    : "balanced";
  const supabase = safeSupabase();
  try {
    const body = await getLatestSignalsFeedCached(supabase, lim, strategy);
    if (String(req.query.format || "").toLowerCase() === "array") {
      return res.json(Array.isArray(body.data) ? body.data : []);
    }
    return res.json(body);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message, data: [] });
  }
});

/**
 * GET /api/v1/signals/history — flat rows for “24H HISTORY” UI (mint + status + pct).
 */
router.get("/history", async (req, res) => {
  const lim = Math.min(80, Math.max(1, Number(req.query.limit) || 30));
  const supabase = safeSupabase();
  if (!supabase) {
    return res.json({ ok: true, rows: [], meta: { source: "unconfigured" } });
  }
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: raw, error } = await supabase
      .from("smart_wallet_signals")
      .select(
        "id, token_address, wallet_address, confidence, created_at, entry_price_usd, price_1h_usd, price_4h_usd, result_pct"
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(lim);
    if (error) throw error;
    const rows = (raw || []).map((row) => {
      const pct =
        row.result_pct != null ? Number(row.result_pct) : pctFromPrices(row.entry_price_usd, row.price_1h_usd);
      return {
        id: row.id,
        token: row.token_address,
        wallet: row.wallet_address,
        signalAt: row.created_at,
        resultPct: pct,
        status: statusFromPct(pct),
        confidence: row.confidence
      };
    });
    return res.json({ ok: true, rows, meta: { source: "supabase", count: rows.length } });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message, rows: [] });
  }
});

module.exports = router;
