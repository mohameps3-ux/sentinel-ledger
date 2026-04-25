"use strict";

const { getSupabase } = require("../lib/supabase");
const { isProbableSolanaPubkey } = require("../lib/solanaAddress");

const PROMOTION_TICK_MS = Math.max(60 * 60 * 1000, Number(process.env.AUTO_DISCOVERY_PROMOTION_TICK_MS || 6 * 60 * 60 * 1000));
const LOOKBACK_MINUTES = Math.max(5, Math.min(24 * 60, Number(process.env.AUTO_DISCOVERY_SIGNAL_LOOKBACK_MIN || 90)));
const MAX_WALLETS_PER_SIGNAL = Math.max(1, Math.min(100, Number(process.env.AUTO_DISCOVERY_MAX_WALLETS_PER_SIGNAL || 25)));
const PROMOTION_MIN_SCORE = Math.max(0, Math.min(1, Number(process.env.AUTO_DISCOVERY_PROMOTION_MIN_SCORE || 0.65)));
const PROMOTION_BATCH = Math.max(1, Math.min(200, Number(process.env.AUTO_DISCOVERY_PROMOTION_BATCH || 50)));

let promotionIntervalRef = null;
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
  // Map +5%..+50% validation outcome into a conservative 0.1..1.0 candidate score.
  return Math.max(0, Math.min(1, outcome / 0.5));
}

function promotionEligible(row) {
  if (row?.is_likely_bot) return false;
  if (String(row?.status || "candidate") !== "candidate") return false;
  const score = Number(row?.candidate_score || 0);
  const closedTrades = Number(row?.closed_trades || 0);
  return score >= PROMOTION_MIN_SCORE && closedTrades >= 3;
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
  return (data || []).filter((row) => {
    const wallet = String(row?.wallet_address || "").trim();
    if (!isProbableSolanaPubkey(wallet) || seen.has(wallet)) return false;
    seen.add(wallet);
    return true;
  });
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
    const eligible = rows.filter(promotionEligible);
    const rejected = rows.filter((row) => !promotionEligible(row) && row.is_likely_bot);
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
    }

    if (rejected.length) {
      await supabase
        .from("auto_discovered_wallets")
        .update({ status: "rejected", rejected_at: nowIso, rejection_reason: "likely_bot", updated_at: nowIso })
        .in("wallet_address", rejected.map((row) => row.wallet_address));
    }

    lastPromotionStats = { examined: rows.length, promoted, rejected: rejected.length, error: null };
  } catch (error) {
    lastPromotionStats = { ...lastPromotionStats, error: error?.message || "promotion_failed" };
    console.warn("[auto-discovery] promotion:", error?.message || error);
  } finally {
    lastPromotionFinishedAt = Date.now();
  }
  return lastPromotionStats;
}

function startPromotionCron() {
  if (promotionIntervalRef) return;
  if (!isEnabled() || !isPromotionEnabled()) {
    console.log("[auto-discovery] promotion cron disabled");
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

module.exports = {
  discoverFromSignal,
  getAutoDiscoveryStatus,
  listAutoDiscoveryCandidates,
  runPromotionTick,
  startPromotionCron
};
