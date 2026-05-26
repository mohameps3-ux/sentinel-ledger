"use strict";

const { getSupabase } = require("../lib/supabase");
const { getMarketData } = require("./marketData");
const { isSystemMint } = require("../lib/systemMints");
const { shouldKillSignal } = require("./signalEmissionGate");
const { resolveBaseSentinelScoreAtEmission } = require("./signalCardScore");

// Lazy-require to avoid circular dep — autoDiscovery has no dep on signalPerformance.
function getAutoDiscovery() {
  try { return require("../workers/autoDiscovery"); } catch (_) { return null; }
}

function getWalletBehaviorMemory() {
  try { return require("./walletBehaviorMemory"); } catch (_) { return null; }
}

/** After a signal resolves, refresh behavior memory for wallets that touched the mint. */
async function queueBehaviorRefreshForMint(supabase, mint, timestampIso) {
  if (!mint || !supabase) return;
  const wbm = getWalletBehaviorMemory();
  if (!wbm?.requestWalletBehaviorRefresh) return;
  const center = Date.parse(timestampIso);
  const fromIso = Number.isFinite(center)
    ? new Date(center - 90 * 60_000).toISOString()
    : new Date(Date.now() - 90 * 60_000).toISOString();
  const toIsoValue = Number.isFinite(center)
    ? new Date(center + 90 * 60_000).toISOString()
    : new Date().toISOString();
  try {
    const { data } = await supabase
      .from("smart_wallet_signals")
      .select("wallet_address")
      .eq("token_address", mint)
      .gte("created_at", fromIso)
      .lte("created_at", toIsoValue)
      .limit(40);
    for (const sigRow of data || []) {
      wbm.requestWalletBehaviorRefresh(sigRow.wallet_address);
    }
  } catch (_) {
    // Non-fatal — next cron tick will still refresh top winners.
  }
}

// Map signal tag → rule ID (mirrors validationOracle.RULE_ID_BY_SIGNAL).
const RULE_ID_BY_SIGNAL = {
  whale_accumulation: "R01",
  liquidity_shock: "R02",
  cluster_buy: "R03",
  cluster_probing: "R03",
  new_wallet_confidence: "R04",
  velocity_spike: "R05"
};
function primaryRuleIdFromSignals(signals) {
  for (const tag of (Array.isArray(signals) ? signals : [])) {
    const rid = RULE_ID_BY_SIGNAL[String(tag || "").trim()];
    if (rid) return rid;
  }
  return null;
}

const DEFAULT_HORIZON_MIN = Number(process.env.SIGNAL_PERF_HORIZON_MIN || 10);
const SUCCESS_MIN_PCT = Number(process.env.SIGNAL_PERF_SUCCESS_MIN_PCT || 1.0);
const WINSORIZE_CAP_PCT = Math.max(0, Number(process.env.SIGNAL_PERF_WINSORIZE_CAP_PCT ?? 200));
const RESOLVE_MAX_ATTEMPTS = Number(process.env.SIGNAL_PERF_MAX_ATTEMPTS || 12);
const KILL_SWITCH_MAX_LOSS = Number(process.env.KILL_SWITCH_MAX_LOSS_PCT || 0.1);
const KILL_OUTCOME_PCT = Number(process.env.KILL_SWITCH_OUTCOME_PCT || -10);
const KILL_SWEEP_LOOKBACK_HOURS = Number(process.env.KILL_SWITCH_SWEEP_LOOKBACK_HOURS || 72);

/** Clip magnitude for aggregate metrics only; raw outcome_pct in DB unchanged. */
function winsorizeOutcomePct(pct) {
  const n = Number(pct);
  if (!Number.isFinite(n)) return 0;
  if (WINSORIZE_CAP_PCT <= 0) return n;
  if (n > WINSORIZE_CAP_PCT) return WINSORIZE_CAP_PCT;
  if (n < -WINSORIZE_CAP_PCT) return -WINSORIZE_CAP_PCT;
  return n;
}

function clampInt(n, min, max, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(v)));
}

const KILL_SWEEP_BATCH = clampInt(process.env.KILL_SWITCH_SWEEP_BATCH || 80, 1, 300, 80);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toIso(ms) {
  return new Date(ms).toISOString();
}

/**
 * Track record reads `signal_outcomes`. Cron resolves `signal_performance`; this syncs outcomes and
 * **inserts** a ledger row when emission-time `recordOracleSignal` missed (price/rule race).
 * `outcome_pct` is **percent** (5.2 = 5.2%); `outcome_60m` is fractional (0.052).
 */
async function syncSignalOutcomesFromPerformanceRow(supabase, perfRow, { outcomePriceUsd, outcomePctPercent, validatedAtIso }) {
  const eventId = perfRow?.event_id != null ? String(perfRow.event_id).trim() : "";
  const asset = String(perfRow?.asset || "").trim();
  if (!eventId || !asset || !supabase) return;

  const pctNum = Number(outcomePctPercent);
  if (!Number.isFinite(pctNum)) return;
  const outcomeFrac = pctNum / 100;

  const price60 = Number(outcomePriceUsd);
  if (!Number.isFinite(price60) || price60 <= 0) return;

  const entry = Number(perfRow.entry_price_usd);
  const minObs = Number.isFinite(entry) && entry > 0 ? Math.min(entry, price60) : null;

  const { asRuleId } = require("../workers/validationOracle");
  const sigs = Array.isArray(perfRow.signals) ? perfRow.signals : [];
  let ruleId = null;
  for (const s of sigs) {
    ruleId = asRuleId(s);
    if (ruleId) break;
  }
  if (!ruleId) ruleId = "R03";

  const { data: existing, error: selErr } = await supabase
    .from("signal_outcomes")
    .select("id,rule_id")
    .eq("signal_id", eventId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (selErr) return;

  const patch = {
    price_60m: price60,
    outcome_60m: outcomeFrac,
    validated_at: validatedAtIso,
    validated: true
  };
  if (minObs != null && Number.isFinite(minObs)) {
    patch.min_price_observed = minObs;
  }

  if (!existing?.id) {
    const priceAtSignal = Number.isFinite(entry) && entry > 0 ? entry : price60;
    const ins = {
      signal_id: eventId,
      mint: asset,
      rule_id: ruleId,
      price_at_signal: priceAtSignal,
      wallets_involved: 0,
      regime: "crab",
      rule_snapshot: { version: 1, ruleId, source: "signal_performance_resolution" },
      ...patch
    };
    const { error: insErr } = await supabase.from("signal_outcomes").insert(ins);
    if (insErr) {
      console.warn("[signal-perf] ledger insert from resolution:", insErr.message || insErr);
      return;
    }
  } else {
    const { error: upErr } = await supabase.from("signal_outcomes").update(patch).eq("id", existing.id);
    if (upErr) return;
  }

  try {
    const { scheduleTrackRecordLedgerLive } = require("./trackRecordLive");
    scheduleTrackRecordLedgerLive("signal_performance_sync");
  } catch (_) {
    /* non-fatal */
  }

  const ridForRule = existing?.rule_id || ruleId;
  try {
    const { recomputeRulePerformance } = require("../workers/validationOracle");
    if (ridForRule) await recomputeRulePerformance(supabase, ridForRule);
  } catch (_) {
    /* best-effort — rule_performance refresh */
  }
}

/** After `signal_performance` row is written, ensure validation-oracle ledger row exists (retries price). */
async function reconcileTrackRecordLedgerAfterEmission(score, entryPriceUsd, assetMint) {
  let priceUsd = Number(entryPriceUsd);
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
    try {
      const market = await getMarketData(String(assetMint || ""));
      const p = Number(market?.price);
      if (Number.isFinite(p) && p > 0) priceUsd = p;
    } catch (_) {
      /* non-fatal */
    }
  }
  try {
    const { recordOracleSignal } = require("../workers/validationOracle");
    const out = await recordOracleSignal(score, {
      priceUsd,
      walletsInvolved: score?.meta?.uniqueWalletsInWindow,
      regime: score?.meta?.emissionGate?.regime?.key
    });
    if (out && out.ok === false && process.env.NODE_ENV !== "production") {
      console.warn("[signal-perf] recordOracleSignal after emission:", out.reason);
    }
  } catch (e) {
    console.warn("[signal-perf] recordOracleSignal after emission failed:", e?.message || e);
  }
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
  const al = score?.meta?.alphaLayer;
  const alphaSnapshot =
    al && typeof al === "object"
      ? {
          version: al.version,
          evProxy: al.evProxy,
          slippageRisk: al.slippageRisk,
          calibratedConfidence: al.calibratedConfidence,
          metaLabel: al.metaLabel,
          lateClusterScore: al.lateClusterScore
        }
      : null;
  const emission_gate = {
    unifiedScore: Number.isFinite(unifiedScore) ? Number(unifiedScore.toFixed(4)) : null,
    components: eg.components && typeof eg.components === "object" ? eg.components : null,
    regime: eg.regime && typeof eg.regime === "object" ? eg.regime : null,
    effectiveGate: eg.effectiveGate && typeof eg.effectiveGate === "object" ? eg.effectiveGate : null,
    alphaLayer: alphaSnapshot
  };
  return { emission_regime, emission_gate };
}

/**
 * Records a signal-outcome candidate at emission time. Best effort by design:
 * no throw, no back-pressure into webhook path.
 *
 * @param {object} score
 * @param {object} [extra]
 * @param {number} [extra.horizonMin]
 * @param {string[]} [extra.walletAddresses] — real wallet pubkeys for sentinel_score at emit
 */
async function recordSignalEmission(score, extra = {}) {
  const payload = normalizeScorePayload(score);
  if (!payload) return { ok: false, reason: "invalid_payload" };
  // Defense-in-depth: never persist outcomes for quote-side / system mints
  // (WSOL, USDC, USDT...). They distort rule_performance learning.
  if (isSystemMint(payload.asset)) return { ok: false, reason: "system_mint" };
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

  const { emission_regime, emission_gate: gateBase } = emissionArchiveFromScore(score);
  const riskKillSwitch = {
    stop_loss_pct: 0.1,
    max_lifetime_min: 60,
    kill_switch_enabled: true
  };
  const emission_gate =
    gateBase && typeof gateBase === "object"
      ? { ...gateBase, killSwitch: riskKillSwitch }
      : { killSwitch: riskKillSwitch };

  let sentinel_score = null;
  try {
    const base = await resolveBaseSentinelScoreAtEmission(supabase, score, extra.walletAddresses);
    if (Number.isFinite(base)) sentinel_score = base;
  } catch (err) {
    console.warn("[signal-perf] sentinel_score compute failed:", payload.asset, err?.message || err);
  }

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
    sentinel_score,
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
    } else {
      const { error } = await supabase.from("signal_performance").insert(row);
      if (error) return { ok: false, reason: error.message || "insert_failed" };
    }
    void reconcileTrackRecordLedgerAfterEmission(score, entryPriceUsd, payload.asset);
    return { ok: true, dedupe: !!row.event_id };
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
    return { examined: 0, resolved: 0, deferred: 0, failed: 0, killed: 0, error: "supabase_unconfigured" };
  }
  const batch = clampInt(options.batch || process.env.SIGNAL_PERF_RESOLVE_BATCH || 60, 1, 300, 60);
  const nowMs = Date.now();
  const nowIso = toIso(nowMs);
  let killed = 0;

  const lookbackIso = toIso(nowMs - Math.max(1, KILL_SWEEP_LOOKBACK_HOURS) * 3600_000);
  const { data: earlyRows, error: earlyErr } = await supabase
    .from("signal_performance")
    .select("id,asset,event_id,signals,entry_price_usd,attempts,resolve_after,emitted_at,status")
    .eq("status", "pending")
    .gt("resolve_after", nowIso)
    .gte("emitted_at", lookbackIso)
    .order("emitted_at", { ascending: true })
    .limit(KILL_SWEEP_BATCH);
  if (!earlyErr && Array.isArray(earlyRows) && earlyRows.length > 0) {
    for (const row of earlyRows) {
      const entry = Number(row.entry_price_usd);
      if (!Number.isFinite(entry) || entry <= 0) continue;
      let px = null;
      try {
        const market = await getMarketData(String(row.asset || ""));
        const p = Number(market?.price);
        if (Number.isFinite(p) && p > 0) px = p;
      } catch (_) {
        px = null;
      }
      if (px == null) continue;
      if (!shouldKillSignal({ entryPrice: entry, currentPrice: px, maxLossPct: KILL_SWITCH_MAX_LOSS })) continue;
      const attempts = clampInt(row.attempts, 0, 1000, 0) + 1;
      const { error: killErr } = await supabase
        .from("signal_performance")
        .update({
          attempts,
          status: "killed",
          outcome_price_usd: px,
          outcome_pct: KILL_OUTCOME_PCT,
          success: false,
          resolved_at: nowIso,
          updated_at: nowIso,
          failure_reason: "stop_loss_hit"
        })
        .eq("id", row.id)
        .eq("status", "pending");
      if (!killErr) {
        killed += 1;
        await syncSignalOutcomesFromPerformanceRow(supabase, row, {
          outcomePriceUsd: px,
          outcomePctPercent: KILL_OUTCOME_PCT,
          validatedAtIso: nowIso
        });
      }
    }
  }

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
    return { examined: 0, resolved: 0, deferred: 0, failed: 0, killed, error: error.message || "query_failed" };
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

    // Learning loop: recompute wallet_behavior_stats for wallets on this mint.
    setImmediate(() => {
      queueBehaviorRefreshForMint(supabase, row.asset, row.emitted_at).catch(() => {});
    });

    // Trigger wallet auto-discovery for every WIN (≥1%) — fire-and-forget.
    if (isSuccess) {
      const ad = getAutoDiscovery();
      if (ad?.discoverFromSignal) {
        const ruleId = primaryRuleIdFromSignals(row.signals);
        setImmediate(() => {
          ad.discoverFromSignal({
            mint: row.asset,
            signal_id: row.id,
            rule_id: ruleId || "unknown",
            outcome_pct: outcomePct,
            timestamp: row.emitted_at
          }).catch((err) =>
            console.warn("[signal-perf] auto-discovery silent fail:", err?.message || err)
          );
        });
      }
    }

    await syncSignalOutcomesFromPerformanceRow(supabase, row, {
      outcomePriceUsd: outcomePrice,
      outcomePctPercent: outcomePct,
      validatedAtIso: toIso(Date.now())
    });
  }

  return { examined: (rows || []).length, resolved, deferred, failed, killed, error: null };
}

function computeRegimeOutcomeBlock(regimeRows) {
  if (!Array.isArray(regimeRows) || regimeRows.length === 0) return null;
  const wins = regimeRows.filter((r) => Number(r.outcome_pct) >= SUCCESS_MIN_PCT);
  const losses = regimeRows.filter((r) => Number(r.outcome_pct) < SUCCESS_MIN_PCT);
  const sumWin = wins.reduce((a, r) => a + winsorizeOutcomePct(r.outcome_pct), 0);
  const sumLossAbs = losses.reduce((a, r) => a + Math.abs(winsorizeOutcomePct(r.outcome_pct)), 0);
  const profitFactor = sumLossAbs > 0 ? sumWin / sumLossAbs : wins.length ? 999 : 0;
  let peak = 0;
  let equity = 0;
  let maxDd = 0;
  for (const r of regimeRows) {
    equity += winsorizeOutcomePct(r.outcome_pct);
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDd) maxDd = dd;
  }
  const total = regimeRows.length;
  const winRate = total ? (wins.length / total) * 100 : 0;
  const totalRet = regimeRows.reduce((a, r) => a + winsorizeOutcomePct(r.outcome_pct), 0);
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
  const pairs = [];
  for (let i = 0; i < xs.length; i += 1) {
    const x = Number(xs[i]);
    const y = Number(ys[i]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    pairs.push([x, y]);
  }
  const n = pairs.length;
  if (n < 2) return null;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;
  for (let i = 0; i < n; i += 1) {
    const x = pairs[i][0];
    const y = pairs[i][1];
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
  const sumWin = wins.reduce((a, r) => a + winsorizeOutcomePct(r.outcome_pct), 0);
  const sumLossAbs = losses.reduce((a, r) => a + Math.abs(winsorizeOutcomePct(r.outcome_pct)), 0);
  const totalRet = resolved.reduce((a, r) => a + winsorizeOutcomePct(r.outcome_pct), 0);
  const avgRet = resolved.length ? totalRet / resolved.length : 0;
  const winRate = resolved.length ? (wins.length / resolved.length) * 100 : 0;
  const profitFactor = sumLossAbs > 0 ? sumWin / sumLossAbs : wins.length ? 999 : 0;

  // Max drawdown over cumulative outcome pct (simple equity proxy).
  let peak = 0;
  let equity = 0;
  let maxDd = 0;
  for (const r of resolved) {
    equity += winsorizeOutcomePct(r.outcome_pct);
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
      cur.sumPct += winsorizeOutcomePct(out);
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
        cur.sumPct += winsorizeOutcomePct(out);
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
    resolved.map((r) => winsorizeOutcomePct(r.outcome_pct))
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
      confidenceReturnCorrelation: corr,
      confidenceReturnCorrelationSampleSize: resolved.length,
      definitions: {
        outcomePctUnit:
          "outcome_pct is in percentage points (e.g. 5.2 => +5.2% vs entry at resolve horizon).",
        winRate:
          `win if outcome_pct >= ${SUCCESS_MIN_PCT} (SIGNAL_PERF_SUCCESS_MIN_PCT); losses are strictly below that threshold.`,
        profitFactor: "sum(winning outcome_pct) / sum(abs(loss outcome_pct)); undefined denominator collapses to edge cases 0 or 999.",
        maxDrawdownPct:
          "peak-to-trough of cumulative sum(outcome_pct) in emission-time order; diagnostic stress path, not portfolio-account equity drawdown.",
        confidenceReturnCorrelation:
          "Pearson(emission confidence 0-100, outcome_pct). |r| < ~0.15 is weak; do not infer an inverted model from correlation alone."
      }
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

