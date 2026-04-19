const express = require("express");
const { getSupabase } = require("../lib/supabase");

const router = express.Router();

function safeSupabase() {
  try {
    return getSupabase();
  } catch {
    return null;
  }
}

function pctFromPrices(entry, later) {
  const e = Number(entry);
  const l = Number(later);
  if (!Number.isFinite(e) || e <= 0 || !Number.isFinite(l)) return null;
  return ((l - e) / e) * 100;
}

function statusFromPct(pct) {
  if (pct == null || Number.isNaN(pct)) return "PENDING";
  if (pct > 0) return "WIN";
  if (pct < 0) return "LOSS";
  return "PENDING";
}

/** GET /api/v1/public/stats — onboarding strip */
router.get("/stats", async (_req, res) => {
  const supabase = safeSupabase();
  if (!supabase) {
    return res.json({
      ok: true,
      signalsToday: 0,
      topWalletPct30d: null,
      avgEntryWindowMins: 4,
      source: "unconfigured"
    });
  }
  try {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const { count: signalsToday } = await supabase
      .from("smart_wallet_signals")
      .select("id", { count: "exact", head: true })
      .gte("created_at", start.toISOString());

    const { data: topWallet } = await supabase
      .from("smart_wallets")
      .select("win_rate, pnl_30d")
      .order("win_rate", { ascending: false })
      .limit(1)
      .maybeSingle();

    const win = Number(topWallet?.win_rate || 0);
    return res.json({
      ok: true,
      signalsToday: signalsToday ?? 0,
      topWalletPct30d: Number.isFinite(win) ? win : null,
      avgEntryWindowMins: 4,
      source: "supabase"
    });
  } catch (e) {
    return res.json({
      ok: true,
      signalsToday: 0,
      topWalletPct30d: null,
      avgEntryWindowMins: 4,
      source: "error",
      error: e.message
    });
  }
});

/** GET /api/v1/public/track-record */
router.get("/track-record", async (req, res) => {
  const filter = String(req.query.filter || "all").toLowerCase();
  const supabase = safeSupabase();
  if (!supabase) {
    return res.json({ ok: true, rows: [], winRate7d: null, count7d: 0, meta: { source: "unconfigured" } });
  }
  try {
    let since = null;
    if (filter === "24h" || filter === "day") {
      since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    } else if (filter === "week") {
      since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    }

    let q = supabase
      .from("smart_wallet_signals")
      .select(
        "id, token_address, wallet_address, confidence, created_at, entry_price_usd, price_1h_usd, price_4h_usd, result_pct"
      )
      .order("created_at", { ascending: false })
      .limit(80);

    if (since) q = q.gte("created_at", since);

    const { data: raw, error } = await q;
    if (error) throw error;

    const rows = (raw || []).map((row) => {
      let pct =
        row.result_pct != null ? Number(row.result_pct) : pctFromPrices(row.entry_price_usd, row.price_1h_usd);
      const status = statusFromPct(pct);
      return {
        id: row.id,
        token: row.token_address,
        signalAt: row.created_at,
        entryPrice: row.entry_price_usd != null ? Number(row.entry_price_usd) : null,
        price1h: row.price_1h_usd != null ? Number(row.price_1h_usd) : null,
        price4h: row.price_4h_usd != null ? Number(row.price_4h_usd) : null,
        resultPct: pct,
        status,
        confidence: row.confidence
      };
    });

    const filtered =
      filter === "win"
        ? rows.filter((r) => r.status === "WIN")
        : filter === "loss"
          ? rows.filter((r) => r.status === "LOSS")
          : rows;

    const out = filtered.slice(0, 50);

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: weekRows } = await supabase
      .from("smart_wallet_signals")
      .select("entry_price_usd, price_1h_usd, result_pct")
      .gte("created_at", weekAgo)
      .limit(500);

    let wins = 0;
    let resolved = 0;
    (weekRows || []).forEach((r) => {
      const pct = r.result_pct != null ? Number(r.result_pct) : pctFromPrices(r.entry_price_usd, r.price_1h_usd);
      if (pct == null || Number.isNaN(pct)) return;
      resolved += 1;
      if (pct > 0) wins += 1;
    });
    const winRate7d = resolved ? Math.round((wins / resolved) * 1000) / 10 : null;

    return res.json({
      ok: true,
      rows: out,
      winRate7d,
      count7d: resolved,
      meta: { source: "supabase" }
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message, rows: [] });
  }
});

/** GET /api/v1/public/signals-24h — home history mode */
router.get("/signals-24h", async (_req, res) => {
  const supabase = safeSupabase();
  if (!supabase) {
    return res.json({ ok: true, rows: [] });
  }
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  try {
    const { data: raw, error } = await supabase
      .from("smart_wallet_signals")
      .select(
        "id, token_address, wallet_address, confidence, created_at, entry_price_usd, price_1h_usd, price_4h_usd, result_pct"
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    const rows = (raw || []).map((row) => {
      const pct =
        row.result_pct != null ? Number(row.result_pct) : pctFromPrices(row.entry_price_usd, row.price_1h_usd);
      return {
        id: row.id,
        token: row.token_address,
        signalAt: row.created_at,
        resultPct: pct,
        status: statusFromPct(pct),
        confidence: row.confidence
      };
    });
    return res.json({ ok: true, rows });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message, rows: [] });
  }
});

/** GET /api/v1/public/wallet-labels?addresses=a,b */
router.get("/wallet-labels", async (req, res) => {
  const raw = String(req.query.addresses || "");
  const addresses = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 80);
  if (!addresses.length) return res.json({ ok: true, labels: {} });

  const supabase = safeSupabase();
  const out = {};
  if (!supabase) {
    addresses.forEach((a) => {
      out[a] = { label: `${a.slice(0, 4)}…${a.slice(-4)}`, tooltip: a };
    });
    return res.json({ ok: true, labels: out });
  }

  try {
    const { data: ranks } = await supabase
      .from("smart_wallets")
      .select("wallet_address, win_rate, pnl_30d")
      .order("win_rate", { ascending: false })
      .limit(500);
    const rankMap = new Map();
    (ranks || []).forEach((w, i) => rankMap.set(w.wallet_address, { rank: i + 1, win: Number(w.win_rate || 0), pnl: Number(w.pnl_30d || 0) }));

    const { data: dbLabels } = await supabase.from("wallet_labels").select("address, label, tier").in("address", addresses);
    const labelMap = new Map((dbLabels || []).map((r) => [r.address, r]));

    addresses.forEach((addr) => {
      const row = labelMap.get(addr);
      if (row) {
        const meta = rankMap.get(addr);
        out[addr] = {
          label: row.label,
          tooltip: `${addr} · ${meta ? `WR ${meta.win.toFixed(1)}%` : "unknown"}`
        };
        return;
      }
      const meta = rankMap.get(addr);
      const wr = meta?.win ?? 0;
      const n = meta?.rank ?? 0;
      let label;
      if (wr > 88) label = `🐋 Whale Alpha #${n || "—"}`;
      else if (wr >= 80) label = `⚡ Smart Wallet #${n || "—"}`;
      else if (wr >= 70) label = `👁 Tracked Wallet #${n || "—"}`;
      else label = `${addr.slice(0, 4)}…${addr.slice(-4)}`;
      const pnl = meta?.pnl != null ? ` · 30d $${Math.round(meta.pnl)}` : "";
      out[addr] = {
        label,
        tooltip: `${addr} · WR ${wr.toFixed(1)}%${pnl}`
      };
    });

    return res.json({ ok: true, labels: out });
  } catch (e) {
    addresses.forEach((a) => {
      out[a] = { label: `${a.slice(0, 4)}…${a.slice(-4)}`, tooltip: a };
    });
    return res.json({ ok: true, labels: out, error: e.message });
  }
});

/** GET /api/v1/public/smart-wallets-leaderboard — global ranked wallets (Supabase) */
router.get("/smart-wallets-leaderboard", async (req, res) => {
  const supabase = safeSupabase();
  if (!supabase) {
    return res.json({ ok: true, rows: [], meta: { source: "unconfigured" } });
  }
  try {
    const minWr = Math.min(100, Math.max(0, Number(req.query.minWinRate || 0)));
    const minTrades = Math.min(100000, Math.max(0, Number(req.query.minTrades || 0)));
    const chain = String(req.query.chain || "solana").toLowerCase();

    let q = supabase.from("smart_wallets").select("*").order("win_rate", { ascending: false }).limit(120);
    if (minWr > 0) q = q.gte("win_rate", minWr);
    const { data, error } = await q;
    if (error) throw error;

    let rows = (data || []).map((w) => ({
      wallet: w.wallet_address,
      winRate: Number(w.win_rate || 0),
      pnl30d: Number(w.pnl_30d || 0),
      avgPositionSize: Number(w.avg_position_size || 0),
      recentHits: Number(w.recent_hits || 0),
      totalTrades: Number(w.total_trades || 0),
      lastSeen: w.last_seen,
      smartScore: w.smart_score != null ? Number(w.smart_score) : null
    }));

    if (minTrades > 0) {
      rows = rows.filter((r) => r.totalTrades >= minTrades);
    }

    if (chain !== "all" && chain !== "solana") {
      rows = [];
    }

    rows = rows.slice(0, 20);

    const wallets = rows.map((r) => r.wallet).filter(Boolean);
    const bestByWallet = new Map();
    if (wallets.length) {
      const { data: sigs, error: sErr } = await supabase
        .from("smart_wallet_signals")
        .select("wallet_address, result_pct, token_address, created_at")
        .in("wallet_address", wallets)
        .not("result_pct", "is", null)
        .order("created_at", { ascending: false })
        .limit(1500);
      if (!sErr && sigs?.length) {
        for (const s of sigs) {
          const w = s.wallet_address;
          const pct = Number(s.result_pct);
          if (!w || !Number.isFinite(pct)) continue;
          const prev = bestByWallet.get(w);
          if (!prev || pct > prev.pct) {
            bestByWallet.set(w, { pct, token: s.token_address, at: s.created_at });
          }
        }
      }
    }

    const enriched = rows.map((r) => {
      const bt = bestByWallet.get(r.wallet);
      const avg = Math.max(1, r.avgPositionSize);
      const roiMult = r.pnl30d / avg;
      return {
        ...r,
        roi30dVsAvgSize: Number(roiMult.toFixed(2)),
        bestTradePct: bt ? Number(Number(bt.pct).toFixed(2)) : null,
        bestTradeMint: bt?.token || null,
        bestTradeAt: bt?.at || null
      };
    });

    return res.json({
      ok: true,
      rows: enriched,
      meta: {
        source: "supabase",
        count: enriched.length,
        chain: chain === "all" ? "all" : "solana",
        filters: { minWinRate: minWr, minTrades }
      }
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message, rows: [] });
  }
});

/** GET /api/v1/public/smart-money-activity — latest smart-wallet touches */
router.get("/smart-money-activity", async (req, res) => {
  const supabase = safeSupabase();
  if (!supabase) {
    return res.json({ ok: true, rows: [], meta: { source: "unconfigured" } });
  }
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 48)));
  try {
    let sel = "wallet_address, token_address, last_action, confidence, created_at, result_pct";
    let { data, error } = await supabase
      .from("smart_wallet_signals")
      .select(sel)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error && /result_pct|column|schema/i.test(error.message)) {
      sel = "wallet_address, token_address, last_action, confidence, created_at";
      ({ data, error } = await supabase
        .from("smart_wallet_signals")
        .select(sel)
        .order("created_at", { ascending: false })
        .limit(limit));
    }
    if (error) throw error;
    const rows = (data || []).map((r) => ({
      wallet: r.wallet_address,
      token: r.token_address,
      side: r.last_action,
      confidence: Number(r.confidence || 0),
      createdAt: r.created_at,
      resultPct: r.result_pct != null ? Number(r.result_pct) : null
    }));
    return res.json({ ok: true, rows, meta: { source: "supabase", count: rows.length } });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message, rows: [] });
  }
});

module.exports = router;
