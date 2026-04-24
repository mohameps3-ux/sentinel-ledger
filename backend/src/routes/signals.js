const express = require("express");
const { getSupabase } = require("../lib/supabase");
const publicTerminalLimiter = require("../middleware/publicTerminalLimiter");
const {
  getLatestSignalsFeedCached,
  getOutcomesProofCached,
  capSignalsLatestLimit
} = require("../services/homeTerminalApi");
const { pctFromPrices } = require("../services/smartWalletSignalPrices");
const { buildDeskProofOfEdge } = require("../services/deskProofOfEdge");
const { isMissingColumnError } = require("../lib/columnMissingError");
const { isProbableSolanaPubkey } = require("../lib/solanaAddress");

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
 * When the price job has min/max for the post-entry window, those DEX spot samples
 * (not full CLOB OHLC) drive run-up and drawdown; otherwise use sparse checkpoints.
 */
function extremaPctForGraveyard(row) {
  const entry = Number(row.entry_price_usd);
  if (!Number.isFinite(entry) || entry <= 0) {
    return { maxRunUpPct: null, maxDrawdownPct: null, extremaSource: "no_entry" };
  }
  const wMin = row.min_price_window_usd != null ? Number(row.min_price_window_usd) : null;
  const wMax = row.max_price_window_usd != null ? Number(row.max_price_window_usd) : null;
  if (Number.isFinite(wMin) && wMin > 0 && Number.isFinite(wMax) && wMax > 0) {
    return {
      maxRunUpPct: Number((((wMax - entry) / entry) * 100).toFixed(4)),
      maxDrawdownPct: Number((((wMin - entry) / entry) * 100).toFixed(4)),
      extremaSource: "window"
    };
  }
  return extremaPctFromCheckpoints(row);
}

/**
 * Min/max from sparse job checkpoints (5m/30m/1h/2h/4h) + implied 24h from result_pct.
 * Not full intraday OHLC — if checkpoints are missing, extrema may be null.
 */
function extremaPctFromCheckpoints(row) {
  const entry = Number(row.entry_price_usd);
  if (!Number.isFinite(entry) || entry <= 0) {
    return { maxRunUpPct: null, maxDrawdownPct: null, extremaSource: "no_entry" };
  }
  const cps = [
    row.price_5m_usd,
    row.price_30m_usd,
    row.price_1h_usd,
    row.price_2h_usd,
    row.price_4h_usd
  ];
  const rp = row.result_pct != null ? Number(row.result_pct) : null;
  let p24 = null;
  if (Number.isFinite(rp)) {
    p24 = entry * (1 + rp / 100);
  }
  const prices = [entry];
  for (const x of cps) {
    const v = x != null ? Number(x) : null;
    if (Number.isFinite(v) && v > 0) prices.push(v);
  }
  if (p24 != null && Number.isFinite(p24) && p24 > 0) {
    prices.push(p24);
  }
  if (prices.length < 2) {
    return { maxRunUpPct: null, maxDrawdownPct: null, extremaSource: "insufficient" };
  }
  const maxP = Math.max(...prices);
  const minP = Math.min(...prices);
  return {
    maxRunUpPct: Number((((maxP - entry) / entry) * 100).toFixed(4)),
    maxDrawdownPct: Number((((minP - entry) / entry) * 100).toFixed(4)),
    extremaSource: "checkpoints"
  };
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
 * GET /api/v1/signals/desk-proof-of-edge
 * Cohort stats from resolved `signal_performance` (confidence band, optional regime, excludes current mint).
 */
router.get("/desk-proof-of-edge", async (req, res) => {
  const supabase = safeSupabase();
  if (!supabase) {
    return res.status(503).json({ ok: false, error: "supabase_unconfigured" });
  }
  const mintRaw = String(req.query.mint || "").trim();
  const mint = isProbableSolanaPubkey(mintRaw) ? mintRaw : "";
  const confRaw = Number(req.query.confidence);
  const confidence = Number.isFinite(confRaw) ? Math.max(0, Math.min(100, confRaw)) : null;
  const regime = String(req.query.regime || "").trim().slice(0, 48) || null;
  try {
    const body = await buildDeskProofOfEdge(supabase, { mint: mint || null, confidence, regime });
    return res.json(body);
  } catch (e) {
    const code = /unconfigured/i.test(String(e?.message || "")) ? 503 : 500;
    return res.status(code).json({ ok: false, error: e?.message || "desk_proof_of_edge_failed" });
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

const GRAVEYARD_SELECT_NO_EXTREMA =
  "id, token_address, confidence, created_at, entry_price_usd, " +
  "price_5m_usd, price_30m_usd, price_1h_usd, price_2h_usd, price_4h_usd, result_pct, wallet_address";
const GRAVEYARD_SELECT_WITH_EXTREMA =
  "id, token_address, confidence, created_at, entry_price_usd, " +
  "min_price_window_usd, max_price_window_usd, " +
  "price_5m_usd, price_30m_usd, price_1h_usd, price_2h_usd, price_4h_usd, result_pct, wallet_address";

router.get("/graveyard", async (req, res) => {
  const supabase = safeSupabase();
  if (!supabase) return res.status(503).json({ ok: false, error: "supabase_unconfigured", rows: [] });
  try {
    const from = req.query.from ? new Date(String(req.query.from)).toISOString() : null;
    const to = req.query.to ? new Date(String(req.query.to)).toISOString() : null;
    const outcome = String(req.query.outcome || "all").toUpperCase();
    const lim = Math.min(300, Math.max(10, Number(req.query.limit) || 120));

    async function runQ(selectList) {
      let q = supabase
        .from("smart_wallet_signals")
        .select(selectList)
        .order("created_at", { ascending: false })
        .limit(lim);
      if (from) q = q.gte("created_at", from);
      if (to) q = q.lte("created_at", to);
      return q;
    }

    let extremaColumns = true;
    let { data, error } = await runQ(GRAVEYARD_SELECT_WITH_EXTREMA);
    if (error && isMissingColumnError(error, "min_price_window_usd")) {
      extremaColumns = false;
      ({ data, error } = await runQ(GRAVEYARD_SELECT_NO_EXTREMA));
    }
    if (error) throw error;

    let rows = (data || []).map((row) => {
      const result4h = pctFromPrices(row.entry_price_usd, row.price_4h_usd);
      const result24h = row.result_pct != null ? Number(row.result_pct) : null;
      const finalPct = result24h != null ? result24h : result4h;
      const extrema = extremaPctForGraveyard(row);
      return {
        id: row.id,
        token: row.token_address,
        signalStrength: Number(row.confidence || 0),
        suggestedAction: actionFromConfidence(row.confidence),
        actualResult4h: result4h,
        actualResult24h: result24h,
        maxRunUpPct: extrema.maxRunUpPct,
        maxDrawdownPct: extrema.maxDrawdownPct,
        extremaSource: extrema.extremaSource,
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
      meta: {
        extremaColumns,
        count: rows.length,
        wins,
        losses,
        winRate,
        resolved,
        from,
        to,
        outcome,
        extremaNote: extremaColumns
          ? "maxRunUp/maxDrawdown prefer min/max of DEX spot seen while the worker tracks ~25h after the signal; otherwise checkpoint prices and implied 24h from result_pct. Not full candle OHLC."
          : "Window extrema columns not in DB yet (apply migration 016). maxRunUp/maxDrawdown use checkpoint prices and implied 24h from result_pct only."
      }
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, rows: [] });
  }
});

module.exports = router;
