"use strict";

const { getSupabase } = require("../lib/supabase");
const { isProbableSolanaPubkey } = require("../lib/solanaAddress");
const { fetchWalletTransactions } = require("../services/heliusTransactions");
const { detectInventoryRoundTrips } = require("../services/walletRoundTripDetector");
const {
  promotionRejectionGate,
  autoDiscoveryCandidateInc,
  autoDiscoveryEnrichedOkInc,
  autoDiscoveryPromotedInc,
  autoDiscoveryRejectionInc
} = require("../lib/autoDiscoveryTelemetry");

const PROMOTION_TICK_MS = Math.max(60 * 60 * 1000, Number(process.env.AUTO_DISCOVERY_PROMOTION_TICK_MS || 6 * 60 * 60 * 1000));
const BATCH_DISCOVERY_TICK_MS = Math.max(
  5 * 60 * 1000,
  Number(process.env.AUTO_DISCOVERY_BATCH_TICK_MS || 15 * 60 * 1000)
);
const LOOKBACK_MINUTES = Math.max(5, Math.min(24 * 60, Number(process.env.AUTO_DISCOVERY_SIGNAL_LOOKBACK_MIN || 90)));
const MAX_WALLETS_PER_SIGNAL = Math.max(1, Math.min(100, Number(process.env.AUTO_DISCOVERY_MAX_WALLETS_PER_SIGNAL || 25)));
const PROMOTION_MIN_SCORE = Math.max(0, Math.min(1, Number(process.env.AUTO_DISCOVERY_PROMOTION_MIN_SCORE || 0.65)));
const PROMOTION_BATCH = Math.max(1, Math.min(200, Number(process.env.AUTO_DISCOVERY_PROMOTION_BATCH || 50)));

// --- Helius round-trip enrichment thresholds (used in promotionEligible) ---
// These gates ensure only *actually profitable* wallets get promoted to smart_wallets.
const PROMOTION_MIN_WIN_RATE_OBSERVED = Math.max(
  0,
  Math.min(1, Number(process.env.AUTO_DISCOVERY_MIN_WIN_RATE_OBSERVED || 0.55))
);
const PROMOTION_MIN_CLOSED_TRADES = Math.max(
  1,
  Number(process.env.AUTO_DISCOVERY_MIN_CLOSED_TRADES || 5)
);
const PROMOTION_MIN_WEIGHTED_SOL_PNL = Number(process.env.AUTO_DISCOVERY_MIN_WEIGHTED_SOL_PNL ?? 0);
// Bot heuristic: tx-per-hour above this flags is_likely_bot. 30/hr is aggressive
// (legitimate sniper wallets rarely sustain >0.5 tx/hr; arbitrage bots hit 100s).
const BOT_TX_PER_HOUR_THRESHOLD = Math.max(
  1,
  Number(process.env.AUTO_DISCOVERY_BOT_TX_PER_HOUR || 30)
);
// How many signatures of the candidate's recent history to fetch from Helius.
// Bounded so we don't blow the Helius budget on the cron.
const ENRICHMENT_SIG_LIMIT = Math.max(
  10,
  Math.min(200, Number(process.env.AUTO_DISCOVERY_ENRICHMENT_SIG_LIMIT || 80))
);
const ENRICHMENT_ENABLED =
  String(process.env.AUTO_DISCOVERY_ROUND_TRIP_ENRICHMENT_ENABLED || "true").toLowerCase() !== "false";
// TODO: remove enrichment audit log after 72h (disable via AUTO_DISCOVERY_ENRICHMENT_AUDIT_LOG=false).
const ENRICHMENT_AUDIT_LOG =
  String(process.env.AUTO_DISCOVERY_ENRICHMENT_AUDIT_LOG || "true").toLowerCase() !== "false";

let promotionIntervalRef = null;
let batchDiscoveryIntervalRef = null;
let lastDiscoveryAt = null;
let lastPromotionStartedAt = null;
let lastPromotionFinishedAt = null;
let lastDiscoveryStats = { mint: null, candidates: 0, inserted: 0, updated: 0, error: null };
let lastPromotionStats = { examined: 0, promoted: 0, rejected: 0, error: null };

function isEnabled() {
  return String(process.env.AUTO_DISCOVERY_ENABLED || "true").toLowerCase() !== "false";
}

function isPromotionEnabled() {
  return String(process.env.AUTO_DISCOVERY_PROMOTION_ENABLED || "true").toLowerCase() !== "false";
}

function safeUuid(value) {
  const text = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

function toIso(value) {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : new Date().toISOString();
}

function candidateScoreFromOutcome(outcomePct) {
  const outcome = Number(outcomePct);
  if (!Number.isFinite(outcome)) return 0;
  // Map +1%..+30% validation outcome → 0.1..1.0 candidate score.
  // Old mapping was +5%..+50% which excluded the 1-5% win band entirely.
  return Math.max(0, Math.min(1, (outcome - 1) / 29 + 0.1));
}

function promotionEligible(row) {
  if (row?.is_likely_bot) return false;
  if (String(row?.status || "candidate") !== "candidate") return false;
  const score = Number(row?.candidate_score || 0);
  const closedTrades = Number(row?.closed_trades || 0);
  const winRateObserved = Number(row?.win_rate_observed || 0);
  const weightedPnl = Number(row?.weighted_avg_sol_pnl || 0);
  if (score < PROMOTION_MIN_SCORE) return false;
  if (closedTrades < PROMOTION_MIN_CLOSED_TRADES) return false;
  if (winRateObserved < PROMOTION_MIN_WIN_RATE_OBSERVED) return false;
  if (weightedPnl < PROMOTION_MIN_WEIGHTED_SOL_PNL) return false;
  return true;
}

/**
 * Pull the candidate's recent Solana history via Helius, run the SPL-inventory
 * round-trip detector, and persist the resulting metrics back onto the
 * auto_discovered_wallets row. This is what makes promotionEligible() actually
 * mean "wallet is profitable on chain" instead of "the signal that touched this
 * wallet performed well".
 *
 * Returns the updated metric snapshot or null on failure (failure is non-fatal:
 * the next promotion tick will retry).
 */
async function enrichCandidateWithRoundTripMetrics(supabase, candidate) {
  if (!ENRICHMENT_ENABLED) return null;
  const wallet = String(candidate?.wallet_address || "").trim();
  if (!wallet || !isProbableSolanaPubkey(wallet)) return null;

  let parsedTransactions = [];
  try {
    const { transactions } = await fetchWalletTransactions(wallet, {
      limit: ENRICHMENT_SIG_LIMIT,
      skipGlobalDedupe: true
    });
    parsedTransactions = (Array.isArray(transactions) ? transactions : []).map((tx) => ({
      tx,
      signature: tx?.signature || tx?.transaction?.signatures?.[0] || null
    }));
  } catch (e) {
    console.warn(`[auto-discovery] round-trip fetch ${wallet}: ${e?.message || e}`);
    return null;
  }
  if (!parsedTransactions.length) return null;

  const result = detectInventoryRoundTrips(parsedTransactions, wallet);
  const m = result?.metrics || {};

  // Cheap tx-rate heuristic from the fetched window.
  const blockTimes = parsedTransactions
    .map((entry) => Number(entry?.tx?.blockTime || entry?.tx?.timestamp))
    .filter((n) => Number.isFinite(n) && n > 0);
  let txPerHour = 0;
  if (blockTimes.length >= 2) {
    const spanSec = Math.max(1, Math.max(...blockTimes) - Math.min(...blockTimes));
    txPerHour = (blockTimes.length / spanSec) * 3600;
  }
  const isLikelyBot = txPerHour > BOT_TX_PER_HOUR_THRESHOLD;

  if (ENRICHMENT_AUDIT_LOG) {
    const auditRow = {
      ...candidate,
      closed_trades: Number(m.closedTrades || 0),
      win_rate_observed: Number(m.winRateObserved || 0),
      weighted_avg_sol_pnl: Number(m.weightedAvgSolPnl || 0),
      is_likely_bot: isLikelyBot
    };
    const reject = promotionRejectionGate(auditRow, {
      minScore: PROMOTION_MIN_SCORE,
      minClosed: PROMOTION_MIN_CLOSED_TRADES,
      minWinRate: PROMOTION_MIN_WIN_RATE_OBSERVED,
      minPnl: PROMOTION_MIN_WEIGHTED_SOL_PNL,
      botTxPerHour: BOT_TX_PER_HOUR_THRESHOLD
    });
    console.info(
      `[auto-discovery] wallet=${wallet} sigs=${parsedTransactions.length} parsed=${parsedTransactions.length} closed_trades=${Number(m.closedTrades || 0)} win_rate=${Number(m.winRateObserved || 0).toFixed(3)} candidate_score=${Number(m.candidateScore || 0).toFixed(3)} reject=${reject}`
    );
  }

  const metricsPayload = {
    closed_trades: Number(m.closedTrades || 0),
    wins_observed: Number(m.wins || 0),
    win_rate_observed: Number(m.winRateObserved || 0),
    avg_sol_pnl_per_cycle: Number(m.avgSolPnl || 0),
    weighted_avg_sol_pnl: Number(m.weightedAvgSolPnl || 0),
    total_sol_moved: Number(m.totalSolMoved || 0),
    tx_per_hour: Number(txPerHour),
    is_likely_bot: isLikelyBot,
    updated_at: new Date().toISOString()
  };

  try {
    const { error: updErr } = await supabase
      .from("auto_discovered_wallets")
      .update(metricsPayload)
      .eq("wallet_address", wallet);
    if (updErr) {
      console.warn(`[auto-discovery] round-trip update ${wallet}: ${updErr.message || updErr}`);
      return null;
    }
  } catch (e) {
    console.warn(`[auto-discovery] round-trip persist ${wallet}: ${e?.message || e}`);
    return null;
  }

  // Return a merged candidate snapshot so the caller can decide eligibility
  // immediately without re-querying.
  return { ...candidate, ...metricsPayload };
}

async function safeSupabase() {
  try {
    return getSupabase();
  } catch (_) {
    return null;
  }
}

async function walletsForWinningMint(supabase, mint, timestamp) {
  const center = Date.parse(timestamp);
  const fromIso = Number.isFinite(center)
    ? new Date(center - LOOKBACK_MINUTES * 60_000).toISOString()
    : new Date(Date.now() - LOOKBACK_MINUTES * 60_000).toISOString();
  const toIsoValue = Number.isFinite(center)
    ? new Date(center + LOOKBACK_MINUTES * 60_000).toISOString()
    : new Date().toISOString();

  const { data, error } = await supabase
    .from("smart_wallet_signals")
    .select("wallet_address, confidence, created_at")
    .eq("token_address", mint)
    .gte("created_at", fromIso)
    .lte("created_at", toIsoValue)
    .order("confidence", { ascending: false, nullsFirst: false })
    .limit(MAX_WALLETS_PER_SIGNAL);
  if (error) throw new Error(error.message || "smart_wallet_signals_query_failed");

  const seen = new Set();
  const primary = (data || []).filter((row) => {
    const wallet = String(row?.wallet_address || "").trim();
    if (!isProbableSolanaPubkey(wallet) || seen.has(wallet)) return false;
    seen.add(wallet);
    return true;
  });

  // If smart_wallet_signals has no entries for this mint (older signals or
  // signals sourced from a different pipeline path), fall back to wallet_tokens
  // which tracks all on-chain wallet↔mint relationships.
  if (primary.length === 0) {
    const { data: wt, error: wtErr } = await supabase
      .from("wallet_tokens")
      .select("wallet_address, bought_at")
      .eq("token_address", mint)
      .order("bought_at", { ascending: false, nullsFirst: false })
      .limit(MAX_WALLETS_PER_SIGNAL);
    if (!wtErr && Array.isArray(wt) && wt.length > 0) {
      const fallback = [];
      for (const row of wt) {
        const wallet = String(row?.wallet_address || "").trim();
        if (!isProbableSolanaPubkey(wallet) || seen.has(wallet)) continue;
        seen.add(wallet);
        fallback.push({ wallet_address: wallet, confidence: 50, created_at: row.bought_at });
      }
      return fallback;
    }
  }

  return primary;
}

async function discoverFromSignal({ mint, signal_id, rule_id = "unknown", outcome_pct, timestamp } = {}) {
  if (!isEnabled()) return { ok: false, reason: "disabled", candidates: 0 };
  const tokenMint = String(mint || "").trim();
  if (!tokenMint) return { ok: false, reason: "mint_required", candidates: 0 };
  const supabase = await safeSupabase();
  if (!supabase) return { ok: false, reason: "supabase_unconfigured", candidates: 0 };

  const wallets = await walletsForWinningMint(supabase, tokenMint, timestamp);
  if (!wallets.length) {
    lastDiscoveryAt = Date.now();
    lastDiscoveryStats = { mint: tokenMint, candidates: 0, inserted: 0, updated: 0, error: null };
    return { ok: true, candidates: 0, inserted: 0, updated: 0 };
  }

  const walletAddresses = wallets.map((row) => row.wallet_address);
  const { data: existing, error: lookupError } = await supabase
    .from("auto_discovered_wallets")
    .select("wallet_address,status,created_at")
    .in("wallet_address", walletAddresses);
  if (lookupError) throw new Error(lookupError.message || "auto_discovery_lookup_failed");
  const existingByWallet = new Map((existing || []).map((row) => [row.wallet_address, row]));
  const nowIso = new Date().toISOString();
  const baseScore = candidateScoreFromOutcome(outcome_pct);
  const rows = wallets.map((row) => {
    const existingRow = existingByWallet.get(row.wallet_address);
    const status = existingRow?.status && existingRow.status !== "candidate" ? existingRow.status : "candidate";
    return {
      wallet_address: row.wallet_address,
      discovered_from_signal: safeUuid(signal_id),
      discovered_from_mint: tokenMint,
      discovery_rule_id: String(rule_id || "unknown").slice(0, 50),
      discovery_outcome_pct: Number.isFinite(Number(outcome_pct)) ? Number(outcome_pct) : null,
      candidate_score: Math.max(baseScore, Math.min(1, Number(row.confidence || 0) / 100)),
      status,
      ...(existingRow?.created_at ? {} : { created_at: nowIso }),
      updated_at: nowIso
    };
  });

  const { error } = await supabase.from("auto_discovered_wallets").upsert(rows, { onConflict: "wallet_address" });
  if (error) throw new Error(error.message || "auto_discovery_upsert_failed");

  const inserted = rows.filter((row) => !existingByWallet.has(row.wallet_address)).length;
  const updated = rows.length - inserted;
  if (inserted > 0) autoDiscoveryCandidateInc(inserted);
  lastDiscoveryAt = Date.now();
  lastDiscoveryStats = { mint: tokenMint, candidates: rows.length, inserted, updated, error: null };
  return { ok: true, candidates: rows.length, inserted, updated };
}

async function listAutoDiscoveryCandidates({ limit = 50 } = {}) {
  const supabase = await safeSupabase();
  if (!supabase) return { ok: false, rows: [], reason: "supabase_unconfigured" };
  const lim = Math.max(1, Math.min(200, Number(limit) || 50));
  const { data, error } = await supabase
    .from("auto_discovered_wallets")
    .select("*")
    .order("candidate_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(lim);
  if (error) return { ok: false, rows: [], reason: error.message || "query_failed" };
  return { ok: true, rows: data || [], status: getAutoDiscoveryStatus() };
}

async function runPromotionTick() {
  if (!isEnabled() || !isPromotionEnabled()) return lastPromotionStats;
  const supabase = await safeSupabase();
  if (!supabase) {
    lastPromotionStats = { ...lastPromotionStats, error: "supabase_unconfigured" };
    return lastPromotionStats;
  }
  lastPromotionStartedAt = Date.now();
  try {
    const { data, error } = await supabase
      .from("auto_discovered_wallets")
      .select("*")
      .eq("status", "candidate")
      .order("candidate_score", { ascending: false, nullsFirst: false })
      .limit(PROMOTION_BATCH);
    if (error) throw new Error(error.message || "auto_discovery_query_failed");

    const rows = data || [];

    // Enrich every candidate with on-chain round-trip metrics BEFORE deciding
    // eligibility. This is what actually closes the "wallets rentables" gap:
    // promotionEligible() now sees real win_rate_observed / weighted_avg_sol_pnl
    // computed from Helius transactions, not placeholder zeros from ingest.
    const enrichedRows = [];
    let enrichErrors = 0;
    let likelyBots = 0;
    const gateThresholds = {
      minScore: PROMOTION_MIN_SCORE,
      minClosed: PROMOTION_MIN_CLOSED_TRADES,
      minWinRate: PROMOTION_MIN_WIN_RATE_OBSERVED,
      minPnl: PROMOTION_MIN_WEIGHTED_SOL_PNL,
      botTxPerHour: BOT_TX_PER_HOUR_THRESHOLD
    };
    for (const row of rows) {
      try {
        const enriched = await enrichCandidateWithRoundTripMetrics(supabase, row);
        const merged = enriched || row;
        if (!enriched) {
          autoDiscoveryRejectionInc("enrichment_empty");
        } else if (Number(merged.closed_trades || 0) > 0) {
          autoDiscoveryEnrichedOkInc(1);
        }
        if (merged?.is_likely_bot) likelyBots += 1;
        enrichedRows.push(merged);
      } catch (e) {
        enrichErrors += 1;
        enrichedRows.push(row);
        autoDiscoveryRejectionInc("enrichment_empty");
      }
    }

    const eligible = enrichedRows.filter(promotionEligible);
    for (const row of enrichedRows) {
      if (promotionEligible(row)) continue;
      autoDiscoveryRejectionInc(promotionRejectionGate(row, gateThresholds));
    }
    const rejected = enrichedRows.filter((row) => !promotionEligible(row) && row.is_likely_bot);
    const nowIso = new Date().toISOString();
    let promoted = 0;

    for (const row of eligible) {
      const payload = {
        wallet_address: row.wallet_address,
        win_rate: Math.round(Number(row.win_rate_observed || 0) * 10000) / 100,
        pnl_30d: Number(row.weighted_avg_sol_pnl || row.avg_sol_pnl_per_cycle || 0),
        avg_position_size: Number(row.total_sol_moved || 0) / Math.max(1, Number(row.closed_trades || 0)),
        recent_hits: Math.min(99, Number(row.wins_observed || 0)),
        source: "auto_discovery",
        discovery_mint: row.discovered_from_mint,
        discovery_outcome_pct: row.discovery_outcome_pct,
        discovery_rule_id: row.discovery_rule_id,
        promoted_from_score: row.candidate_score,
        total_sol_moved: row.total_sol_moved,
        closed_trades: row.closed_trades,
        total_trades: row.closed_trades,
        profitable_trades: row.wins_observed,
        smart_score: Math.round(Math.max(0, Math.min(1, Number(row.candidate_score || 0))) * 100),
        last_seen: nowIso,
        updated_at: nowIso
      };
      const { error: upErr } = await supabase.from("smart_wallets").upsert(payload, { onConflict: "wallet_address" });
      if (upErr) throw new Error(upErr.message || "smart_wallet_promotion_failed");
      const { error: markErr } = await supabase
        .from("auto_discovered_wallets")
        .update({ status: "promoted", promoted_at: nowIso, updated_at: nowIso })
        .eq("wallet_address", row.wallet_address);
      if (markErr) throw new Error(markErr.message || "auto_discovery_mark_promoted_failed");
      promoted += 1;
      autoDiscoveryPromotedInc(1);
    }

    if (rejected.length) {
      await supabase
        .from("auto_discovered_wallets")
        .update({ status: "rejected", rejected_at: nowIso, rejection_reason: "likely_bot", updated_at: nowIso })
        .in("wallet_address", rejected.map((row) => row.wallet_address));
    }

    lastPromotionStats = {
      examined: rows.length,
      enriched: enrichedRows.length,
      enrichErrors,
      likelyBots,
      promoted,
      rejected: rejected.length,
      error: null
    };
  } catch (error) {
    lastPromotionStats = { ...lastPromotionStats, error: error?.message || "promotion_failed" };
    console.warn("[auto-discovery] promotion:", error?.message || error);
  } finally {
    lastPromotionFinishedAt = Date.now();
  }
  return lastPromotionStats;
}

function startPromotionCron() {
  if (!isEnabled()) {
    console.log("[auto-discovery] disabled via AUTO_DISCOVERY_ENABLED");
    return;
  }

  const batchParams = {
    lookbackHours: Math.max(1, Number(process.env.AUTO_DISCOVERY_BATCH_LOOKBACK_HOURS || 24)),
    minWinPct: Number(process.env.AUTO_DISCOVERY_BATCH_MIN_WIN_PCT || 50),
    limit: Math.max(10, Math.min(500, Number(process.env.AUTO_DISCOVERY_BATCH_LIMIT || 100)))
  };

  if (!batchDiscoveryIntervalRef) {
    runBatchDiscovery(batchParams)
      .then((r) => console.log("[auto-discovery] bootstrap batch:", r))
      .catch((e) => console.warn("[auto-discovery] bootstrap batch:", e?.message || e));
    batchDiscoveryIntervalRef = setInterval(() => {
      runBatchDiscovery(batchParams)
        .then((r) => {
          if (r?.totalCandidates > 0) console.log("[auto-discovery] batch tick:", r);
        })
        .catch((e) => console.warn("[auto-discovery] batch tick:", e?.message || e));
    }, BATCH_DISCOVERY_TICK_MS);
    if (typeof batchDiscoveryIntervalRef.unref === "function") batchDiscoveryIntervalRef.unref();
  }

  if (promotionIntervalRef) return;
  if (!isPromotionEnabled()) {
    console.log("[auto-discovery] promotion cron disabled (batch discovery still active)");
    return;
  }

  runPromotionTick().catch((e) => console.warn("[auto-discovery] bootstrap promotion:", e?.message || e));
  promotionIntervalRef = setInterval(() => {
    runPromotionTick().catch((e) => console.warn("[auto-discovery] promotion tick:", e?.message || e));
  }, PROMOTION_TICK_MS);
  if (promotionIntervalRef && typeof promotionIntervalRef.unref === "function") promotionIntervalRef.unref();
}

function getAutoDiscoveryStatus() {
  return {
    enabled: isEnabled(),
    promotionEnabled: isPromotionEnabled(),
    promotionTickMs: PROMOTION_TICK_MS,
    promotionMinScore: PROMOTION_MIN_SCORE,
    promotionMinWinRateObserved: PROMOTION_MIN_WIN_RATE_OBSERVED,
    promotionMinClosedTrades: PROMOTION_MIN_CLOSED_TRADES,
    promotionMinWeightedSolPnl: PROMOTION_MIN_WEIGHTED_SOL_PNL,
    botTxPerHourThreshold: BOT_TX_PER_HOUR_THRESHOLD,
    enrichmentEnabled: ENRICHMENT_ENABLED,
    enrichmentSigLimit: ENRICHMENT_SIG_LIMIT,
    maxWalletsPerSignal: MAX_WALLETS_PER_SIGNAL,
    lookbackMinutes: LOOKBACK_MINUTES,
    lastDiscoveryAt,
    lastPromotionStartedAt,
    lastPromotionFinishedAt,
    lastPromotionDurationMs:
      lastPromotionStartedAt && lastPromotionFinishedAt ? lastPromotionFinishedAt - lastPromotionStartedAt : null,
    lastDiscoveryStats,
    lastPromotionStats
  };
}

/**
 * Batch-process recent winners from signal_performance → auto_discovered_wallets.
 * Runs on-demand (from /ops) and on each promotion cron startup to backfill.
 * Processes last `lookbackHours` hours of resolved wins (outcome_pct >= minWinPct).
 */
async function runBatchDiscovery({ lookbackHours = 48, minWinPct = 1.0, limit = 200 } = {}) {
  if (!isEnabled()) return { ok: false, reason: "disabled", processed: 0, totalCandidates: 0 };
  const supabase = await safeSupabase();
  if (!supabase) return { ok: false, reason: "supabase_unconfigured", processed: 0, totalCandidates: 0 };

  const since = new Date(Date.now() - lookbackHours * 3600_000).toISOString();
  const { data: winners, error } = await supabase
    .from("signal_performance")
    .select("id,asset,emitted_at,signals,outcome_pct")
    .eq("status", "resolved")
    .gte("outcome_pct", minWinPct)
    .gte("emitted_at", since)
    .order("outcome_pct", { ascending: false })
    .limit(limit);
  if (error) return { ok: false, reason: error.message || "query_failed", processed: 0, totalCandidates: 0 };

  const RULE_ID_MAP = {
    whale_accumulation: "R01", liquidity_shock: "R02",
    cluster_buy: "R03", cluster_probing: "R03",
    new_wallet_confidence: "R04", velocity_spike: "R05"
  };
  function firstRuleId(signals) {
    for (const tag of (Array.isArray(signals) ? signals : [])) {
      const rid = RULE_ID_MAP[String(tag || "").trim()];
      if (rid) return rid;
    }
    return null;
  }

  let processed = 0;
  let totalCandidates = 0;
  for (const row of winners || []) {
    try {
      const result = await discoverFromSignal({
        mint: row.asset,
        signal_id: row.id,
        rule_id: firstRuleId(row.signals) || "unknown",
        outcome_pct: Number(row.outcome_pct),
        timestamp: row.emitted_at
      });
      processed += 1;
      totalCandidates += result?.candidates || 0;
    } catch (err) {
      console.warn("[auto-discovery] batch:", err?.message || err);
    }
  }
  console.log(`[auto-discovery] batch: processed=${processed} totalCandidates=${totalCandidates}`);
  return { ok: true, processed, totalCandidates };
}

module.exports = {
  discoverFromSignal,
  runBatchDiscovery,
  getAutoDiscoveryStatus,
  listAutoDiscoveryCandidates,
  runPromotionTick,
  startPromotionCron
};
