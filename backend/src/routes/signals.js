const express = require("express");
const { getSupabase } = require("../lib/supabase");
const publicTerminalLimiter = require("../middleware/publicTerminalLimiter");
const {
  getLatestSignalsFeedCached,
  getOutcomesProofCached,
  capSignalsLatestLimit
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

function actionFromConfidence(confidence) {
  const c = Number(confidence || 0);
  if (c >= 80) return "ACCUMULATE";
  if (c >= 60) return "WATCH";
  return "TOO_LATE";
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
    const code = /unconfigured/i.test(String(e?.message || "")) ? 503 : 500;
    return res.status(code).json({ ok: false, error: e?.message || "signals_outcomes_failed" });
  }
});

/**
 * GET /api/v1/signals/latest
 * Decision feed cards — one row per token (latest signal). Redis TTL ~3m.
 * Query: limit (default 10), strategy=balanced|conservative|aggressive
 */
router.get("/latest", async (req, res) => {
  const lim = capSignalsLatestLimit(Number(req.query.limit) || 10);
  const strategy = ["conservative", "aggressive", "balanced"].includes(String(req.query.strategy))
    ? String(req.query.strategy)
    : "balanced";
  const tokenFilter = String(req.query.token || "").trim().toUpperCase();
  const supabase = safeSupabase();
  try {
    const body = await getLatestSignalsFeedCached(supabase, tokenFilter ? capSignalsLatestLimit(50) : lim, strategy);
    let payload = body;
    if (tokenFilter) {
      const filtered = (Array.isArray(body?.data) ? body.data : []).filter((row) => {
        const token = String(row?.token || "").replace("$", "").toUpperCase();
        const mint = String(row?.tokenAddress || "").toUpperCase();
        return token === tokenFilter || mint === tokenFilter;
      });
      payload = {
        ...body,
        data: filtered,
        meta: { ...(body.meta || {}), filteredBy: tokenFilter, count: filtered.length }
      };
    }
    if (String(req.query.format || "").toLowerCase() === "array") {
      return res.json(Array.isArray(payload.data) ? payload.data : []);
    }
    return res.json(payload);
  } catch (e) {
    const code = /unconfigured/i.test(String(e?.message || "")) ? 503 : 500;
    return res.status(code).json({
      ok: false,
      error: e?.message || "signals_latest_failed",
      data: [],
      meta: { source: "strict_real_error", degraded: true, count: 0 }
    });
  }
});

/**
 * GET /api/v1/signals/history — flat rows for “24H HISTORY” UI (mint + status + pct).
 */
router.get("/history", async (req, res) => {
  const lim = Math.min(80, Math.max(1, Number(req.query.limit) || 30));
  const supabase = safeSupabase();
  if (!supabase) {
    return res.status(503).json({ ok: false, error: "supabase_unconfigured", rows: [] });
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

router.get("/graveyard", async (req, res) => {
  const supabase = safeSupabase();
  if (!supabase) return res.status(503).json({ ok: false, error: "supabase_unconfigured", rows: [] });
  try {
    const from = req.query.from ? new Date(String(req.query.from)).toISOString() : null;
    const to = req.query.to ? new Date(String(req.query.to)).toISOString() : null;
    const outcome = String(req.query.outcome || "all").toUpperCase();
    const lim = Math.min(300, Math.max(10, Number(req.query.limit) || 120));

    let q = supabase
      .from("smart_wallet_signals")
      .select(
        "id, token_address, confidence, created_at, entry_price_usd, price_4h_usd, result_pct, wallet_address"
      )
      .order("created_at", { ascending: false })
      .limit(lim);
    if (from) q = q.gte("created_at", from);
    if (to) q = q.lte("created_at", to);
    const { data, error } = await q;
    if (error) throw error;

    let rows = (data || []).map((row) => {
      const result4h = pctFromPrices(row.entry_price_usd, row.price_4h_usd);
      const result24h = row.result_pct != null ? Number(row.result_pct) : null;
      const finalPct = result24h != null ? result24h : result4h;
      return {
        id: row.id,
        token: row.token_address,
        signalStrength: Number(row.confidence || 0),
        suggestedAction: actionFromConfidence(row.confidence),
        actualResult4h: result4h,
        actualResult24h: result24h,
        outcome: statusFromPct(finalPct),
        createdAt: row.created_at,
        wallet: row.wallet_address
      };
    });
    if (outcome !== "ALL") rows = rows.filter((r) => r.outcome === outcome);
    const wins = rows.filter((r) => r.outcome === "WIN").length;
    const losses = rows.filter((r) => r.outcome === "LOSS").length;
    const resolved = wins + losses;
    const winRate = resolved ? Number(((wins / resolved) * 100).toFixed(2)) : 0;
    return res.json({
      ok: true,
      rows,
      meta: { count: rows.length, wins, losses, winRate, resolved, from, to, outcome }
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, rows: [] });
  }
});

module.exports = router;
