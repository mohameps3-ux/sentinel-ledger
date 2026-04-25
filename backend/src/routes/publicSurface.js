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

function trackResultFromOutcome(outcome60m) {
  const n = Number(outcome60m);
  if (!Number.isFinite(n)) return "PENDING";
  return n > 0.05 ? "WIN" : "LOSS";
}

function actionFromOracle(row = {}) {
  const confidence = Number(row.rule_snapshot?.confidence ?? 0);
  if (confidence >= 0.75) return "ACCUMULATE";
  if (confidence >= 0.45) return "WATCH";
  return "AVOID";
}

function formatRuleRow(row = {}) {
  const total = Number(row.total_signals || 0);
  const wins = Number(row.success_count_60m || 0);
  const regimePerformance = row.regime_performance && typeof row.regime_performance === "object" ? row.regime_performance : {};
  const regimes = Object.entries(regimePerformance)
    .filter(([, v]) => Number(v?.total || 0) > 0)
    .sort((a, b) => Number(b[1]?.confidence || 0) - Number(a[1]?.confidence || 0));
  return {
    rule: row.rule_id,
    signals: total,
    winRate: total ? wins / total : null,
    avgReturn: row.avg_return_60m != null ? Number(row.avg_return_60m) : null,
    maxDrawdown: row.max_drawdown != null ? Number(row.max_drawdown) : null,
    regime: regimes[0] ? `${regimes[0][0]} ${(Number(regimes[0][1]?.confidence || 0) * 100).toFixed(0)}%` : "—",
    confidence: Number(row.confidence_score || 0),
    hasSample: total >= 10
  };
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

/** GET /api/v1/public/track-record — Validation Oracle public ledger. */
router.get("/track-record", async (req, res) => {
  const filter = String(req.query.filter || "all").toLowerCase();
  const supabase = safeSupabase();
  if (!supabase) {
    return res.status(503).json({ ok: false, error: "supabase_unconfigured", rows: [] });
  }
  try {
    const limit = Math.max(20, Math.min(200, Number(req.query.limit || 80)));
    const [rulesRes, outcomesRes, countRes, resolvedStatsRes] = await Promise.all([
      supabase.from("rule_performance").select("*").order("confidence_score", { ascending: false, nullsFirst: false }).limit(100),
      supabase
        .from("signal_outcomes")
        .select(
          "id,signal_id,mint,rule_id,price_at_signal,wallets_involved,regime,price_5m,price_15m,price_60m,outcome_5m,outcome_15m,outcome_60m,validated,rule_snapshot,min_price_observed,validated_at,created_at"
        )
        .order("created_at", { ascending: false })
        .limit(limit),
      supabase.from("signal_outcomes").select("id", { count: "exact", head: true }),
      supabase
        .from("signal_outcomes")
        .select("id,mint,outcome_60m,created_at,rule_id,rule_snapshot")
        .not("outcome_60m", "is", null)
        .order("created_at", { ascending: false })
        .limit(5000)
    ]);
    if (rulesRes.error) throw rulesRes.error;
    if (outcomesRes.error) throw outcomesRes.error;
    if (countRes.error) throw countRes.error;
    if (resolvedStatsRes.error) throw resolvedStatsRes.error;

    const rawOutcomes = outcomesRes.data || [];
    const mints = [...new Set(rawOutcomes.map((r) => r.mint).filter(Boolean))].slice(0, 200);
    const signalIds = rawOutcomes
      .map((r) => String(r.signal_id || ""))
      .filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
      .slice(0, 200);
    const [snapshotsRes, signalsRes] = await Promise.all([
      mints.length
        ? supabase.from("market_snapshots").select("mint,symbol,name").in("mint", mints)
        : Promise.resolve({ data: [], error: null }),
      signalIds.length
        ? supabase.from("smart_wallet_signals").select("id,token_address,last_action,confidence,created_at").in("id", signalIds)
        : Promise.resolve({ data: [], error: null })
    ]);
    const snapshotByMint = new Map((snapshotsRes.data || []).map((r) => [r.mint, r]));
    const signalById = new Map((signalsRes.data || []).map((r) => [String(r.id), r]));

    const rows = rawOutcomes.map((row) => {
      const signal = signalById.get(String(row.signal_id || ""));
      const snap = snapshotByMint.get(row.mint);
      return {
        id: row.id,
        signalId: row.signal_id,
        timestamp: row.created_at,
        token: row.mint,
        symbol: snap?.symbol || row.rule_snapshot?.symbol || (row.mint ? `${row.mint.slice(0, 4)}…${row.mint.slice(-4)}` : "—"),
        rule: row.rule_id,
        regime: row.regime,
        signalStrength: Number(row.rule_snapshot?.confidence ?? signal?.confidence ?? 0),
        suggestedAction: actionFromOracle(row),
        outcome5m: row.outcome_5m != null ? Number(row.outcome_5m) : null,
        outcome15m: row.outcome_15m != null ? Number(row.outcome_15m) : null,
        outcome60m: row.outcome_60m != null ? Number(row.outcome_60m) : null,
        result: trackResultFromOutcome(row.outcome_60m),
        validated: Boolean(row.validated),
        walletsInvolved: Number(row.wallets_involved || 0),
        minPriceObserved: row.min_price_observed != null ? Number(row.min_price_observed) : null
      };
    });
    const filtered =
      filter === "wins" || filter === "win"
        ? rows.filter((r) => r.result === "WIN")
        : filter === "losses" || filter === "loss"
          ? rows.filter((r) => r.result === "LOSS")
          : filter === "pending"
            ? rows.filter((r) => r.result === "PENDING")
            : rows;

    const resolvedStatsRows = resolvedStatsRes.data || [];
    const resolvedStats = resolvedStatsRows.map((r) => ({
      id: r.id,
      token: r.mint,
      symbol: r.rule_snapshot?.symbol || (r.mint ? `${r.mint.slice(0, 4)}…${r.mint.slice(-4)}` : "—"),
      rule: r.rule_id,
      timestamp: r.created_at,
      suggestedAction: actionFromOracle(r),
      outcome60m: Number(r.outcome_60m),
      result: trackResultFromOutcome(r.outcome_60m)
    }));
    const wins = resolvedStats.filter((r) => r.result === "WIN");
    const returns = resolvedStats.map((r) => Number(r.outcome60m)).filter(Number.isFinite);
    const bestCalls = resolvedStats.slice().sort((a, b) => Number(b.outcome60m || 0) - Number(a.outcome60m || 0)).slice(0, 5);
    const worstCalls = resolvedStats.slice().sort((a, b) => Number(a.outcome60m || 0) - Number(b.outcome60m || 0)).slice(0, 3);
    const ruleRows = (rulesRes.data || []).map(formatRuleRow).sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0));
    const totalRuleSignals = (rulesRes.data || []).reduce((sum, r) => sum + Number(r.total_signals || 0), 0);
    const totalRuleWins = (rulesRes.data || []).reduce((sum, r) => sum + Number(r.success_count_60m || 0), 0);
    const rulesWithSample = ruleRows.filter((r) => r.hasSample);
    const winReturns = resolvedStats.filter((r) => r.result === "WIN").map((r) => Number(r.outcome60m)).filter(Number.isFinite);
    const drawdowns = ruleRows.map((r) => Number(r.maxDrawdown)).filter(Number.isFinite);

    return res.json({
      ok: true,
      stats: {
        totalSignals: Math.max(Number(countRes.count || 0), totalRuleSignals),
        resolvedSignals: resolvedStats.length,
        winRate: resolvedStats.length ? wins.length / resolvedStats.length : null,
        avgReturn: returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : null,
        bestCall: bestCalls[0] || null,
        worstCall: worstCalls[0] || null
      },
      summary:
        rulesWithSample.length && totalRuleSignals >= 10
          ? {
              winRate60m: totalRuleSignals ? totalRuleWins / totalRuleSignals : null,
              avgReturnOnWins: winReturns.length ? winReturns.reduce((a, b) => a + b, 0) / winReturns.length : null,
              maxDrawdown: drawdowns.length ? Math.max(...drawdowns) : null,
              sampleSize: totalRuleSignals
            }
          : null,
      rules: ruleRows,
      rows: filtered,
      bestCalls,
      worstCalls,
      meta: {
        source: "supabase:validation_oracle",
        filter,
        count: filtered.length,
        totalRows: rows.length,
        hasOracleData: Boolean(rawOutcomes.length || ruleRows.length)
      }
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
