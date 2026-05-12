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
const { asRuleId } = require("../workers/validationOracle");
const redis = require("../lib/cache");
const {
  TRACK_RECORD_LEDGER_STATS_KEY: LEDGER_STATS_CACHE_KEY,
  getTrackRecordCacheGen
} = require("../services/trackRecordLive");

const router = express.Router();

router.use(publicTerminalLimiter);

function safeSupabase() {
  try {
    return getSupabase();
  } catch {
    return null;
  }
}

/** Redis + Cache-Control for GET /track-record. Default 20s; set TRACK_RECORD_CACHE_SECONDS (5–120). */
function trackRecordCacheSeconds() {
  const n = Number(process.env.TRACK_RECORD_CACHE_SECONDS);
  if (!Number.isFinite(n)) return 20;
  return Math.min(120, Math.max(5, Math.floor(n)));
}

/**
 * Longer TTL for `signal_outcomes` aggregate block (RPC vs fallback). Stops UI flip-flop when the RPC
 * intermittently times out while counts stay identical. Env: TRACK_RECORD_LEDGER_STATS_CACHE_SECONDS (30–600).
 */
function trackRecordLedgerStatsCacheSeconds() {
  const n = Number(process.env.TRACK_RECORD_LEDGER_STATS_CACHE_SECONDS);
  if (!Number.isFinite(n)) return 180;
  return Math.min(600, Math.max(30, Math.floor(n)));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isValidCachedOutcomesLedger(cached) {
  if (!cached || typeof cached !== "object") return false;
  const L = cached.ledger;
  if (!L || typeof L !== "object") return false;
  return ["total_signals", "resolved_signals", "winsCount", "lossesCount", "decisive", "stats_basis"].every(
    (k) => L[k] !== undefined
  );
}

/** Oracle decisive thresholds (fraction of return); must match oracleResult + UI. */
const TR_DECISIVE_WIN = 0.05;
const TR_DECISIVE_LOSS = -0.05;

function trackRecordAggSampleLimit() {
  const n = Number(process.env.TRACK_RECORD_AGG_SAMPLE_LIMIT);
  if (!Number.isFinite(n)) return 8000;
  return Math.min(20_000, Math.max(500, Math.floor(n)));
}

function normalizeLedgerStatsRpc(raw) {
  if (!raw || typeof raw !== "object") return null;
  const total_signals = Number(raw.total_signals);
  const resolved_signals = Number(raw.resolved_signals);
  const winsCount = Number(raw.wins_decisive);
  const lossesCount = Number(raw.losses_decisive);
  if (![total_signals, resolved_signals, winsCount, lossesCount].every((n) => Number.isFinite(n) && n >= 0)) {
    return null;
  }
  const decisive = winsCount + lossesCount;
  const flatResolved = Math.max(0, resolved_signals - winsCount - lossesCount);
  const avgAll = raw.avg_outcome_60m_all;
  const minAll = raw.min_outcome_60m_all;
  const avgWins = raw.avg_outcome_60m_wins;
  return {
    total_signals,
    resolved_signals,
    winsCount,
    lossesCount,
    decisive,
    flatResolved,
    avg_return: avgAll != null && Number.isFinite(Number(avgAll)) ? Number(avgAll) : null,
    max_drawdown: minAll != null && Number.isFinite(Number(minAll)) ? Number(minAll) : null,
    avg_return_wins: avgWins != null && Number.isFinite(Number(avgWins)) ? Number(avgWins) : null,
    stats_basis: "exact_ledger_sql"
  };
}

/** Bounded client aggregates when RPC is unavailable or still warming. */
async function computeSignalOutcomesLedgerAggregatesFallback(supabase) {
  const aggLimit = trackRecordAggSampleLimit();
  const [totalRes, resolvedRes, winsCountRes, lossesCountRes, aggSampleRes] = await Promise.all([
    supabase.from("signal_outcomes").select("id", { count: "exact", head: true }),
    supabase.from("signal_outcomes").select("id", { count: "exact", head: true }).not("outcome_60m", "is", null),
    supabase
      .from("signal_outcomes")
      .select("id", { count: "exact", head: true })
      .gt("outcome_60m", TR_DECISIVE_WIN),
    supabase
      .from("signal_outcomes")
      .select("id", { count: "exact", head: true })
      .lt("outcome_60m", TR_DECISIVE_LOSS),
    supabase
      .from("signal_outcomes")
      .select("outcome_60m")
      .not("outcome_60m", "is", null)
      .order("created_at", { ascending: false })
      .limit(aggLimit)
  ]);
  for (const r of [totalRes, resolvedRes, winsCountRes, lossesCountRes, aggSampleRes]) {
    if (r.error) throw r.error;
  }
  const winsCount = Number(winsCountRes.count || 0);
  const lossesCount = Number(lossesCountRes.count || 0);
  const decisive = winsCount + lossesCount;
  const resolvedTotal = Number(resolvedRes.count || 0);
  const flatResolved = Math.max(0, resolvedTotal - winsCount - lossesCount);
  const aggSample = aggSampleRes.data || [];
  const returns = aggSample.map((row) => Number(row.outcome_60m)).filter(Number.isFinite);
  const winReturnsFromSample = aggSample
    .filter((row) => Number(row.outcome_60m) > TR_DECISIVE_WIN)
    .map((row) => Number(row.outcome_60m))
    .filter(Number.isFinite);
  return {
    total_signals: Number(totalRes.count || 0),
    resolved_signals: resolvedTotal,
    winsCount,
    lossesCount,
    decisive,
    flatResolved,
    avg_return: returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : null,
    max_drawdown: returns.length ? Math.min(...returns) : null,
    avg_return_wins: winReturnsFromSample.length
      ? winReturnsFromSample.reduce((a, b) => a + b, 0) / winReturnsFromSample.length
      : null,
    stats_basis: "fallback_client_aggregates",
    avg_return_sample_rows: returns.length,
    avg_return_sample_cap: aggLimit
  };
}

/**
 * Full-table stats via RPC when migration 029 is applied; else bounded client aggregates.
 * Cached separately from the HTML JSON page so intermittent RPC timeouts do not alternate KPI definitions.
 */
async function resolveSignalOutcomesLedgerAggregates(supabase) {
  const cacheSec = trackRecordLedgerStatsCacheSeconds();
  try {
    const cached = await redis.get(LEDGER_STATS_CACHE_KEY);
    if (isValidCachedOutcomesLedger(cached)) {
      return cached.ledger;
    }
  } catch (error) {
    console.warn("[track-record] ledger stats cache read failed:", error?.message || error);
  }

  let fromRpc = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await delay(100 * attempt);
    const rpcRes = await supabase.rpc("signal_outcomes_track_record_stats");
    fromRpc = normalizeLedgerStatsRpc(rpcRes.data);
    if (!rpcRes.error && fromRpc) {
      break;
    }
    if (rpcRes.error && process.env.NODE_ENV !== "test") {
      console.warn(
        `[track-record] RPC signal_outcomes_track_record_stats attempt ${attempt + 1}/3:`,
        rpcRes.error.message
      );
    }
    fromRpc = null;
  }

  const ledger = fromRpc || (await computeSignalOutcomesLedgerAggregatesFallback(supabase));

  try {
    await redis.set(LEDGER_STATS_CACHE_KEY, { v: 3, ledger, cached_at: new Date().toISOString() }, { ex: cacheSec });
  } catch (error) {
    console.warn("[track-record] ledger stats cache write failed:", error?.message || error);
  }

  return ledger;
}

/**
 * Same shape as the non-RPC branch of `resolveSignalOutcomesLedgerAggregates`, but sourced from
 * `signal_performance` when `signal_outcomes` is empty (e.g. ledger insert/sync failed after resolve).
 * Thresholds: `outcome_pct` is percent points; decisive bands match ±5% fractional oracle rules.
 */
async function resolveSignalPerformanceLedgerAggregates(supabase) {
  const winPctThresh = TR_DECISIVE_WIN * 100;
  const lossPctThresh = TR_DECISIVE_LOSS * 100;
  const aggLimit = trackRecordAggSampleLimit();
  const [totalRes, resolvedRes, winsCountRes, lossesCountRes, aggSampleRes] = await Promise.all([
    supabase.from("signal_performance").select("id", { count: "exact", head: true }),
    supabase
      .from("signal_performance")
      .select("id", { count: "exact", head: true })
      .eq("status", "resolved")
      .not("outcome_pct", "is", null),
    supabase
      .from("signal_performance")
      .select("id", { count: "exact", head: true })
      .eq("status", "resolved")
      .gt("outcome_pct", winPctThresh),
    supabase
      .from("signal_performance")
      .select("id", { count: "exact", head: true })
      .eq("status", "resolved")
      .lt("outcome_pct", lossPctThresh),
    supabase
      .from("signal_performance")
      .select("outcome_pct")
      .eq("status", "resolved")
      .not("outcome_pct", "is", null)
      .order("emitted_at", { ascending: false })
      .limit(aggLimit)
  ]);
  for (const r of [totalRes, resolvedRes, winsCountRes, lossesCountRes, aggSampleRes]) {
    if (r.error) throw r.error;
  }
  const winsCount = Number(winsCountRes.count || 0);
  const lossesCount = Number(lossesCountRes.count || 0);
  const decisive = winsCount + lossesCount;
  const resolvedTotal = Number(resolvedRes.count || 0);
  const flatResolved = Math.max(0, resolvedTotal - winsCount - lossesCount);
  const aggSample = aggSampleRes.data || [];
  const returns = aggSample.map((row) => Number(row.outcome_pct) / 100).filter(Number.isFinite);
  const winReturnsFromSample = aggSample
    .filter((row) => Number(row.outcome_pct) > winPctThresh)
    .map((row) => Number(row.outcome_pct) / 100)
    .filter(Number.isFinite);
  return {
    total_signals: Number(totalRes.count || 0),
    resolved_signals: resolvedTotal,
    winsCount,
    lossesCount,
    decisive,
    flatResolved,
    avg_return: returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : null,
    max_drawdown: returns.length ? Math.min(...returns) : null,
    avg_return_wins: winReturnsFromSample.length
      ? winReturnsFromSample.reduce((a, b) => a + b, 0) / winReturnsFromSample.length
      : null,
    stats_basis: "signal_performance_mirror",
    avg_return_sample_rows: returns.length,
    avg_return_sample_cap: aggLimit
  };
}

/** Map a `signal_performance` row into the `signal_outcomes` shape expected by `mapOracleSignal` / enrich. */
function mapPerfRowToOutcomeLedgerRow(perfRow) {
  const pct = perfRow.outcome_pct != null ? Number(perfRow.outcome_pct) : null;
  const status = String(perfRow.status || "").toLowerCase();
  const resolved = status === "resolved";
  const outcomeFrac = resolved && Number.isFinite(pct) ? pct / 100 : null;
  const sigs = Array.isArray(perfRow.signals) ? perfRow.signals : [];
  let ruleId = "R03";
  for (const s of sigs) {
    const rid = asRuleId(s);
    if (rid) {
      ruleId = rid;
      break;
    }
  }
  return {
    id: perfRow.id,
    signal_id: perfRow.event_id,
    mint: perfRow.asset,
    rule_id: ruleId,
    price_at_signal: perfRow.entry_price_usd != null ? Number(perfRow.entry_price_usd) : null,
    wallets_involved: 0,
    regime: perfRow.emission_regime || null,
    outcome_60m: outcomeFrac,
    rule_snapshot: {
      version: 1,
      ruleId,
      source: "signal_performance_mirror",
      confidence: perfRow.confidence
    },
    created_at: perfRow.emitted_at,
    validated: outcomeFrac != null,
    validated_at: outcomeFrac != null ? perfRow.emitted_at : null
  };
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

/** Confidence for UI (0–100): DB may store fraction (0–1) or percent (>1). */
function confidenceToPct(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n > 1 ? Math.min(100, n) : Math.round(n * 10000) / 100;
}

function graveyardSignalSourceTags(signal, row) {
  const rid = String(row.rule_id || "").toLowerCase();
  if (rid.includes("cluster")) return ["cluster_signal"];
  const w = Number(row.wallets_involved || 0);
  if (w > 1) return ["whale_signal"];
  const la = String(signal?.last_action || "").toLowerCase();
  if (la.includes("cluster")) return ["cluster_signal"];
  if (la.includes("whale")) return ["whale_signal"];
  return ["smart_money"];
}

function oracleAction(row = {}, signal = null) {
  const action = String(signal?.last_action || "").toLowerCase();
  if (action === "sell") return "TOO LATE";
  const confidence = Number(row.rule_snapshot?.confidence ?? signal?.confidence ?? 0);
  if (confidence > 1) {
    if (confidence >= 75) return "ACCUMULATE";
    if (confidence >= 45) return "WATCH";
    return "AVOID";
  }
  if (confidence >= 0.75) return "ACCUMULATE";
  if (confidence >= 0.45) return "WATCH";
  return "AVOID";
}

function oracleResult(row = {}) {
  const outcome = Number(row.outcome_60m);
  if (!Number.isFinite(outcome)) {
    const createdMs = Date.parse(row.created_at);
    if (Number.isFinite(createdMs) && Date.now() - createdMs <= 60 * 60 * 1000) return "PENDING";
    return "MISSING";
  }
  if (outcome > TR_DECISIVE_WIN) return "WIN";
  if (outcome < TR_DECISIVE_LOSS) return "LOSS";
  return "NEUTRAL";
}

function confidenceBadge(row = {}) {
  const n = Number(row.total_signals || 0);
  const c = Number(row.confidence_score || 0);
  if (n < 10 || c < 0.5) return "INSUFFICIENT DATA";
  if (c >= 0.7) return "HIGH";
  return "BUILDING";
}

/** Minute bucket for track-record dedup (floor to start of minute). */
function trackRecordMinuteBucket(iso) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "na";
  return String(Math.floor(ms / 60000));
}

/**
 * Stable dedup key: mint (if present) + minute + rule_id; else symbol + deployer/token_address/id.
 * @param {Record<string, unknown>} row — enriched track-record signal (mapOracleSignal output)
 */
function trackRecordDedupeKey(row) {
  const sym = String(row.symbol || "")
    .replace(/\$/g, "")
    .trim()
    .toUpperCase();
  const hasMint = row.mint != null && String(row.mint).trim() !== "";
  let tokenPart;
  if (hasMint) {
    tokenPart = String(row.mint).trim();
  } else {
    const suffix = String(row.deployer ?? row.token_address ?? row.id ?? "").trim();
    tokenPart = sym && suffix ? `${sym}_${suffix}` : suffix || sym || "unknown";
  }
  const ruleId = String(row.rule_id || "").trim() || "_";
  const t = row.created_at || row.time;
  return `${tokenPart}|${trackRecordMinuteBucket(t)}|${ruleId}`;
}

/** Higher = stronger signal for tie-break beyond strength. */
function trackRecordStrengthScore(row) {
  const s = Number(row.strength ?? 0);
  if (Number.isFinite(s)) return s;
  return 0;
}

/**
 * Drop duplicate track-record rows that share the same token + minute + rule.
 * Keeps the row with highest confidence (strength); collapsed groups get evolution metadata.
 * @param {Record<string, unknown>[]} rows
 * @returns {{ rows: Record<string, unknown>[], removed: number }}
 */
function dedupeTrackRecordSignals(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return { rows: rows || [], removed: 0 };
  const groups = new Map();
  for (const row of rows) {
    const key = trackRecordDedupeKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const out = [];
  let removed = 0;
  for (const [, group] of groups) {
    if (group.length === 1) {
      out.push(group[0]);
      continue;
    }
    removed += group.length - 1;
    const scores = group.map((r) => trackRecordStrengthScore(r));
    const minStrength = Math.min(...scores);
    let winner = group[0];
    let bestS = scores[0];
    for (let i = 1; i < group.length; i++) {
      const s = scores[i];
      const cand = group[i];
      if (s > bestS) {
        bestS = s;
        winner = cand;
      } else if (s === bestS) {
        const idA = String(cand.id ?? "");
        const idB = String(winner.id ?? "");
        if (idA > idB) winner = cand;
      }
    }
    out.push({
      ...winner,
      signal_evolution: true,
      previous_strength: minStrength,
      deduped: true
    });
  }
  out.sort((a, b) => {
    const ta = Date.parse(a.created_at || a.time || 0);
    const tb = Date.parse(b.created_at || b.time || 0);
    const sa = Number.isFinite(ta) ? ta : 0;
    const sb = Number.isFinite(tb) ? tb : 0;
    return sb - sa;
  });
  return { rows: out, removed };
}

function bestRegime(row = {}) {
  const perf = row.regime_performance && typeof row.regime_performance === "object" ? row.regime_performance : {};
  const entries = Object.entries(perf)
    .filter(([, v]) => Number(v?.total || 0) > 0)
    .sort((a, b) => Number(b[1]?.confidence || 0) - Number(a[1]?.confidence || 0));
  return entries[0] ? `${entries[0][0]} ${(Number(entries[0][1]?.confidence || 0) * 100).toFixed(0)}%` : "—";
}

function tokenSymbol(row = {}, snapshot = null) {
  return snapshot?.symbol || row.rule_snapshot?.symbol || (row.mint ? `${String(row.mint).slice(0, 4)}…${String(row.mint).slice(-4)}` : "—");
}

function tokenName(row = {}, snapshot = null) {
  return snapshot?.name || snapshot?.symbol || row.rule_snapshot?.symbol || "Unknown token";
}

function mapOracleSignal(row, signalById, snapshotByMint) {
  const signal = signalById.get(String(row.signal_id || ""));
  const snapshot = snapshotByMint.get(row.mint);
  const outcome60 = row.outcome_60m != null ? Number(row.outcome_60m) : null;
  const rawConf = row.rule_snapshot?.confidence ?? signal?.confidence ?? 0;
  const confPct = confidenceToPct(rawConf);
  return {
    id: row.id,
    signal_id: row.signal_id,
    time: row.created_at,
    created_at: row.created_at,
    emitted_at: row.created_at,
    mint: row.mint,
    token: row.mint,
    token_address: row.mint,
    token_name: tokenName(row, snapshot),
    asset: tokenSymbol(row, snapshot),
    symbol: tokenSymbol(row, snapshot),
    confidence: confPct,
    strength: Number(rawConf),
    signals: graveyardSignalSourceTags(signal, row),
    entry_price_usd: row.price_at_signal != null ? Number(row.price_at_signal) : null,
    rule_id: row.rule_id || "unknown",
    action: oracleAction(row, signal),
    outcome_5m: row.outcome_5m != null ? Number(row.outcome_5m) : null,
    outcome_15m: row.outcome_15m != null ? Number(row.outcome_15m) : null,
    outcome_60m: outcome60,
    result: oracleResult(row),
    validation_state: oracleResult(row),
    wallets_involved: Number(row.wallets_involved || 0),
    regime: row.regime || null,
    smart_money_early_min: row.rule_snapshot?.timeAdvantageMin ?? row.rule_snapshot?.entryWindowMin ?? null
  };
}

async function enrichOracleRows(supabase, rows = []) {
  const mints = [...new Set(rows.map((r) => r.mint).filter(Boolean))].slice(0, 250);
  const signalIds = rows
    .map((r) => String(r.signal_id || ""))
    .filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
    .slice(0, 250);
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
  return rows.map((row) => mapOracleSignal(row, signalById, snapshotByMint));
}

async function buildTrackRecordPayload(
  supabase,
  { filter = "all", page = 1, pageSize = 25, cacheGen = 0, chartPageSpan = 1 } = {}
) {
  const safePage = Math.max(1, Math.floor(Number(page) || 1));
  const safePageSize = Math.max(1, Math.min(50, Math.floor(Number(pageSize) || 25)));
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;
  const chartSpan = Math.min(6, Math.max(1, Math.floor(Number(chartPageSpan) || 1)));

  let ledger = await resolveSignalOutcomesLedgerAggregates(supabase);
  let rowSource = "signal_outcomes";
  if (Number(ledger.total_signals || 0) === 0) {
    try {
      const perfLedger = await resolveSignalPerformanceLedgerAggregates(supabase);
      if (Number(perfLedger.total_signals || 0) > 0) {
        ledger = perfLedger;
        rowSource = "signal_performance";
        if (process.env.NODE_ENV !== "test") {
          console.warn("[track-record] using signal_performance mirror (signal_outcomes ledger empty)");
        }
      }
    } catch (err) {
      if (process.env.NODE_ENV !== "test") {
        console.warn("[track-record] signal_performance mirror unavailable:", err?.message || err);
      }
    }
  }

  const perfSelect =
    "id,event_id,asset,emitted_at,confidence,signals,entry_price_usd,outcome_pct,status,emission_regime";
  let pageQuery;
  let winsQuery;
  let lossesQuery;
  if (rowSource === "signal_performance") {
    pageQuery = supabase.from("signal_performance").select(perfSelect).order("emitted_at", { ascending: false });
    if (filter === "wins") {
      pageQuery = pageQuery.eq("status", "resolved").gt("outcome_pct", TR_DECISIVE_WIN * 100);
    }
    if (filter === "losses") {
      pageQuery = pageQuery.eq("status", "resolved").lt("outcome_pct", TR_DECISIVE_LOSS * 100);
    }
    if (filter === "pending") {
      pageQuery = pageQuery.eq("status", "pending");
    }
    pageQuery = pageQuery.range(from, to);
    winsQuery = supabase
      .from("signal_performance")
      .select(perfSelect)
      .eq("status", "resolved")
      .gt("outcome_pct", TR_DECISIVE_WIN * 100)
      .order("outcome_pct", { ascending: false })
      .limit(5);
    lossesQuery = supabase
      .from("signal_performance")
      .select(perfSelect)
      .eq("status", "resolved")
      .lt("outcome_pct", TR_DECISIVE_LOSS * 100)
      .order("outcome_pct", { ascending: true })
      .limit(3);
  } else {
    pageQuery = supabase
      .from("signal_outcomes")
      .select(
        "id,signal_id,mint,rule_id,price_at_signal,wallets_involved,regime,price_5m,price_15m,price_60m,outcome_5m,outcome_15m,outcome_60m,validated,rule_snapshot,min_price_observed,validated_at,created_at"
      )
      .order("created_at", { ascending: false });
    if (filter === "wins") pageQuery = pageQuery.gt("outcome_60m", TR_DECISIVE_WIN);
    if (filter === "losses") pageQuery = pageQuery.lt("outcome_60m", TR_DECISIVE_LOSS);
    if (filter === "pending") pageQuery = pageQuery.is("outcome_60m", null);
    pageQuery = pageQuery.range(from, to);
    winsQuery = supabase
      .from("signal_outcomes")
      .select("id,signal_id,mint,rule_id,outcome_60m,created_at,rule_snapshot")
      .gt("outcome_60m", TR_DECISIVE_WIN)
      .order("outcome_60m", { ascending: false })
      .limit(5);
    lossesQuery = supabase
      .from("signal_outcomes")
      .select("id,signal_id,mint,rule_id,outcome_60m,created_at,rule_snapshot")
      .lt("outcome_60m", TR_DECISIVE_LOSS)
      .order("outcome_60m", { ascending: true })
      .limit(3);
  }

  const [rulesRes, pageRes, winsRes, lossesRes, autoDiscoveredRes] = await Promise.all([
    supabase.from("rule_performance").select("*").order("confidence_score", { ascending: false, nullsFirst: false }).limit(100),
    pageQuery,
    winsQuery,
    lossesQuery,
    supabase
      .from("smart_wallets")
      .select("wallet_address,win_rate,total_trades,promoted_at,source")
      .eq("source", "auto_discovery")
      .order("win_rate", { ascending: false, nullsFirst: false })
      .limit(20)
  ]);

  for (const r of [rulesRes, pageRes, winsRes, lossesRes]) {
    if (r.error) throw r.error;
  }
  // Auto-discovered wallets are best-effort: missing column / table degrades to empty list, never fails the page.
  const autoDiscoveredRows = autoDiscoveredRes && !autoDiscoveredRes.error
    ? Array.isArray(autoDiscoveredRes.data) ? autoDiscoveredRes.data : []
    : [];

  const winsCount = ledger.winsCount;
  const lossesCount = ledger.lossesCount;
  const decisive = ledger.decisive;

  const pageRowsRaw =
    rowSource === "signal_performance"
      ? (pageRes.data || []).map(mapPerfRowToOutcomeLedgerRow)
      : pageRes.data || [];

  let extraPageRowsRaw = [];
  if (chartSpan > 1) {
    const extraReqs = [];
    for (let p = 2; p <= chartSpan; p += 1) {
      const fromN = (p - 1) * safePageSize;
      const toN = fromN + safePageSize - 1;
      if (rowSource === "signal_performance") {
        let q2 = supabase.from("signal_performance").select(perfSelect).order("emitted_at", { ascending: false });
        if (filter === "wins") q2 = q2.eq("status", "resolved").gt("outcome_pct", TR_DECISIVE_WIN * 100);
        if (filter === "losses") q2 = q2.eq("status", "resolved").lt("outcome_pct", TR_DECISIVE_LOSS * 100);
        if (filter === "pending") q2 = q2.eq("status", "pending");
        extraReqs.push(q2.range(fromN, toN));
      } else {
        let q2 = supabase
          .from("signal_outcomes")
          .select(
            "id,signal_id,mint,rule_id,price_at_signal,wallets_involved,regime,price_5m,price_15m,price_60m,outcome_5m,outcome_15m,outcome_60m,validated,rule_snapshot,min_price_observed,validated_at,created_at"
          )
          .order("created_at", { ascending: false });
        if (filter === "wins") q2 = q2.gt("outcome_60m", TR_DECISIVE_WIN);
        if (filter === "losses") q2 = q2.lt("outcome_60m", TR_DECISIVE_LOSS);
        if (filter === "pending") q2 = q2.is("outcome_60m", null);
        extraReqs.push(q2.range(fromN, toN));
      }
    }
    const extraRes = await Promise.all(extraReqs);
    for (const er of extraRes) {
      if (er.error) throw er.error;
      const chunk =
        rowSource === "signal_performance"
          ? (er.data || []).map(mapPerfRowToOutcomeLedgerRow)
          : er.data || [];
      extraPageRowsRaw.push(...chunk);
    }
  }

  const winsRowsRaw =
    rowSource === "signal_performance" ? (winsRes.data || []).map(mapPerfRowToOutcomeLedgerRow) : winsRes.data || [];
  const lossesRowsRaw =
    rowSource === "signal_performance"
      ? (lossesRes.data || []).map(mapPerfRowToOutcomeLedgerRow)
      : lossesRes.data || [];

  const best = winsRowsRaw[0] || null;
  const worst = lossesRowsRaw[0] || null;

  const rulePerformance = (rulesRes.data || []).map((row) => {
    const total = Number(row.total_signals || 0);
    const wr = total ? Number(row.success_count_60m || 0) / total : null;
    return {
      rule_id: row.rule_id,
      total_signals: total,
      win_rate: wr,
      avg_return: row.avg_return_60m != null ? Number(row.avg_return_60m) : null,
      best_regime: bestRegime(row),
      confidence_score: Number(row.confidence_score || 0),
      confidence_badge: confidenceBadge(row),
      max_drawdown: row.max_drawdown != null ? Number(row.max_drawdown) : null
    };
  });

  const recentRaw = await enrichOracleRows(supabase, pageRowsRaw);
  const topWinsRaw = await enrichOracleRows(supabase, winsRowsRaw);
  const worstLossesRaw = await enrichOracleRows(supabase, lossesRowsRaw);
  const [bestCall] = best ? await enrichOracleRows(supabase, [best]) : [null];
  const [worstCall] = worst ? await enrichOracleRows(supabase, [worst]) : [null];

  const recentDedup = dedupeTrackRecordSignals(recentRaw);
  const topWinsDedup = dedupeTrackRecordSignals(topWinsRaw);
  const worstLossesDedup = dedupeTrackRecordSignals(worstLossesRaw);

  const recent = recentDedup.rows.slice();
  const recentKeyToIdx = new Map(recent.map((r, i) => [trackRecordDedupeKey(r), i]));
  let crossSectionRemoved = 0;

  const topWins = [];
  const topKeyToIdx = new Map();
  for (const r of topWinsDedup.rows) {
    const k = trackRecordDedupeKey(r);
    const ridx = recentKeyToIdx.get(k);
    if (ridx !== undefined) {
      if (trackRecordStrengthScore(r) > trackRecordStrengthScore(recent[ridx])) {
        recent[ridx] = r;
      }
      crossSectionRemoved += 1;
      continue;
    }
    const tidx = topKeyToIdx.get(k);
    if (tidx !== undefined) {
      if (trackRecordStrengthScore(r) > trackRecordStrengthScore(topWins[tidx])) {
        topWins[tidx] = r;
      }
      crossSectionRemoved += 1;
      continue;
    }
    topKeyToIdx.set(k, topWins.length);
    topWins.push(r);
  }

  const worstLosses = [];
  const worstKeyToIdx = new Map();
  for (const r of worstLossesDedup.rows) {
    const k = trackRecordDedupeKey(r);
    const ridx = recentKeyToIdx.get(k);
    if (ridx !== undefined) {
      if (trackRecordStrengthScore(r) > trackRecordStrengthScore(recent[ridx])) {
        recent[ridx] = r;
      }
      crossSectionRemoved += 1;
      continue;
    }
    const tidx = topKeyToIdx.get(k);
    if (tidx !== undefined) {
      if (trackRecordStrengthScore(r) > trackRecordStrengthScore(topWins[tidx])) {
        topWins[tidx] = r;
      }
      crossSectionRemoved += 1;
      continue;
    }
    const widx = worstKeyToIdx.get(k);
    if (widx !== undefined) {
      if (trackRecordStrengthScore(r) > trackRecordStrengthScore(worstLosses[widx])) {
        worstLosses[widx] = r;
      }
      crossSectionRemoved += 1;
      continue;
    }
    worstKeyToIdx.set(k, worstLosses.length);
    worstLosses.push(r);
  }

  const allKeys = new Set([
    ...recentKeyToIdx.keys(),
    ...topKeyToIdx.keys(),
    ...worstKeyToIdx.keys()
  ]);

  let bestCallOut = bestCall;
  if (bestCallOut && allKeys.has(trackRecordDedupeKey(bestCallOut))) {
    bestCallOut = null;
    crossSectionRemoved += 1;
  }

  let worstCallOut = worstCall;
  if (worstCallOut && allKeys.has(trackRecordDedupeKey(worstCallOut))) {
    worstCallOut = null;
    crossSectionRemoved += 1;
  }

  const trackRecordDeduplicatedCount =
    recentDedup.removed + topWinsDedup.removed + worstLossesDedup.removed + crossSectionRemoved;
  if (process.env.NODE_ENV !== "production") {
    console.log("track_record_dedupe_details", {
      totalRemoved: trackRecordDeduplicatedCount
    });
  }

  const autoDiscoveredWallets = autoDiscoveredRows
    .map((row) => {
      const wr = Number(row.win_rate);
      return {
        wallet: row.wallet_address,
        win_rate: Number.isFinite(wr) ? wr : null,
        total_trades: Number.isFinite(Number(row.total_trades)) ? Number(row.total_trades) : null,
        promoted_at: row.promoted_at || null
      };
    })
    .filter((row) => row.wallet);

  const chartTapeRaw = [...pageRowsRaw, ...extraPageRowsRaw];
  let chart_rows = [];
  if (chartTapeRaw.length > 0) {
    const tapeEnriched = await enrichOracleRows(supabase, chartTapeRaw.slice(0, 500));
    const chartPack = dedupeTrackRecordSignals([
      ...tapeEnriched,
      ...topWins,
      ...worstLosses,
      ...(bestCallOut ? [bestCallOut] : []),
      ...(worstCallOut ? [worstCallOut] : [])
    ]);
    chart_rows = chartPack.rows.slice().sort((a, b) => {
      const ta = Date.parse(a.created_at || a.time || 0);
      const tb = Date.parse(b.created_at || b.time || 0);
      const sa = Number.isFinite(ta) ? ta : 0;
      const sb = Number.isFinite(tb) ? tb : 0;
      return sa - sb;
    });
  }

  return {
    ok: true,
    total_signals: ledger.total_signals,
    resolved_signals: ledger.resolved_signals,
    flat_resolved_signals: ledger.flatResolved,
    win_rate_60m: decisive ? winsCount / decisive : null,
    avg_return: ledger.avg_return,
    avg_return_wins: ledger.avg_return_wins,
    max_drawdown: ledger.max_drawdown,
    best_call: bestCallOut,
    worst_call: worstCallOut,
    rule_performance: rulePerformance,
    recent_signals: recent,
    chart_rows,
    top_wins: topWins,
    worst_losses: worstLosses,
    auto_discovered_wallets: autoDiscoveredWallets,
    last_updated: new Date().toISOString(),
    pagination: {
      page: safePage,
      page_size: safePageSize,
      total_pages: Math.max(1, Math.ceil(Number(ledger.total_signals || 0) / safePageSize))
    },
      meta: {
        source: "supabase:validation_oracle",
        track_record_row_source: rowSource,
        track_record_cache_gen: cacheGen,
        chart_page_span: chartSpan,
      filter,
      cache_ttl_sec: trackRecordCacheSeconds(),
      ledger_stats_cache_ttl_sec: trackRecordLedgerStatsCacheSeconds(),
      decisive_win_min_fraction: TR_DECISIVE_WIN,
      stats_basis: ledger.stats_basis,
      win_rate_basis: "count_wins_div_decisive_all_ledger",
      avg_return_basis:
        ledger.stats_basis === "exact_ledger_sql"
          ? "mean_all_resolved_signal_outcomes_db"
          : "mean_recent_resolved_time_order_fallback",
      avg_return_sample_rows: ledger.avg_return_sample_rows ?? null,
      avg_return_sample_cap: ledger.avg_return_sample_cap ?? null,
      worst_outcome_basis:
        ledger.stats_basis === "exact_ledger_sql"
          ? "min_all_resolved_signal_outcomes_db"
          : "min_in_recent_sample_fallback"
    }
  };
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
 * GET /api/v1/signals/track-record
 * Reads `signal_outcomes` (inserted at emission via validation oracle; 60m fields filled by oracle
 * and/or synced from `signal_performance` when the signal-outcome cron resolves).
 * Redis TTL configurable (see trackRecordCacheSeconds); default ~15s — not a source of multi-day staleness.
 */
router.get("/track-record", async (req, res) => {
  const supabase = safeSupabase();
  if (!supabase) {
    return res.status(503).json({ ok: false, error: "supabase_unconfigured" });
  }
  const filter = String(req.query.filter || "all").toLowerCase();
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.max(1, Math.min(50, Number(req.query.limit || 25)));
  const chartPages = Math.min(6, Math.max(1, Math.floor(Number(req.query.chart_pages || req.query.chart_page_span || 1))));
  let cacheGen = 0;
  try {
    cacheGen = await getTrackRecordCacheGen();
  } catch (error) {
    console.warn("[track-record] cache gen read failed:", error?.message || error);
  }
  const cacheKey = `signals:track-record:v11:g${cacheGen}:${filter}:${page}:${pageSize}:cp${chartPages}`;
  const cacheSec = trackRecordCacheSeconds();
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      res.set("Cache-Control", `public, max-age=${cacheSec}, stale-while-revalidate=${cacheSec}`);
      return res.json({ ...cached, cached: true });
    }
  } catch (error) {
    console.warn("[track-record] cache read failed:", error?.message || error);
  }
  try {
    const body = await buildTrackRecordPayload(supabase, { filter, page, pageSize, cacheGen, chartPageSpan: chartPages });
    try {
      await redis.set(cacheKey, body, { ex: cacheSec });
    } catch (error) {
      console.warn("[track-record] cache write failed:", error?.message || error);
    }
    res.set("Cache-Control", `public, max-age=${cacheSec}, stale-while-revalidate=${cacheSec}`);
    console.log("[track-record] verified signal history live");
    return res.json(body);
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "track_record_failed" });
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

router.get("/track-record/summary", async (req, res) => {
  try {
    const sb = getSupabase();
    const windowParam = String(req.query.window || "48h").toLowerCase();
    const hours =
      windowParam === "24h" ? 24 : windowParam === "7d" ? 168 : windowParam === "30d" ? 720 : 48;
    const sinceIso = new Date(Date.now() - hours * 3600_000).toISOString();

    const { data, error } = await sb
      .from("signal_performance")
      .select("id,outcome_60m,confidence,action,token_name,mint,emitted_at,time,signals")
      .not("outcome_60m", "is", null)
      .gte("emitted_at", sinceIso)
      .order("emitted_at", { ascending: false })
      .limit(500);
    if (error) throw error;

    const rows = data || [];
    const wins = rows.filter((s) => Number(s.outcome_60m) > 0);
    const losses = rows.filter((s) => Number(s.outcome_60m) < 0);
    const resolved = wins.length + losses.length;
    const avgReturn = rows.length
      ? rows.reduce((a, s) => a + (Number(s.outcome_60m) || 0), 0) / rows.length
      : 0;
    const grossWin = wins.reduce((a, s) => a + Math.max(Number(s.outcome_60m) || 0, 0), 0);
    const grossLoss = Math.abs(
      losses.reduce((a, s) => a + Math.min(Number(s.outcome_60m) || 0, 0), 0)
    );
    const profitFactor = grossLoss ? grossWin / grossLoss : grossWin ? 99 : 0;
    const winRate = resolved ? (wins.length / resolved) * 100 : 0;

    return res.json({
      ok: true,
      window: windowParam,
      total_signals: rows.length,
      resolved,
      pending: 0,
      wins: wins.length,
      losses: losses.length,
      win_rate_60m: Number(winRate.toFixed(2)),
      avg_return: Number(avgReturn.toFixed(4)),
      profit_factor: Number(profitFactor.toFixed(2)),
      top_wins: [...wins].sort((a, b) => Number(b.outcome_60m) - Number(a.outcome_60m)).slice(0, 5),
      worst_losses: [...losses].sort((a, b) => Number(a.outcome_60m) - Number(b.outcome_60m)).slice(0, 5),
      recent_signals: rows.slice(0, 100),
      last_updated: new Date().toISOString()
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;