"use strict";

const { getSupabase } = require("../lib/supabase");
const { getMarketData } = require("./marketData");

const DEFAULT_HORIZON_MIN = Number(process.env.SIGNAL_PERF_HORIZON_MIN || 10);
const SUCCESS_MIN_PCT = Number(process.env.SIGNAL_PERF_SUCCESS_MIN_PCT || 1.0);
const RESOLVE_MAX_ATTEMPTS = Number(process.env.SIGNAL_PERF_MAX_ATTEMPTS || 12);

function clampInt(n, min, max, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(v)));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toIso(ms) {
  return new Date(ms).toISOString();
}

function pctFromPrices(entry, later) {
  const e = Number(entry);
  const l = Number(later);
  if (!Number.isFinite(e) || e <= 0 || !Number.isFinite(l)) return null;
  return Math.round(((l - e) / e) * 1e6) / 1e4;
}

function normalizeScorePayload(score) {
  if (!score || typeof score !== "object") return null;
  const asset = String(score.asset || "").trim();
  if (!asset) return null;
  const emittedAtMs = Number.isFinite(Date.parse(score.timestamp))
    ? Date.parse(score.timestamp)
    : Date.now();
  const confidence = Number(score.confidence);
  return {
    asset,
    emittedAtMs,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(100, confidence)) : null,
    signals: asArray(score.signals).map((s) => String(s)).slice(0, 16),
    insights: asArray(score.insights).map((s) => String(s)).slice(0, 16),
    eventId: String(score?.meta?.lastEventId || "").trim() || null
  };
}

/** Best-effort columns for regime / gate observability (requires migration 011). */
function emissionArchiveFromScore(score) {
  const eg = score?.meta?.emissionGate;
  if (!eg || typeof eg !== "object") {
    return { emission_regime: null, emission_gate: null };
  }
  const rk = eg.regime && typeof eg.regime === "object" ? String(eg.regime.key || "").trim() : "";
  const emission_regime = rk ? rk.slice(0, 32) : null;
  const unifiedScore = Number(eg.unifiedScore);
  const emission_gate = {
    unifiedScore: Number.isFinite(unifiedScore) ? Number(unifiedScore.toFixed(4)) : null,
    components: eg.components && typeof eg.components === "object" ? eg.components : null,
    regime: eg.regime && typeof eg.regime === "object" ? eg.regime : null,
    effectiveGate: eg.effectiveGate && typeof eg.effectiveGate === "object" ? eg.effectiveGate : null
  };
  return { emission_regime, emission_gate };
}

/**
 * Records a signal-outcome candidate at emission time. Best effort by design:
 * no throw, no back-pressure into webhook path.
 */
async function recordSignalEmission(score, extra = {}) {
  const payload = normalizeScorePayload(score);
  if (!payload) return { ok: false, reason: "invalid_payload" };
  let supabase;
  try {
    supabase = getSupabase();
  } catch (_) {
    return { ok: false, reason: "supabase_unconfigured" };
  }

  const horizonMin = clampInt(extra.horizonMin || DEFAULT_HORIZON_MIN, 1, 240, 10);
  let entryPriceUsd = null;
  try {
    const market = await getMarketData(payload.asset);
    const p = Number(market?.price);
    if (Number.isFinite(p) && p > 0) entryPriceUsd = p;
  } catch (_) {
    entryPriceUsd = null;
  }

  const { emission_regime, emission_gate } = emissionArchiveFromScore(score);
  const row = {
    asset: payload.asset,
    event_id: payload.eventId,
    emitted_at: toIso(payload.emittedAtMs),
    resolve_after: toIso(payload.emittedAtMs + horizonMin * 60_000),
    horizon_min: horizonMin,
    confidence: payload.confidence,
    signals: payload.signals,
    insights: payload.insights,
    entry_price_usd: entryPriceUsd,
    emission_regime,
    emission_gate,
    status: "pending",
    attempts: 0
  };

  try {
    // Idempotent on event_id when present. If event_id is null, inserts a new row.
    if (row.event_id) {
      const { error } = await supabase
        .from("signal_performance")
        .upsert(row, { onConflict: "event_id", ignoreDuplicates: true });
      if (error) return { ok: false, reason: error.message || "insert_failed" };
      return { ok: true, dedupe: true };
    }
    const { error } = await supabase.from("signal_performance").insert(row);
    if (error) return { ok: false, reason: error.message || "insert_failed" };
    return { ok: true, dedupe: false };
  } catch (e) {
    return { ok: false, reason: e?.message || "insert_failed" };
  }
}

/**
 * Resolves pending outcomes due at T+N using the same market source already in use.
 */
async function runSignalOutcomeResolutionOnce(options = {}) {
  let supabase;
  try {
    supabase = getSupabase();
  } catch (_) {
    return { examined: 0, resolved: 0, deferred: 0, failed: 0, error: "supabase_unconfigured" };
  }
  const batch = clampInt(options.batch || process.env.SIGNAL_PERF_RESOLVE_BATCH || 60, 1, 300, 60);
  const nowIso = toIso(Date.now());

  const { data: rows, error } = await supabase
    .from("signal_performance")
    .select(
      "id,asset,event_id,emitted_at,resolve_after,horizon_min,confidence,signals,entry_price_usd,status,attempts"
    )
    .eq("status", "pending")
    .lte("resolve_after", nowIso)
    .order("resolve_after", { ascending: true })
    .limit(batch);
  if (error) {
    return { examined: 0, resolved: 0, deferred: 0, failed: 0, error: error.message || "query_failed" };
  }

  let resolved = 0;
  let deferred = 0;
  let failed = 0;

  for (const row of rows || []) {
    const attempts = clampInt(row.attempts, 0, 1000, 0) + 1;
    const entry = Number(row.entry_price_usd);
    if (!Number.isFinite(entry) || entry <= 0) {
      const next = attempts >= RESOLVE_MAX_ATTEMPTS ? "failed" : "pending";
      const update = {
        attempts,
        status: next,
        failure_reason: "missing_entry_price",
        updated_at: toIso(Date.now())
      };
      if (next === "pending") {
        update.resolve_after = toIso(Date.now() + 2 * 60_000);
        deferred += 1;
      } else {
        update.resolved_at = toIso(Date.now());
        failed += 1;
      }
      await supabase.from("signal_performance").update(update).eq("id", row.id);
      continue;
    }

    let outcomePrice = null;
    try {
      const market = await getMarketData(String(row.asset || ""));
      const p = Number(market?.price);
      if (Number.isFinite(p) && p > 0) outcomePrice = p;
    } catch (_) {
      outcomePrice = null;
    }

    if (outcomePrice == null) {
      const next = attempts >= RESOLVE_MAX_ATTEMPTS ? "failed" : "pending";
      const update = {
        attempts,
        status: next,
        failure_reason: "missing_outcome_price",
        updated_at: toIso(Date.now())
      };
      if (next === "pending") {
        update.resolve_after = toIso(Date.now() + 2 * 60_000);
        deferred += 1;
      } else {
        update.resolved_at = toIso(Date.now());
        failed += 1;
      }
      await supabase.from("signal_performance").update(update).eq("id", row.id);
      continue;
    }

    const outcomePct = pctFromPrices(entry, outcomePrice);
    const isSuccess = Number.isFinite(outcomePct) && outcomePct >= SUCCESS_MIN_PCT;
    const { error: upErr } = await supabase
      .from("signal_performance")
      .update({
        attempts,
        status: "resolved",
        outcome_price_usd: outcomePrice,
        outcome_pct: outcomePct,
        success: isSuccess,
        resolved_at: toIso(Date.now()),
        updated_at: toIso(Date.now()),
        failure_reason: null
      })
      .eq("id", row.id);
    if (upErr) {
      deferred += 1;
      continue;
    }
    resolved += 1;
  }

  return { examined: (rows || []).length, resolved, deferred, failed, error: null };
}

function computeRegimeOutcomeBlock(regimeRows) {
  if (!Array.isArray(regimeRows) || regimeRows.length === 0) return null;
  const wins = regimeRows.filter((r) => Number(r.outcome_pct) >= SUCCESS_MIN_PCT);
  const losses = regimeRows.filter((r) => Number(r.outcome_pct) < SUCCESS_MIN_PCT);
  const sumWin = wins.reduce((a, r) => a + Number(r.outcome_pct), 0);
  const sumLossAbs = losses.reduce((a, r) => a + Math.abs(Number(r.outcome_pct)), 0);
  const profitFactor = sumLossAbs > 0 ? sumWin / sumLossAbs : wins.length ? 999 : 0;
  let peak = 0;
  let equity = 0;
  let maxDd = 0;
  for (const r of regimeRows) {
    equity += Number(r.outcome_pct);
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDd) maxDd = dd;
  }
  const total = regimeRows.length;
  const winRate = total ? (wins.length / total) * 100 : 0;
  const totalRet = regimeRows.reduce((a, r) => a + Number(r.outcome_pct), 0);
  return {
    total,
    winRatePct: Math.round(winRate * 100) / 100,
    avgOutcomePct: Math.round((totalRet / total) * 1e4) / 1e4,
    profitFactor: Math.round(profitFactor * 1e4) / 1e4,
    maxDrawdownPct: Math.round(maxDd * 1e4) / 1e4
  };
}

function pearson(xs, ys) {
  if (!Array.isArray(xs) || !Array.isArray(ys)) return null;
  if (xs.length !== ys.length || xs.length < 2) return null;
  const n = xs.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;
  for (let i = 0; i < n; i += 1) {
    const x = Number(xs[i]);
    const y = Number(ys[i]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
    sumY2 += y * y;
  }
  const num = n * sumXY - sumX * sumY;
  const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
  return Math.round((num / den) * 1e4) / 1e4;
}

async function getSignalPerformanceSummary(options = {}) {
  let supabase;
  try {
    supabase = getSupabase();
  } catch (_) {
    return { ok: false, error: "supabase_unconfigured" };
  }
  const lookbackHours = clampInt(options.lookbackHours || 48, 1, 24 * 30, 48);
  const maxRows = clampInt(options.maxRows || 2000, 50, 5000, 2000);
  const sinceIso = toIso(Date.now() - lookbackHours * 60 * 60 * 1000);

  const { data: rows, error } = await supabase
    .from("signal_performance")
    .select(
      "asset,emitted_at,resolved_at,confidence,signals,entry_price_usd,outcome_price_usd,outcome_pct,success,status,failure_reason,emission_regime"
    )
    .gte("emitted_at", sinceIso)
    .order("emitted_at", { ascending: true })
    .limit(maxRows);
  if (error) return { ok: false, error: error.message || "query_failed" };

  const all = rows || [];
  const resolved = all.filter((r) => r.status === "resolved" && Number.isFinite(Number(r.outcome_pct)));
  const wins = resolved.filter((r) => Number(r.outcome_pct) >= SUCCESS_MIN_PCT);
  const losses = resolved.filter((r) => Number(r.outcome_pct) < SUCCESS_MIN_PCT);
  const sumWin = wins.reduce((a, r) => a + Number(r.outcome_pct), 0);
  const sumLossAbs = losses.reduce((a, r) => a + Math.abs(Number(r.outcome_pct)), 0);
  const totalRet = resolved.reduce((a, r) => a + Number(r.outcome_pct), 0);
  const avgRet = resolved.length ? totalRet / resolved.length : 0;
  const winRate = resolved.length ? (wins.length / resolved.length) * 100 : 0;
  const profitFactor = sumLossAbs > 0 ? sumWin / sumLossAbs : wins.length ? 999 : 0;

  // Max drawdown over cumulative outcome pct (simple equity proxy).
  let peak = 0;
  let equity = 0;
  let maxDd = 0;
  for (const r of resolved) {
    equity += Number(r.outcome_pct);
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDd) maxDd = dd;
  }

  // Conditional stats per signal tag.
  const bySignal = new Map();
  for (const r of resolved) {
    const out = Number(r.outcome_pct);
    const tags = asArray(r.signals).map((s) => String(s)).slice(0, 12);
    for (const tag of tags) {
      const cur = bySignal.get(tag) || { signal: tag, total: 0, wins: 0, sumPct: 0 };
      cur.total += 1;
      if (out >= SUCCESS_MIN_PCT) cur.wins += 1;
      cur.sumPct += out;
      bySignal.set(tag, cur);
    }
  }
  const signalStats = [...bySignal.values()]
    .map((x) => ({
      signal: x.signal,
      total: x.total,
      winRatePct: x.total ? Math.round((x.wins / x.total) * 10000) / 100 : 0,
      avgOutcomePct: x.total ? Math.round((x.sumPct / x.total) * 1e4) / 1e4 : 0
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 20);

  // Pairwise conditional stats: E[R | signalA + signalB]
  const byCombo = new Map();
  for (const r of resolved) {
    const out = Number(r.outcome_pct);
    const tags = [...new Set(asArray(r.signals).map((s) => String(s)).slice(0, 12))].sort();
    for (let i = 0; i < tags.length; i += 1) {
      for (let j = i + 1; j < tags.length; j += 1) {
        const key = `${tags[i]}+${tags[j]}`;
        const cur = byCombo.get(key) || { combo: key, total: 0, wins: 0, sumPct: 0 };
        cur.total += 1;
        if (out >= SUCCESS_MIN_PCT) cur.wins += 1;
        cur.sumPct += out;
        byCombo.set(key, cur);
      }
    }
  }
  const comboStats = [...byCombo.values()]
    .map((x) => ({
      combo: x.combo,
      total: x.total,
      winRatePct: x.total ? Math.round((x.wins / x.total) * 10000) / 100 : 0,
      avgOutcomePct: x.total ? Math.round((x.sumPct / x.total) * 1e4) / 1e4 : 0
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 20);

  const rowsByRegime = new Map();
  for (const r of resolved) {
    const raw = r.emission_regime;
    const reg =
      raw != null && String(raw).trim() !== "" ? String(raw).trim().slice(0, 32) : "legacy";
    const list = rowsByRegime.get(reg) || [];
    list.push(r);
    rowsByRegime.set(reg, list);
  }
  const regimeStats = [...rowsByRegime.entries()]
    .map(([regime, regimeRows]) => {
      const block = computeRegimeOutcomeBlock(regimeRows);
      return block ? { regime, ...block } : { regime, total: 0, winRatePct: 0, avgOutcomePct: 0, profitFactor: 0, maxDrawdownPct: 0 };
    })
    .sort((a, b) => b.total - a.total);

  const corr = pearson(
    resolved.map((r) => Number(r.confidence)),
    resolved.map((r) => Number(r.outcome_pct))
  );

  const statusBreakdown = { pending: 0, resolved: 0, failed: 0, other: 0 };
  const failedReasons = new Map();
  let pendingMissingEntryPrice = 0;
  let resolvedIncompleteOutcome = 0;
  for (const r of all) {
    const st = String(r.status || "");
    if (st === "pending") {
      statusBreakdown.pending += 1;
      const e = Number(r.entry_price_usd);
      if (!Number.isFinite(e) || e <= 0) pendingMissingEntryPrice += 1;
    } else if (st === "resolved") {
      statusBreakdown.resolved += 1;
      if (!Number.isFinite(Number(r.outcome_pct))) resolvedIncompleteOutcome += 1;
    } else if (st === "failed") {
      statusBreakdown.failed += 1;
      const fr = r.failure_reason ? String(r.failure_reason) : "(no_reason)";
      failedReasons.set(fr, (failedReasons.get(fr) || 0) + 1);
    } else {
      statusBreakdown.other += 1;
    }
  }
  const failedReasonTop = [...failedReasons.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([reason, count]) => ({ reason, count }));

  return {
    ok: true,
    lookbackHours,
    sampledRows: all.length,
    resolvedRows: resolved.length,
    pendingRows: all.filter((r) => r.status === "pending").length,
    failedRows: all.filter((r) => r.status === "failed").length,
    diagnostics: {
      hitSampleLimit: all.length >= maxRows,
      statusBreakdown,
      resolvedIncompleteOutcome,
      pendingMissingEntryPrice,
      failedReasonTop,
      defaultHorizonMin: DEFAULT_HORIZON_MIN
    },
    metrics: {
      winRatePct: Math.round(winRate * 100) / 100,
      avgOutcomePct: Math.round(avgRet * 1e4) / 1e4,
      profitFactor: Math.round(profitFactor * 1e4) / 1e4,
      maxDrawdownPct: Math.round(maxDd * 1e4) / 1e4,
      confidenceReturnCorrelation: corr
    },
    signals: signalStats,
    combos: comboStats,
    regimes: regimeStats
  };
}

module.exports = {
  recordSignalEmission,
  runSignalOutcomeResolutionOnce,
  getSignalPerformanceSummary,
  pctFromPrices
};

