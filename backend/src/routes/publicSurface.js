const express = require("express");
const rateLimit = require("express-rate-limit");
const { getSupabase } = require("../lib/supabase");
const { getFreshnessExportEd25519PublicKeyBytes } = require("../lib/freshnessSignedExport");

const router = express.Router();

const freshnessExportKeyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
});

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
    return res.status(503).json({ ok: false, error: "supabase_unconfigured" });
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
    return res.status(500).json({ ok: false, error: e.message || "public_stats_failed" });
  }
});

/** GET /api/v1/public/freshness-export-verification-key — Ed25519 public key for offline signed export verification (F4.8). */
router.get("/freshness-export-verification-key", freshnessExportKeyLimiter, (_req, res) => {
  const pub = getFreshnessExportEd25519PublicKeyBytes();
  if (!pub) {
    return res.status(404).json({ ok: false, error: "ed25519_not_configured" });
  }
  return res.json({
    ok: true,
    algorithm: "ed25519",
    publicKeyBase64: Buffer.from(pub).toString("base64"),
    publicKeyHex: Buffer.from(pub).toString("hex"),
    message: "Verify detached signature over UTF-8 bytes of document.integrity.proofInput (tweetnacl.sign.detached.verify)."
  });
});

/** GET /api/v1/public/track-record */
router.get("/track-record", async (req, res) => {
  const filter = String(req.query.filter || "all").toLowerCase();
  const supabase = safeSupabase();
  if (!supabase) {
    return res.status(503).json({ ok: false, error: "supabase_unconfigured", rows: [] });
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
    return res.status(503).json({ ok: false, error: "supabase_unconfigured", rows: [] });
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
    return res.status(503).json({ ok: false, error: "supabase_unconfigured", labels: {} });
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
    return res.status(500).json({ ok: false, error: e.message || "wallet_labels_failed", labels: {} });
  }
});

/** GET /api/v1/public/smart-wallets-leaderboard — global ranked wallets (Supabase) */
router.get("/smart-wallets-leaderboard", async (req, res) => {
  const supabase = safeSupabase();
  if (!supabase) {
    return res.status(503).json({ ok: false, error: "supabase_unconfigured", rows: [] });
  }
  try {
    const minWr = Math.min(100, Math.max(0, Number(req.query.minWinRate || 0)));
    const minTrades = Math.min(100000, Math.max(0, Number(req.query.minTrades || 0)));
    const chain = String(req.query.chain || "solana").toLowerCase();
    const pageLimit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));

    let q = supabase.from("smart_wallets").select("*").order("win_rate", { ascending: false }).limit(240);
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
      smartScore: w.smart_score != null ? Number(w.smart_score) : null,
      earlyEntryScore: w.early_entry_score != null ? Number(w.early_entry_score) : null,
      clusterScore: w.cluster_score != null ? Number(w.cluster_score) : null,
      consistencyScore: w.consistency_score != null ? Number(w.consistency_score) : null,
      smartWalletRowUpdatedAt: w.updated_at || null
    }));

    if (minTrades > 0) {
      rows = rows.filter((r) => r.totalTrades >= minTrades);
    }

    if (chain !== "all" && chain !== "solana") {
      rows = [];
    }

    rows = rows.slice(0, pageLimit);

    const wallets = rows.map((r) => r.wallet).filter(Boolean);
    const bestByWallet = new Map();
    const behaviorByWallet = new Map();
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

      const { data: behaviorRows, error: bErr } = await supabase
        .from("wallet_behavior_stats")
        .select(
          "wallet_address, win_rate_real, win_rate_real_5m, win_rate_real_30m, win_rate_real_2h, resolved_signals, resolved_signals_5m, resolved_signals_30m, resolved_signals_2h, avg_size_pre_pump_usd, avg_latency_post_deploy_min, solo_buy_ratio, group_buy_ratio, anticipatory_buy_ratio, breakout_buy_ratio, style_label, computed_at"
        )
        .in("wallet_address", wallets);
      if (!bErr && Array.isArray(behaviorRows)) {
        for (const br of behaviorRows) {
          const key = String(br.wallet_address || "");
          if (!key) continue;
          behaviorByWallet.set(key, br);
        }
      }
    }

    const enriched = rows.map((r) => {
      const bt = bestByWallet.get(r.wallet);
      const wb = behaviorByWallet.get(r.wallet);
      const avg = Math.max(1, r.avgPositionSize);
      const roiMult = r.pnl30d / avg;
      return {
        ...r,
        roi30dVsAvgSize: Number(roiMult.toFixed(2)),
        bestTradePct: bt ? Number(Number(bt.pct).toFixed(2)) : null,
        bestTradeMint: bt?.token || null,
        bestTradeAt: bt?.at || null,
        profile: wb
          ? {
              winRateReal: wb.win_rate_real != null ? Number(wb.win_rate_real) : null,
              winRateReal5m: wb.win_rate_real_5m != null ? Number(wb.win_rate_real_5m) : null,
              winRateReal30m: wb.win_rate_real_30m != null ? Number(wb.win_rate_real_30m) : null,
              winRateReal2h: wb.win_rate_real_2h != null ? Number(wb.win_rate_real_2h) : null,
              resolvedSignals: wb.resolved_signals != null ? Number(wb.resolved_signals) : 0,
              resolvedSignals5m: wb.resolved_signals_5m != null ? Number(wb.resolved_signals_5m) : 0,
              resolvedSignals30m: wb.resolved_signals_30m != null ? Number(wb.resolved_signals_30m) : 0,
              resolvedSignals2h: wb.resolved_signals_2h != null ? Number(wb.resolved_signals_2h) : 0,
              avgSizePrePumpUsd:
                wb.avg_size_pre_pump_usd != null ? Number(wb.avg_size_pre_pump_usd) : null,
              avgLatencyPostDeployMin:
                wb.avg_latency_post_deploy_min != null ? Number(wb.avg_latency_post_deploy_min) : null,
              soloBuyRatio: wb.solo_buy_ratio != null ? Number(wb.solo_buy_ratio) : null,
              groupBuyRatio: wb.group_buy_ratio != null ? Number(wb.group_buy_ratio) : null,
              anticipatoryBuyRatio:
                wb.anticipatory_buy_ratio != null ? Number(wb.anticipatory_buy_ratio) : null,
              breakoutBuyRatio: wb.breakout_buy_ratio != null ? Number(wb.breakout_buy_ratio) : null,
              styleLabel: wb.style_label || null,
              computedAt: wb.computed_at || null
            }
          : null
      };
    });

    return res.json({
      ok: true,
      rows: enriched,
      meta: {
        source: "supabase",
        count: enriched.length,
        limit: pageLimit,
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
    return res.status(503).json({ ok: false, error: "supabase_unconfigured", rows: [] });
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
