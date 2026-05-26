const express = require("express");
const rateLimit = require("express-rate-limit");
const { getSupabase } = require("../lib/supabase");
const { getFreshnessExportEd25519PublicKeyBytes } = require("../lib/freshnessSignedExport");
const redis = require("../lib/cache");
const { getWalletBehaviorTop } = require("../services/walletBehaviorMemory");
const {
  computeReputationScore,
  rankingScoreFromReputation,
  displayWinRate
} = require("../services/walletReputation");

/** Product win threshold — outcome_pct is in percent points (1 = +1%). */
const SIGNAL_PERF_SUCCESS_MIN_PCT = Number(process.env.SIGNAL_PERF_SUCCESS_MIN_PCT || 1);

function setPublicCache60s(res) {
  res.set("Cache-Control", "public, max-age=60");
}

function clampPublicDays(raw, fallback = 30, max = 90) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(n)));
}

function signalTypeFromPerformanceRow(row) {
  const sigs = Array.isArray(row?.signals) ? row.signals : [];
  return String(sigs[0] || row?.signal_type || "unknown");
}

function unifiedScoreFromPerformanceRow(row) {
  const u = Number(row?.emission_gate?.unifiedScore);
  return Number.isFinite(u) ? Number(u.toFixed(4)) : null;
}

const router = express.Router();

const PUBLIC_STATS_CACHE_KEY = "public:sentinel:stats:v3";

function publicStatsCacheSeconds() {
  const n = Number(process.env.PUBLIC_STATS_CACHE_SECONDS);
  if (!Number.isFinite(n)) return 30;
  return Math.min(120, Math.max(10, Math.floor(n)));
}

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

function utcDayStartIso() {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  return start.toISOString();
}

/** Live emissions land in signal_performance; smart_wallet_signals may lag (backfill/convergence). */
async function countSignalsTodayPrimary(supabase) {
  const since = utcDayStartIso();
  const { count: perfCount, error: perfErr } = await supabase
    .from("signal_performance")
    .select("id", { count: "exact", head: true })
    .gte("emitted_at", since);
  if (!perfErr && perfCount != null) {
    return { count: perfCount, source: "signal_performance" };
  }
  const { count: legacyCount, error: legacyErr } = await supabase
    .from("smart_wallet_signals")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);
  if (legacyErr) throw legacyErr;
  return { count: legacyCount ?? 0, source: "smart_wallet_signals" };
}

/**
 * Wallets with live on-chain touches (Helius webhook upserts wallet_tokens.bought_at).
 * smart_wallet_signals is stale for activity; last_seen on smart_wallets only updates on gated signals.
 */
async function countActiveWalletsPrimary(supabase) {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const seen = new Set();
  const pageSize = 5000;
  const maxPages = 20;
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("wallet_tokens")
      .select("wallet_address")
      .gte("bought_at", since24h)
      .range(from, to);
    if (error) break;
    if (!Array.isArray(data) || data.length === 0) break;
    for (const row of data) {
      const w = String(row.wallet_address || "").trim();
      if (w) seen.add(w);
    }
    if (data.length < pageSize) break;
  }
  if (seen.size > 0) {
    return { count: seen.size, source: "wallet_tokens:24h" };
  }

  const { count: lastSeenCount, error: lsErr } = await supabase
    .from("smart_wallets")
    .select("wallet_address", { count: "exact", head: true })
    .gte("last_seen", since24h);
  if (!lsErr && lastSeenCount != null && lastSeenCount > 0) {
    return { count: lastSeenCount, source: "smart_wallets:last_seen_24h" };
  }

  const { count: totalCount, error: totalErr } = await supabase
    .from("smart_wallets")
    .select("wallet_address", { count: "exact", head: true });
  if (!totalErr && totalCount != null && totalCount > 0) {
    return { count: totalCount, source: "smart_wallets:total" };
  }

  return { count: 0, source: "none" };
}

function mapPerfRowToSmartMoneyActivity(row) {
  const sigs = Array.isArray(row.signals) ? row.signals : [];
  const side = sigs.some((s) => /sell/i.test(String(s))) ? "sell" : "buy";
  return {
    wallet: null,
    token: row.asset,
    side,
    confidence: Number(row.confidence || 0),
    createdAt: row.emitted_at,
    resultPct: row.outcome_pct != null ? Number(row.outcome_pct) : null
  };
}

/**
 * Implied wins/losses ratio from aggregate win-rate % and trade count.
 * Matches the Smart Money UI fallback — not brokerage gross-profit factor.
 */
function approxProfitFactorFromWinRate(totalTrades, winRatePct) {
  const tt = Number(totalTrades || 0);
  const wr = Number(winRatePct || 0);
  if (!Number.isFinite(tt) || tt <= 0 || !Number.isFinite(wr)) return null;
  const wins = Math.round(tt * (wr / 100));
  const losses = Math.max(0, tt - wins);
  if (losses <= 0) return null;
  return Math.round((wins / losses) * 1000) / 1000;
}

/** Full-day inactivity from a single timestamp (leaderboard ranking only; does not touch stored scores). */
function daysInactiveFromAnchor(iso) {
  if (iso == null || String(iso).trim() === "") return null;
  const t = Date.parse(String(iso));
  if (!Number.isFinite(t)) return null;
  return (Date.now() - t) / 86_400_000;
}

/** Smart Money leaderboard: max age of last_seen (days). 0 = filter disabled. */
function leaderboardMaxStaleDays() {
  const raw = Number(process.env.LEADERBOARD_MAX_STALE_DAYS ?? 14);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.min(3650, Math.floor(raw));
}

function isLeaderboardFresh(lastSeenIso, maxStaleDays) {
  if (maxStaleDays <= 0) return true;
  if (lastSeenIso == null || String(lastSeenIso).trim() === "") return false;
  const t = Date.parse(String(lastSeenIso));
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= maxStaleDays * 86_400_000;
}

/** Fresh if ANY anchor (last_seen, on-chain buy, behavior computed_at) is within window. */
function isLeaderboardFreshWithAnchors({ lastSeenIso, onchainIso, behaviorComputedAt }, maxStaleDays) {
  if (maxStaleDays <= 0) return true;
  const anchors = [lastSeenIso, onchainIso, behaviorComputedAt].filter(Boolean);
  if (!anchors.length) return false;
  const cutoff = Date.now() - maxStaleDays * 86_400_000;
  return anchors.some((iso) => {
    const t = Date.parse(String(iso));
    return Number.isFinite(t) && t >= cutoff;
  });
}

function mapSmartWalletRow(w) {
  return {
    wallet: w.wallet_address,
    winRate: Number(w.win_rate || 0),
    pnl30d: Number(w.pnl_30d || 0),
    avgPositionSize: Number(w.avg_position_size || 0),
    recentHits: Number(w.recent_hits || 0),
    totalTrades: Number(w.total_trades || 0),
    lastSeen: w.last_seen,
    lastCheckedAt: w.last_checked_at || null,
    smartScore: w.smart_score != null ? Number(w.smart_score) : null,
    earlyEntryScore: w.early_entry_score != null ? Number(w.early_entry_score) : null,
    clusterScore: w.cluster_score != null ? Number(w.cluster_score) : null,
    consistencyScore: w.consistency_score != null ? Number(w.consistency_score) : null,
    smartWalletRowUpdatedAt: w.updated_at || null
  };
}

function leaderboardInactivityDecayMultiplier(daysInactive) {
  if (daysInactive == null || !Number.isFinite(daysInactive)) return 0.3;
  if (daysInactive > 30) return 0.3;
  if (daysInactive > 14) return 0.5;
  if (daysInactive > 7) return 0.75;
  return 1.0;
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
  // Aligns with signal_performance SUCCESS_MIN_PCT = 1%.
  // outcome_60m is stored as a fraction (0.01 = +1%).
  if (n >= 0.01) return "WIN";
  if (n < -0.01) return "LOSS";
  return "FLAT"; // -1% to +1% is within noise / fee range
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

/** GET /api/v1/public/stats — onboarding strip (short Redis cache to dedupe browser pollers). */
router.get("/stats", async (_req, res) => {
  const ttl = publicStatsCacheSeconds();
  try {
    const cached = await redis.get(PUBLIC_STATS_CACHE_KEY);
    if (cached && typeof cached === "object" && cached.ok === true) {
      return res.json(cached);
    }
  } catch (_) {
    /* ignore cache read */
  }
  const supabase = safeSupabase();
  if (!supabase) {
    return res.status(503).json({ ok: false, error: "supabase_unconfigured" });
  }
  try {
    const { count: signalsToday, source: signalsTodaySource } = await countSignalsTodayPrimary(supabase);
    const { count: activeWallets, source: activeWalletsSource } = await countActiveWalletsPrimary(supabase);

    const { data: topWallet } = await supabase
      .from("smart_wallets")
      .select("win_rate, pnl_30d")
      .order("win_rate", { ascending: false })
      .limit(1)
      .maybeSingle();

    const win = Number(topWallet?.win_rate || 0);
    const body = {
      ok: true,
      signalsToday: signalsToday ?? 0,
      activeWallets: activeWallets ?? 0,
      smartWallets: activeWallets ?? 0,
      topWalletPct30d: Number.isFinite(win) ? win : null,
      avgEntryWindowMins: 4,
      source: "supabase",
      signalsTodaySource,
      activeWalletsSource
    };
    try {
      await redis.set(PUBLIC_STATS_CACHE_KEY, body, { ex: ttl });
    } catch (_) {
      /* ignore cache write */
    }
    return res.json(body);
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
/**
 * GET /api/v1/public/sentinel-edge
 * Aggregate 24h signal performance for the home banner.
 *
 * The "Sentinel Edge" badge is a unique differentiator vs competitors:
 *   Photon, GMGN, BullX show "smart money buying" but never prove
 *   what % of signals actually win or by how much. This endpoint
 *   surfaces resolved-outcome statistics that users can trust.
 */
router.get("/sentinel-edge", async (_req, res) => {
  const supabase = safeSupabase();
  if (!supabase) {
    return res.status(503).json({ ok: false, error: "supabase_unconfigured" });
  }
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  try {
    // Supabase REST has a hard max_rows of 1000 by default. `.limit(2000)` was
    // being silently capped at 1000, producing a stuck "1000 signals" display.
    // Use count: "exact" with head: true to get true counts without fetching rows.
    const [totalCountRes, winsCountRes, sampleRes] = await Promise.all([
      supabase
        .from("signal_performance")
        .select("id", { count: "exact", head: true })
        .eq("status", "resolved")
        .gte("emitted_at", since),
      supabase
        .from("signal_performance")
        .select("id", { count: "exact", head: true })
        .eq("status", "resolved")
        .gte("emitted_at", since)
        .gte("outcome_pct", 1.0),
      // Sample rows for avg-winner and best-signal calculations.
      // Order by emitted_at to keep the sample unbiased.
      supabase
        .from("signal_performance")
        .select("asset, outcome_pct, emitted_at")
        .eq("status", "resolved")
        .gte("emitted_at", since)
        .order("emitted_at", { ascending: false })
        .limit(1000)
    ]);
    if (totalCountRes.error) throw totalCountRes.error;
    if (winsCountRes.error) throw winsCountRes.error;
    if (sampleRes.error) throw sampleRes.error;

    const totalResolved = Number(totalCountRes.count || 0);
    const totalWinners = Number(winsCountRes.count || 0);
    const winRate = totalResolved > 0 ? (totalWinners / totalResolved) * 100 : 0;

    const sample = (sampleRes.data || []).filter((r) => Number.isFinite(Number(r.outcome_pct)));
    const sampleWins = sample.filter((r) => Number(r.outcome_pct) >= 1.0);
    const avgWinReturn = sampleWins.length > 0
      ? sampleWins.reduce((sum, r) => sum + Number(r.outcome_pct), 0) / sampleWins.length
      : 0;

    // Best winner from the sample (may not be the all-time 24h best if >1000 signals,
    // but representative). For exact best we'd need a separate ORDER BY query.
    const topRow = sampleWins.length > 0
      ? [...sampleWins].sort((a, b) => Number(b.outcome_pct) - Number(a.outcome_pct))[0]
      : null;
    let bestSignal = null;
    if (topRow && Number(topRow.outcome_pct) > 0) {
      let symbol = null;
      try {
        const { data: snap } = await supabase
          .from("market_snapshots")
          .select("symbol")
          .eq("mint", topRow.asset)
          .maybeSingle();
        symbol = snap?.symbol || null;
      } catch (_) { /* non-fatal */ }
      const ageMin = Math.max(0, Math.floor((Date.now() - Date.parse(topRow.emitted_at)) / 60000));
      bestSignal = {
        symbol: symbol || (topRow.asset ? String(topRow.asset).slice(0, 6) : "?"),
        mint: topRow.asset || null,
        returnPct: Number(topRow.outcome_pct),
        ageMinutes: ageMin
      };
    }

    return res.json({
      ok: true,
      windowHours: 24,
      winRate: Math.round(winRate * 10) / 10,
      avgWinReturn: Math.round(avgWinReturn * 10) / 10,
      totalWinners,
      totalResolved,
      bestSignal,
      sampleSize: sample.length
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || "sentinel_edge_failed" });
  }
});

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

/** GET /api/v1/public/smart-wallets-leaderboard — global ranked wallets (Supabase).
 *  Excludes wallets with last_seen older than LEADERBOARD_MAX_STALE_DAYS (default 14; 0 = off). */
router.get("/smart-wallets-leaderboard", async (req, res) => {
  const supabase = safeSupabase();
  if (!supabase) {
    return res.status(503).json({ ok: false, error: "supabase_unconfigured", rows: [] });
  }
  try {
    const maxStaleDays = leaderboardMaxStaleDays();
    const minWr = Math.min(100, Math.max(0, Number(req.query.minWinRate || 0)));
    const minTrades = Math.min(100000, Math.max(0, Number(req.query.minTrades || 0)));
    const chain = String(req.query.chain || "solana").toLowerCase();
    const pageLimit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
    // New: hard PnL gate so users can ask for "profitable wallets only".
    // Pass minPnl30d=0 to require non-negative PnL; >0 for strictly profitable.
    const minPnl30dRaw = req.query.minPnl30d;
    const minPnl30d =
      minPnl30dRaw === undefined || minPnl30dRaw === ""
        ? null
        : Number.isFinite(Number(minPnl30dRaw))
          ? Number(minPnl30dRaw)
          : null;
    const includeZeroTrade =
      String(req.query.includeZeroTrade || "")
        .trim()
        .toLowerCase() === "1" ||
      String(req.query.includeZeroTrade || "")
        .trim()
        .toLowerCase() === "true";
    const includeZeroWinRate =
      String(req.query.includeZeroWinRate || "")
        .trim()
        .toLowerCase() === "1" ||
      String(req.query.includeZeroWinRate || "")
        .trim()
        .toLowerCase() === "true";
    // Exclude unvetted Helius webhook "shell" upserts (smart_score = 1) unless caller
    // explicitly asks for the raw pool with ?includeShells=1. These are every swap
    // signer Helius has ever seen — not real smart money.
    const includeShells =
      String(req.query.includeShells || "")
        .trim()
        .toLowerCase() === "1" ||
      String(req.query.includeShells || "")
        .trim()
        .toLowerCase() === "true";
    const SHELL_SMART_SCORE_THRESHOLD = 5;

    let q = supabase.from("smart_wallets").select("*");
    if (!includeZeroTrade) {
      q = q.gt("total_trades", 0);
    }
    if (!includeZeroWinRate) {
      q = q.gt("win_rate", 0);
    }
    if (minWr > 0) q = q.gte("win_rate", minWr);
    if (minPnl30d != null) q = q.gte("pnl_30d", minPnl30d);
    if (!includeShells) q = q.gte("smart_score", SHELL_SMART_SCORE_THRESHOLD);
    if (maxStaleDays > 0) {
      const cutoffIso = new Date(Date.now() - maxStaleDays * 86_400_000).toISOString();
      q = q.gte("last_seen", cutoffIso);
    }
    // Pull a wider candidate pool ordered by quality (smart_score), not raw volume.
    // total_trades DESC surfaced MEV/arbitrage bots with huge trade counts and
    // negative PnL at the top. smart_score reflects Sentinel's composite quality
    // signal; fall back to total_trades only as a tiebreaker.
    q = q
      .order("smart_score", { ascending: false, nullsFirst: false })
      .order("total_trades", { ascending: false })
      .limit(240);
    const { data, error } = await q;
    if (error) throw error;

    let rows = (data || []).map(mapSmartWalletRow);
    const rowWalletSet = new Set(rows.map((r) => r.wallet).filter(Boolean));

    // Merge proven winners from wallet_behavior_stats — they may have stale
    // smart_wallets.last_seen but fresh computed_at + real win_rate_real.
    const behaviorTop = await getWalletBehaviorTop({ limit: 240, minResolved: 3 });
    if (behaviorTop.ok && Array.isArray(behaviorTop.rows)) {
      const missingBehaviorWallets = behaviorTop.rows
        .map((br) => String(br?.wallet_address || ""))
        .filter((w) => w && !rowWalletSet.has(w));
      if (missingBehaviorWallets.length > 0) {
        const { data: extraSw, error: extraErr } = await supabase
          .from("smart_wallets")
          .select("*")
          .in("wallet_address", missingBehaviorWallets.slice(0, 240));
        if (!extraErr && Array.isArray(extraSw)) {
          for (const w of extraSw) {
            const mapped = mapSmartWalletRow(w);
            if (!rowWalletSet.has(mapped.wallet)) {
              rows.push(mapped);
              rowWalletSet.add(mapped.wallet);
            }
          }
        }
      }
    }

    if (maxStaleDays > 0) {
      rows = rows.filter((r) => isLeaderboardFresh(r.lastSeen, maxStaleDays));
    }

    if (minTrades > 0) {
      rows = rows.filter((r) => r.totalTrades >= minTrades);
    }

    if (chain !== "all" && chain !== "solana") {
      rows = [];
    }

    // NOTE: We intentionally DO NOT slice to pageLimit here. The SQL fetch above
    // pulls top 240 by total_trades, which surfaces high-volume MEV/arbitrage bots
    // first. If we slice here, "?limit=10" returns the 10 bot wallets with the
    // highest volume; quality ranking later only reorders those 10 bots. The slice
    // now happens AFTER enrichment + rankingScore sort below.
    const wallets = rows.map((r) => r.wallet).filter(Boolean);
    const bestByWallet = new Map();
    const behaviorByWallet = new Map();
    if (behaviorTop.ok && Array.isArray(behaviorTop.rows)) {
      for (const br of behaviorTop.rows) {
        const key = String(br.wallet_address || "");
        if (key) behaviorByWallet.set(key, br);
      }
    }
    /** wallet -> ISO string of most recent on-chain activity (wallet_tokens.bought_at) */
    const onchainActivityByWallet = new Map();
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

      // smart_wallets.last_seen only moves when our gating emits a signal for that wallet
      // (see smartWalletWebhookWire). That makes the "stale" badge dishonest: a wallet
      // with 100k trades/day shows as stale just because we didn't emit a gated signal
      // about it. wallet_tokens.bought_at, on the other hand, is upserted by Helius for
      // any on-chain activity it sees. We use MAX(bought_at) per wallet as a fresher
      // anchor for inactivity / staleness computations.
      try {
        const sinceIso = new Date(Date.now() - 60 * 86_400_000).toISOString(); // 60d cap
        const { data: walletTokenRows, error: wtErr } = await supabase
          .from("wallet_tokens")
          .select("wallet_address, bought_at")
          .in("wallet_address", wallets)
          .gte("bought_at", sinceIso)
          .order("bought_at", { ascending: false })
          .limit(5000);
        if (!wtErr && Array.isArray(walletTokenRows)) {
          for (const row of walletTokenRows) {
            const w = String(row?.wallet_address || "");
            const iso = row?.bought_at;
            if (!w || !iso) continue;
            const prev = onchainActivityByWallet.get(w);
            if (!prev || new Date(iso).getTime() > new Date(prev).getTime()) {
              onchainActivityByWallet.set(w, iso);
            }
          }
        }
      } catch (_) {
        // Non-fatal: fall back to last_seen if wallet_tokens lookup fails.
      }
    }

    const enriched = rows.map((r) => {
      const bt = bestByWallet.get(r.wallet);
      const wb = behaviorByWallet.get(r.wallet);
      const avg = Math.max(1, r.avgPositionSize);
      const roiMult = r.pnl30d / avg;

      // ✅ composite score (0–100)
      const tradesWeight = Math.min(1, r.totalTrades / 50); // saturates at 50 trades
      const pnlWeight = r.pnl30d ? Math.max(-50, Math.min(50, r.pnl30d)) : 0;

      const score =
        r.winRate * 0.5 + // 50% win rate
        tradesWeight * 100 * 0.3 + // 30% trades confidence
        pnlWeight * 0.2; // 20% pnl influence

      const scoreVal = Number(score.toFixed(2));
      const profitFactor = approxProfitFactorFromWinRate(r.totalTrades, r.winRate);

      // Use the freshest of: smart_wallets.last_seen (gated-signal only) and the most
      // recent wallet_tokens.bought_at (any on-chain activity). This makes the "stale"
      // badge reflect reality instead of our gating policy.
      const onchainIso = onchainActivityByWallet.get(r.wallet) || null;
      const lastSeenIso = r.lastSeen || null;
      let anchorForDecay = null;
      if (onchainIso && lastSeenIso) {
        anchorForDecay =
          new Date(onchainIso).getTime() >= new Date(lastSeenIso).getTime() ? onchainIso : lastSeenIso;
      } else {
        anchorForDecay = onchainIso || lastSeenIso || r.smartWalletRowUpdatedAt || null;
      }
      const daysInactive = daysInactiveFromAnchor(anchorForDecay);
      const decayMultiplier = leaderboardInactivityDecayMultiplier(daysInactive);
      const reputationScore = computeReputationScore({ behavior: wb, smartWallet: r });
      const rankingScore = rankingScoreFromReputation({
        behavior: wb,
        smartWallet: r,
        decayMultiplier
      });
      const winRateDisplay = displayWinRate({ behavior: wb, smartWallet: r });

      return {
        ...r,
        winRate: winRateDisplay > 0 ? winRateDisplay : r.winRate,
        roi30dVsAvgSize: Number(roiMult.toFixed(2)),
        bestTradePct: bt ? Number(Number(bt.pct).toFixed(2)) : null,
        bestTradeMint: bt?.token || null,
        bestTradeAt: bt?.at || null,
        score: scoreVal,
        unifiedScore: reputationScore > 0 ? reputationScore : scoreVal,
        reputationScore,
        profitFactor,
        rankingScore,
        rankingSource: wb && Number(wb.resolved_signals) >= 3 ? "wallet_behavior_stats" : "smart_wallets",
        decayMultiplier,
        lastOnchainActivityAt: onchainIso,
        activityAnchor: onchainIso ? "wallet_tokens.bought_at" : lastSeenIso ? "smart_wallets.last_seen" : "smart_wallets.updated_at",
        daysInactive:
          daysInactive != null && Number.isFinite(daysInactive) ? Number(daysInactive.toFixed(2)) : null,
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

    const ranked = enriched.sort((a, b) => b.rankingScore - a.rankingScore);

    // Re-apply staleness with behavior + on-chain anchors so proven winners
    // are not dropped just because smart_wallets.last_seen is gate-stale.
    const rankedFresh =
      maxStaleDays > 0
        ? ranked.filter((r) =>
            isLeaderboardFreshWithAnchors(
              {
                lastSeenIso: r.lastSeen,
                onchainIso: r.lastOnchainActivityAt,
                behaviorComputedAt: r.profile?.computedAt
              },
              maxStaleDays
            )
          )
        : ranked;

    const sorted = rankedFresh.slice(0, pageLimit);

    // Compute freshness signals so the UI can display "Updated Xm ago" without guessing.
    let dataComputedAt = null;
    for (const r of sorted) {
      const candidates = [
        r.lastOnchainActivityAt,
        r.lastCheckedAt,
        r.smartWalletRowUpdatedAt,
        r.profile?.computedAt
      ];
      for (const iso of candidates) {
        if (!iso) continue;
        if (dataComputedAt == null || new Date(iso).getTime() > new Date(dataComputedAt).getTime()) {
          dataComputedAt = iso;
        }
      }
    }

    // Total universe size (independent of page limit + filters) so "Total tracked wallets"
    // reflects reality instead of always echoing the page size.
    let totalSmartWallets = null;
    let totalBehaviorProfiles = null;
    try {
      const { count, error: cErr } = await supabase
        .from("smart_wallets")
        .select("wallet_address", { count: "exact", head: true });
      if (!cErr && Number.isFinite(Number(count))) totalSmartWallets = Number(count);
    } catch (_) {
      totalSmartWallets = null;
    }
    try {
      const { count, error: bErr } = await supabase
        .from("wallet_behavior_stats")
        .select("wallet_address", { count: "exact", head: true })
        .gte("resolved_signals", 1);
      if (!bErr && Number.isFinite(Number(count))) totalBehaviorProfiles = Number(count);
    } catch (_) {
      totalBehaviorProfiles = null;
    }

    return res.json({
      ok: true,
      rows: sorted,
      meta: {
        source: "supabase",
        count: sorted.length,
        limit: pageLimit,
        chain: chain === "all" ? "all" : "solana",
        totalSmartWallets,
        totalBehaviorProfiles,
        dataComputedAt,
        filters: {
          minWinRate: minWr,
          minTrades,
          minPnl30d,
          includeZeroTradeRows: includeZeroTrade,
          includeZeroWinRateRows: includeZeroWinRate,
          includeShells,
          shellSmartScoreThreshold: includeShells ? null : SHELL_SMART_SCORE_THRESHOLD,
          maxStaleDays: maxStaleDays || null,
          freshnessAnchors: ["smart_wallets.last_seen", "wallet_tokens.bought_at", "wallet_behavior_stats.computed_at"],
          rankingEngine: "wallet_reputation_v1",
          orderBy: "reputationScore DESC (behavior-first), inactivity decay"
        }
      }
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message, rows: [] });
  }
});

/** GET /api/v1/public/smart-money-activity — latest smart-wallet touches.
 *  Returns up to `limit` rows for the table + meta.activeProbes24h / activeProbes7d
 *  counted server-side (NOT capped by the page limit) so the UI shows the real volume. */
router.get("/smart-money-activity", async (req, res) => {
  const supabase = safeSupabase();
  if (!supabase) {
    return res.status(503).json({ ok: false, error: "supabase_unconfigured", rows: [] });
  }
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 48)));
  const now = Date.now();
  const since24hIso = new Date(now - 86_400_000).toISOString();
  const since7dIso = new Date(now - 7 * 86_400_000).toISOString();

  async function countTouches(table, timeColumn) {
    try {
      const [c24, c7d] = await Promise.all([
        supabase.from(table).select(timeColumn, { count: "exact", head: true }).gte(timeColumn, since24hIso),
        supabase.from(table).select(timeColumn, { count: "exact", head: true }).gte(timeColumn, since7dIso)
      ]);
      return {
        activeProbes24h: Number.isFinite(Number(c24?.count)) ? Number(c24.count) : null,
        activeProbes7d: Number.isFinite(Number(c7d?.count)) ? Number(c7d.count) : null
      };
    } catch (_) {
      return { activeProbes24h: null, activeProbes7d: null };
    }
  }

  function freshestIso(rows, isoField) {
    let best = null;
    for (const r of rows || []) {
      const iso = r?.[isoField];
      if (!iso) continue;
      if (best == null || new Date(iso).getTime() > new Date(best).getTime()) best = iso;
    }
    return best;
  }

  try {
    const perfSelect = "asset, emitted_at, confidence, signals, outcome_pct, status";
    const { data: perfData, error: perfError } = await supabase
      .from("signal_performance")
      .select(perfSelect)
      .order("emitted_at", { ascending: false })
      .limit(limit);
    if (!perfError && Array.isArray(perfData) && perfData.length > 0) {
      const rows = perfData.map(mapPerfRowToSmartMoneyActivity);
      const counts = await countTouches("signal_performance", "emitted_at");
      return res.json({
        ok: true,
        rows,
        meta: {
          source: "signal_performance",
          count: rows.length,
          activeProbes24h: counts.activeProbes24h,
          activeProbes7d: counts.activeProbes7d,
          dataComputedAt: freshestIso(perfData, "emitted_at"),
          windowHoursForActiveProbes: 24
        }
      });
    }
    if (perfError) {
      console.warn("[smart-money-activity] signal_performance read failed:", perfError.message);
    }

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
    const counts = await countTouches("smart_wallet_signals", "created_at");
    return res.json({
      ok: true,
      rows,
      meta: {
        source: "smart_wallet_signals",
        count: rows.length,
        activeProbes24h: counts.activeProbes24h,
        activeProbes7d: counts.activeProbes7d,
        dataComputedAt: freshestIso(data, "created_at"),
        windowHoursForActiveProbes: 24
      }
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message, rows: [] });
  }
});

/** GET /api/v1/public/token-flow/:address — recent smart-wallet signals for a specific mint.
 *  Provides a REST fallback for the LiveFlowPanel when the WebSocket has no live data. */
router.get("/token-flow/:address", async (req, res) => {
  const address = String(req.params.address || "").trim();
  const { isProbableSolanaPubkey } = require("../lib/solanaAddress");
  if (!address || !isProbableSolanaPubkey(address)) {
    return res.status(400).json({ ok: false, error: "invalid_address", rows: [] });
  }
  const supabase = safeSupabase();
  if (!supabase) {
    return res.status(503).json({ ok: false, error: "supabase_unconfigured", rows: [] });
  }
  const lookbackHours = Math.min(24, Math.max(1, Number(req.query.hours || 4)));
  const sinceIso = new Date(Date.now() - lookbackHours * 3600_000).toISOString();
  const limit = Math.min(50, Math.max(5, Number(req.query.limit || 30)));
  try {
    const { data, error } = await supabase
      .from("smart_wallet_signals")
      .select("id, wallet_address, last_action, confidence, created_at")
      .eq("token_address", address)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    const rows = (data || []).map((r) => ({
      id: r.id,
      wallet: r.wallet_address,
      type: String(r.last_action || "buy").toLowerCase(),
      amount: 0,
      timestamp: r.created_at,
      confidence: Number(r.confidence || 0),
      source: "rest"
    }));
    return res.json({ ok: true, rows, meta: { source: "smart_wallet_signals", count: rows.length, lookbackHours } });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message, rows: [] });
  }
});

/** GET /api/v1/public/highlights — best resolved trade per token (public landing). */
router.get("/highlights", async (req, res) => {
  setPublicCache60s(res);
  const supabase = safeSupabase();
  if (!supabase) {
    return res.status(503).json({ ok: false, error: "supabase_unconfigured", items: [] });
  }
  try {
    const windowDays = clampPublicDays(req.query.days, 30, 90);
    const pageLimit = Math.min(50, Math.max(1, Number(req.query.limit || 20)));
    const minOutcomePct = Number.isFinite(Number(req.query.minOutcomePct))
      ? Number(req.query.minOutcomePct)
      : 50;
    const sinceIso = new Date(Date.now() - windowDays * 86_400_000).toISOString();

    const { data, error } = await supabase
      .from("signal_performance")
      .select("id, asset, signals, confidence, outcome_pct, emitted_at, resolved_at, emission_gate")
      .eq("status", "resolved")
      .gte("outcome_pct", minOutcomePct)
      .gte("emitted_at", sinceIso)
      .order("outcome_pct", { ascending: false })
      .limit(Math.min(2000, pageLimit * 40));
    if (error) throw error;

    const bestByAsset = new Map();
    for (const row of data || []) {
      const asset = String(row.asset || "").trim();
      const pct = Number(row.outcome_pct);
      if (!asset || !Number.isFinite(pct)) continue;
      const prev = bestByAsset.get(asset);
      if (!prev || pct > Number(prev.outcome_pct)) bestByAsset.set(asset, row);
    }

    const ranked = [...bestByAsset.values()]
      .sort((a, b) => Number(b.outcome_pct) - Number(a.outcome_pct))
      .slice(0, pageLimit);

    const mints = ranked.map((r) => r.asset).filter(Boolean);
    const symbolByMint = new Map();
    if (mints.length) {
      const { data: snaps } = await supabase.from("market_snapshots").select("mint, symbol").in("mint", mints);
      for (const s of snaps || []) {
        if (s?.mint) symbolByMint.set(s.mint, s.symbol);
      }
    }

    const items = ranked.map((row) => ({
      token_address: row.asset,
      token_symbol: symbolByMint.get(row.asset) || null,
      signal_type: signalTypeFromPerformanceRow(row),
      confidence: row.confidence != null ? Number(row.confidence) : null,
      unified_score: unifiedScoreFromPerformanceRow(row),
      outcome_pct: Number(Number(row.outcome_pct).toFixed(2)),
      emitted_at: row.emitted_at,
      resolved_at: row.resolved_at || null
    }));

    return res.json({
      ok: true,
      generated_at: new Date().toISOString(),
      window_days: windowDays,
      min_outcome_pct: minOutcomePct,
      count: items.length,
      items
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message, items: [] });
  }
});

/** GET /api/v1/public/track-record/summary — honest aggregate stats (outcome_pct >= 1% wins). */
router.get("/track-record/summary", async (req, res) => {
  setPublicCache60s(res);
  const supabase = safeSupabase();
  if (!supabase) {
    return res.status(503).json({ ok: false, error: "supabase_unconfigured" });
  }
  try {
    const windowDays = clampPublicDays(req.query.days, 30, 90);
    const sinceIso = new Date(Date.now() - windowDays * 86_400_000).toISOString();
    const winMin = SIGNAL_PERF_SUCCESS_MIN_PCT;

    const [resolvedRes, winsRes, above100Res, above500Res, sampleRes, bestRes] = await Promise.all([
      supabase
        .from("signal_performance")
        .select("id", { count: "exact", head: true })
        .eq("status", "resolved")
        .gte("emitted_at", sinceIso),
      supabase
        .from("signal_performance")
        .select("id", { count: "exact", head: true })
        .eq("status", "resolved")
        .gte("outcome_pct", winMin)
        .gte("emitted_at", sinceIso),
      supabase
        .from("signal_performance")
        .select("id", { count: "exact", head: true })
        .eq("status", "resolved")
        .gte("outcome_pct", 100)
        .gte("emitted_at", sinceIso),
      supabase
        .from("signal_performance")
        .select("id", { count: "exact", head: true })
        .eq("status", "resolved")
        .gte("outcome_pct", 500)
        .gte("emitted_at", sinceIso),
      supabase
        .from("signal_performance")
        .select("outcome_pct")
        .eq("status", "resolved")
        .not("outcome_pct", "is", null)
        .gte("emitted_at", sinceIso)
        .limit(15000),
      supabase
        .from("signal_performance")
        .select("outcome_pct")
        .eq("status", "resolved")
        .not("outcome_pct", "is", null)
        .gte("emitted_at", sinceIso)
        .order("outcome_pct", { ascending: false })
        .limit(1)
    ]);

    for (const r of [resolvedRes, winsRes, above100Res, above500Res, sampleRes, bestRes]) {
      if (r.error) throw r.error;
    }

    const totalResolved = Number(resolvedRes.count || 0);
    const wins = Number(winsRes.count || 0);
    const losses = Math.max(0, totalResolved - wins);
    const pctRows = (sampleRes.data || [])
      .map((r) => Number(r.outcome_pct))
      .filter((n) => Number.isFinite(n));

    const winRows = pctRows.filter((n) => n >= winMin);
    const lossRows = pctRows.filter((n) => n < winMin);
    const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
    const sumWin = winRows.reduce((a, b) => a + b, 0);
    const sumLossAbs = Math.abs(lossRows.reduce((a, b) => a + b, 0));
    const profitFactor =
      sumLossAbs > 0 ? Number((sumWin / sumLossAbs).toFixed(2)) : sumWin > 0 ? 99 : 0;

    const bestRow = (bestRes.data || [])[0];
    const bestTradePct =
      bestRow?.outcome_pct != null && Number.isFinite(Number(bestRow.outcome_pct))
        ? Number(Number(bestRow.outcome_pct).toFixed(2))
        : pctRows.length
          ? Math.max(...pctRows)
          : null;

    const winRatePct = totalResolved > 0 ? Number(((wins / totalResolved) * 100).toFixed(1)) : 0;

    return res.json({
      ok: true,
      window_days: windowDays,
      win_rate_pct: winRatePct,
      win_definition: `outcome_pct >= ${winMin}% at resolve horizon`,
      total_resolved: totalResolved,
      wins,
      losses,
      avg_outcome_pct: avg(pctRows) != null ? Number(avg(pctRows).toFixed(2)) : null,
      avg_winner_pct: avg(winRows) != null ? Number(avg(winRows).toFixed(2)) : null,
      avg_loser_pct: avg(lossRows) != null ? Number(avg(lossRows).toFixed(2)) : null,
      best_trade_pct: bestTradePct,
      trades_above_100pct: Number(above100Res.count || 0),
      trades_above_500pct: Number(above500Res.count || 0),
      profit_factor: profitFactor,
      sample_rows: pctRows.length
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
