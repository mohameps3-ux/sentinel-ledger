"use strict";

const { getSupabase } = require("../lib/supabase");
const { getMarketData } = require("../services/marketData");

const RULE_ID_BY_SIGNAL = {
  whale_accumulation: "R01",
  liquidity_shock: "R02",
  cluster_buy: "R03",
  new_wallet_confidence: "R04",
  velocity_spike: "R05"
};

const SIGNAL_BY_RULE_ID = Object.fromEntries(Object.entries(RULE_ID_BY_SIGNAL).map(([signal, id]) => [id, signal]));
const ORACLE_TICK_MS = Math.max(60_000, Number(process.env.VALIDATION_ORACLE_TICK_MS || 5 * 60 * 1000));
const ORACLE_BATCH = Math.max(1, Math.min(200, Number(process.env.VALIDATION_ORACLE_BATCH || 80)));
const SUCCESS_THRESHOLD_60M = Number(process.env.VALIDATION_ORACLE_SUCCESS_60M || 0.05);
const DRAWDOWN_WARN_THRESHOLD = Number(process.env.VALIDATION_ORACLE_DRAWDOWN_WARN || -0.1);

let intervalRef = null;
let lastTickStartedAt = null;
let lastTickFinishedAt = null;
let lastStats = { examined: 0, updated5m: 0, updated15m: 0, updated60m: 0, performanceUpdated: 0, error: null };

function isEnabled() {
  return String(process.env.VALIDATION_ORACLE_ENABLED || "true").toLowerCase() !== "false";
}

function toIso(ms) {
  return new Date(ms).toISOString();
}

function asRuleId(signal) {
  return RULE_ID_BY_SIGNAL[String(signal || "").trim()] || null;
}

function primaryRuleId(score) {
  const signals = Array.isArray(score?.signals) ? score.signals : [];
  for (const signal of signals) {
    const ruleId = asRuleId(signal);
    if (ruleId) return ruleId;
  }
  return null;
}

function pctFromPrices(entry, later) {
  const e = Number(entry);
  const l = Number(later);
  if (!Number.isFinite(e) || e <= 0 || !Number.isFinite(l) || l <= 0) return null;
  return (l - e) / e;
}

function normalizeRegime(regime) {
  const r = String(regime || "unknown").toLowerCase();
  if (["bull", "trending", "trend", "uptrend"].includes(r)) return "bull";
  if (["crab", "calm", "ranging", "range", "sideways"].includes(r)) return "crab";
  if (["volatile", "chop", "chaos"].includes(r)) return "volatile";
  return "crab";
}

function weightedMovingAverage(previousAvg, outcome, totalSignals) {
  const total = Number(totalSignals);
  const oldAvg = Number(previousAvg);
  const next = Number(outcome);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(next)) return Number.isFinite(oldAvg) ? oldAvg : 0;
  if (total === 1 || !Number.isFinite(oldAvg)) return next;
  return ((oldAvg * (total - 1)) + next) / total;
}

function weightedAverageFromOrdered(values) {
  let avg = 0;
  let total = 0;
  for (const value of values) {
    const n = Number(value);
    if (!Number.isFinite(n)) continue;
    total += 1;
    avg = weightedMovingAverage(avg, n, total);
  }
  return total ? avg : 0;
}

function median(values) {
  const nums = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!nums.length) return 0;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

function average(values) {
  return weightedAverageFromOrdered(values);
}

function maxDrawdown(values) {
  let peak = 0;
  let equity = 0;
  let maxDd = 0;
  for (const value of values) {
    const n = Number(value);
    if (!Number.isFinite(n)) continue;
    equity += n;
    if (equity > peak) peak = equity;
    maxDd = Math.max(maxDd, peak - equity);
  }
  return maxDd;
}

async function safeSupabase() {
  try {
    return getSupabase();
  } catch (_) {
    return null;
  }
}

async function currentPrice(mint) {
  try {
    const market = await getMarketData(String(mint || ""));
    const price = Number(market?.price);
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch (_) {
    return null;
  }
}

function minObservedPrice(row, nextPrice) {
  const prices = [
    row?.price_at_signal,
    row?.price_5m,
    row?.price_15m,
    row?.price_60m,
    row?.min_price_observed,
    nextPrice
  ]
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);
  return prices.length ? Math.min(...prices) : null;
}

function buildRuleSnapshot(score, ctx, ruleId, price) {
  return {
    version: 1,
    ruleId,
    signal: SIGNAL_BY_RULE_ID[ruleId] || null,
    allSignals: Array.isArray(score?.signals) ? score.signals.slice(0, 12) : [],
    confidence: Number.isFinite(Number(score?.confidence)) ? Number(score.confidence) : null,
    confidenceLabel: score?.confidenceLabel || null,
    scores: score?.scores || null,
    walletsInvolved: Math.max(0, Math.round(Number(score?.meta?.uniqueWalletsInWindow || ctx.walletsInvolved || 0))),
    regime: normalizeRegime(score?.meta?.emissionGate?.regime?.key || ctx.regime),
    rawRegime: score?.meta?.emissionGate?.regime?.key || ctx.regime || "unknown",
    priceAtSignal: price,
    emissionGate: score?.meta?.emissionGate || null,
    alphaLayer: score?.meta?.alphaLayer || null,
    capturedAt: toIso(Date.now())
  };
}

async function recordOracleSignal(score, ctx = {}) {
  const ruleId = primaryRuleId(score);
  const mint = String(score?.asset || "").trim();
  if (!ruleId || !mint) return { ok: false, reason: "no_rule" };

  const price = Number(ctx.priceUsd ?? ctx.price_at_signal);
  if (!Number.isFinite(price) || price <= 0) return { ok: false, reason: "missing_price" };

  const supabase = await safeSupabase();
  if (!supabase) return { ok: false, reason: "supabase_unconfigured" };

  const signalId = String(score?.meta?.lastEventId || score?.id || "").trim() || null;
  const regime = normalizeRegime(score?.meta?.emissionGate?.regime?.key || ctx.regime);
  const row = {
    signal_id: signalId,
    mint,
    rule_id: ruleId,
    price_at_signal: price,
    min_price_observed: price,
    wallets_involved: Math.max(0, Math.round(Number(score?.meta?.uniqueWalletsInWindow || ctx.walletsInvolved || 0))),
    regime,
    rule_snapshot: buildRuleSnapshot(score, ctx, ruleId, price)
  };

  try {
    if (signalId) {
      const { data: existing, error: lookupError } = await supabase
        .from("signal_outcomes")
        .select("id")
        .eq("signal_id", signalId)
        .eq("rule_id", ruleId)
        .maybeSingle();
      if (!lookupError && existing?.id) return { ok: true, ruleId, dedupe: true };
    }
    const { error } = await supabase.from("signal_outcomes").insert(row);
    if (error) return { ok: false, reason: error.message || "insert_failed" };
    return { ok: true, ruleId };
  } catch (error) {
    return { ok: false, reason: error?.message || "insert_failed" };
  }
}

async function validateHorizon(supabase, horizonMin) {
  const priceCol = `price_${horizonMin}m`;
  const outcomeCol = `outcome_${horizonMin}m`;
  const cutoff = toIso(Date.now() - horizonMin * 60_000);
  const { data: rows, error } = await supabase
    .from("signal_outcomes")
    .select("id,mint,rule_id,price_at_signal,price_5m,price_15m,price_60m,min_price_observed,created_at")
    .is(priceCol, null)
    .lte("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(ORACLE_BATCH);
  if (error) return { examined: 0, updated: 0, rules: [], error: error.message || "query_failed" };

  let updated = 0;
  const rules = new Set();
  for (const row of rows || []) {
    const price = await currentPrice(row.mint);
    const outcome = pctFromPrices(row.price_at_signal, price);
    if (price == null || outcome == null) continue;
    const minPrice = minObservedPrice(row, price);
    const drawdown = pctFromPrices(row.price_at_signal, minPrice);
    const patch = {
      [priceCol]: price,
      [outcomeCol]: outcome,
      min_price_observed: minPrice,
      validated_at: toIso(Date.now())
    };
    if (horizonMin === 60) patch.validated = true;
    if ((horizonMin === 15 || horizonMin === 60) && drawdown != null && drawdown <= DRAWDOWN_WARN_THRESHOLD) {
      patch.validated_at = toIso(Date.now());
    }
    const { error: upErr } = await supabase.from("signal_outcomes").update(patch).eq("id", row.id);
    if (!upErr) {
      updated += 1;
      if (horizonMin === 60 && row.rule_id) rules.add(row.rule_id);
    }
  }
  return { examined: (rows || []).length, updated, rules: [...rules], error: null };
}

async function recomputeRulePerformance(supabase, ruleId) {
  const { data: rows, error } = await supabase
    .from("signal_outcomes")
    .select("rule_id,regime,outcome_5m,outcome_15m,outcome_60m,min_price_observed,price_at_signal,validated_at")
    .eq("rule_id", ruleId)
    .not("outcome_60m", "is", null)
    .order("created_at", { ascending: true })
    .limit(5000);
  if (error) return { ok: false, reason: error.message || "query_failed" };

  const resolved = rows || [];
  const total = resolved.length;
  const returns5 = resolved.map((r) => Number(r.outcome_5m)).filter(Number.isFinite);
  const returns15 = resolved.map((r) => Number(r.outcome_15m)).filter(Number.isFinite);
  const returns60 = resolved.map((r) => Number(r.outcome_60m)).filter(Number.isFinite);
  const success60 = returns60.filter((n) => n > SUCCESS_THRESHOLD_60M).length;
  const regimePerformance = buildRegimePerformance(resolved);
  const patch = {
    rule_id: ruleId,
    total_signals: total,
    success_count_5m: returns5.filter((n) => n > 0).length,
    success_count_15m: returns15.filter((n) => n > 0).length,
    success_count_60m: success60,
    avg_return_5m: average(returns5),
    avg_return_15m: average(returns15),
    avg_return_60m: average(returns60),
    median_return_60m: median(returns60),
    max_drawdown: Math.max(
      maxDrawdown(returns60),
      ...resolved.map((r) => Math.abs(Math.min(0, pctFromPrices(r.price_at_signal, r.min_price_observed) || 0)))
    ),
    confidence_score: total >= 10 ? success60 / total : 0,
    regime_performance: regimePerformance,
    last_validated: toIso(Date.now()),
    updated_at: toIso(Date.now())
  };
  const { error: upErr } = await supabase.from("rule_performance").upsert(patch, { onConflict: "rule_id" });
  if (upErr) return { ok: false, reason: upErr.message || "upsert_failed" };
  return { ok: true, total };
}

function buildRegimePerformance(rows) {
  const out = {};
  for (const regime of ["bull", "crab", "volatile"]) {
    const subset = rows.filter((r) => normalizeRegime(r.regime) === regime);
    const returns = subset.map((r) => Number(r.outcome_60m)).filter(Number.isFinite);
    const total = returns.length;
    const success = returns.filter((n) => n > SUCCESS_THRESHOLD_60M).length;
    out[regime] = {
      total,
      success,
      confidence: total >= 10 ? success / total : 0,
      avgReturn60m: average(returns),
      hasSample: total >= 10
    };
  }
  return out;
}

async function runValidationOracleTick() {
  if (!isEnabled()) return lastStats;
  const supabase = await safeSupabase();
  if (!supabase) {
    lastStats = { ...lastStats, error: "supabase_unconfigured" };
    return lastStats;
  }
  lastTickStartedAt = Date.now();
  try {
    const [r5, r15, r60] = await Promise.all([
      validateHorizon(supabase, 5),
      validateHorizon(supabase, 15),
      validateHorizon(supabase, 60)
    ]);
    const rules = [...new Set([...(r60.rules || [])])];
    let performanceUpdated = 0;
    for (const ruleId of rules) {
      const out = await recomputeRulePerformance(supabase, ruleId);
      if (out.ok) performanceUpdated += 1;
    }
    lastStats = {
      examined: Number(r5.examined || 0) + Number(r15.examined || 0) + Number(r60.examined || 0),
      updated5m: Number(r5.updated || 0),
      updated15m: Number(r15.updated || 0),
      updated60m: Number(r60.updated || 0),
      performanceUpdated,
      error: r5.error || r15.error || r60.error || null
    };
  } catch (error) {
    lastStats = { ...lastStats, error: error?.message || "tick_failed" };
  } finally {
    lastTickFinishedAt = Date.now();
  }
  return lastStats;
}

function startValidationOracle() {
  if (intervalRef) return;
  if (!isEnabled()) {
    console.log("Validation Oracle disabled via VALIDATION_ORACLE_ENABLED=false");
    return;
  }
  runValidationOracleTick().catch((e) => console.warn("[validation-oracle] bootstrap:", e?.message || e));
  intervalRef = setInterval(() => {
    runValidationOracleTick().catch((e) => console.warn("[validation-oracle] tick:", e?.message || e));
  }, ORACLE_TICK_MS);
  if (intervalRef && typeof intervalRef.unref === "function") intervalRef.unref();
}

function getValidationOracleStatus() {
  return {
    shadowMode: true,
    cronEnabled: isEnabled(),
    tickIntervalMs: ORACLE_TICK_MS,
    lastTickStartedAt,
    lastTickFinishedAt,
    lastTickDurationMs:
      lastTickStartedAt && lastTickFinishedAt ? lastTickFinishedAt - lastTickStartedAt : null,
    lastStats
  };
}

async function listRulePerformance({ limit = 100 } = {}) {
  const supabase = await safeSupabase();
  if (!supabase) return { ok: false, rows: [], reason: "supabase_unconfigured" };
  const lim = Math.max(1, Math.min(500, Number(limit) || 100));
  const { data, error } = await supabase
    .from("rule_performance")
    .select("*")
    .order("total_signals", { ascending: false })
    .limit(lim);
  if (error) return { ok: false, rows: [], reason: error.message || "query_failed" };
  return { ok: true, rows: data || [], status: getValidationOracleStatus() };
}

async function getRulePerformanceMap(ruleIds = []) {
  const ids = [...new Set(ruleIds.map((id) => String(id || "").trim()).filter(Boolean))];
  if (!ids.length) return new Map();
  const supabase = await safeSupabase();
  if (!supabase) return new Map();
  const { data, error } = await supabase.from("rule_performance").select("*").in("rule_id", ids);
  if (error) return new Map();
  return new Map((data || []).map((row) => [row.rule_id, formatRulePerformance(row)]));
}

async function getLatestRulePerformanceForMint(mint) {
  const supabase = await safeSupabase();
  if (!supabase) return null;
  const { data: latest, error } = await supabase
    .from("signal_outcomes")
    .select("rule_id,created_at,outcome_60m,min_price_observed,price_at_signal,regime")
    .eq("mint", mint)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !latest?.rule_id) return null;
  const map = await getRulePerformanceMap([latest.rule_id]);
  const perf = map.get(latest.rule_id) || formatRulePerformance({ rule_id: latest.rule_id, total_signals: 0 });
  return attachLatestOutcome(perf, latest);
}

function formatRulePerformance(row) {
  if (!row?.rule_id) return null;
  const total = Number(row.total_signals || 0);
  const confidence = Number(row.confidence_score || 0);
  const avg60 = Number(row.avg_return_60m || 0);
  const regimePerformance = row.regime_performance && typeof row.regime_performance === "object" ? row.regime_performance : {};
  const regimeContext = summarizeRegimeContext(regimePerformance);
  return {
    ruleId: row.rule_id,
    signal: SIGNAL_BY_RULE_ID[row.rule_id] || null,
    totalSignals: total,
    successCount60m: Number(row.success_count_60m || 0),
    confidenceScore: Number.isFinite(confidence) ? confidence : 0,
    avgReturn60m: Number.isFinite(avg60) ? avg60 : 0,
    medianReturn60m: Number(row.median_return_60m || 0),
    maxDrawdown: Number(row.max_drawdown || 0),
    regimePerformance,
    regimeContext,
    hasSample: total >= 10
  };
}

function summarizeRegimeContext(regimePerformance = {}) {
  const entries = ["bull", "crab", "volatile"]
    .map((regime) => {
      const row = regimePerformance?.[regime] || {};
      return {
        regime,
        total: Number(row.total || 0),
        confidence: Number(row.confidence || 0),
        hasSample: Boolean(row.hasSample) || Number(row.total || 0) >= 10
      };
    })
    .filter((r) => r.hasSample);
  if (!entries.length) return null;
  entries.sort((a, b) => b.confidence - a.confidence);
  const best = entries[0];
  const others = entries.slice(1);
  if (entries.length === 1) {
    if (best.regime === "bull") return "Bull market only";
    if (best.regime === "volatile") return "Volatility only";
    if (best.regime === "crab") return "Ranging markets only";
  }
  if (best.regime === "bull" && best.confidence >= 0.6 && others.some((r) => r.confidence < 0.55)) {
    return "Bull market only";
  }
  if (best.regime === "volatile" && best.confidence >= 0.6 && others.some((r) => r.confidence < 0.55)) {
    return "Volatility only";
  }
  if (best.regime === "crab" && best.confidence >= 0.6 && others.some((r) => r.confidence < 0.55)) {
    return "Ranging markets only";
  }
  return `${best.regime} edge`;
}

function attachLatestOutcome(perf, latest) {
  if (!perf) return perf;
  const drawdown = pctFromPrices(latest?.price_at_signal, latest?.min_price_observed);
  return {
    ...perf,
    currentRegime: normalizeRegime(latest?.regime),
    latestOutcome:
      latest?.outcome_60m != null || drawdown != null
        ? {
            outcome60m: latest?.outcome_60m != null ? Number(latest.outcome_60m) : null,
            drawdown: drawdown != null ? drawdown : null,
            minPriceObserved: latest?.min_price_observed != null ? Number(latest.min_price_observed) : null
          }
        : null
  };
}

module.exports = {
  RULE_ID_BY_SIGNAL,
  asRuleId,
  primaryRuleId,
  recordOracleSignal,
  runValidationOracleTick,
  startValidationOracle,
  getValidationOracleStatus,
  listRulePerformance,
  getRulePerformanceMap,
  getLatestRulePerformanceForMint,
  formatRulePerformance
};
