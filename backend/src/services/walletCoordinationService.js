"use strict";

const redis = require("../lib/cache");
const { getSupabase } = require("../lib/supabase");
const { getMarketData } = require("./marketData");

const REDIS_PAIR_CACHE_KEY = "coordination:pairs:v1";
const REDIS_PAIR_CACHE_TTL_SEC = Math.max(60, Number(process.env.COORD_PAIR_CACHE_TTL_SEC || 300));
const ALERT_DEDUPE_SEC = Math.max(60, Number(process.env.COORD_ALERT_DEDUPE_SEC || 900));
const EARLY_DEPLOY_MIN = Math.max(5, Number(process.env.COORD_EARLY_DEPLOY_MAX_MIN || 120));
const MIN_PAIR_CO = Math.max(2, Number(process.env.COORD_MIN_PAIR_COBUY || 3));
const MIN_PAIR_STRENGTH = Math.max(0.1, Number(process.env.COORD_MIN_PAIR_STRENGTH || 0.55));
const ALERT_MIN_CLUSTER_SCORE = Math.max(0.1, Number(process.env.COORD_ALERT_MIN_CLUSTER_SCORE || 0.68));
const ALERT_MIN_WALLETS = Math.max(3, Number(process.env.COORD_ALERT_MIN_WALLETS || 3));
const COORD_RED_PREPARE_ENABLED = String(process.env.COORD_RED_PREPARE_ENABLED || "true").toLowerCase() === "true";
const COORD_RED_PREPARE_MIN_SCORE = Math.max(
  0.1,
  Math.min(ALERT_MIN_CLUSTER_SCORE - 0.01, Number(process.env.COORD_RED_PREPARE_MIN_SCORE || 0.55))
);
const COORD_PREPARE_TTL_SEC = Math.max(120, Number(process.env.COORD_PREPARE_TTL_SEC || 600));
const COORD_PREPARE_EMIT_DEDUPE_SEC = Math.max(30, Number(process.env.COORD_PREPARE_EMIT_DEDUPE_SEC || 90));
const REDIS_PREPARE_KEY = (mint) => `coord:red:prepare:${mint}`;
const REDIS_PREPARE_EMIT = (mint) => `coord:red:prepare-emit:${mint}`;

/** Join prior cluster alerts to signal_performance: resolved, outcome ≥ min, emitted on/after alert time. */
const COORD_RECURRENCE_VERIFIED_PUMPS =
  String(process.env.COORD_RECURRENCE_VERIFIED_PUMPS || "true").toLowerCase() === "true";
const COORD_RECURRENCE_PUMP_MIN_OUTCOME_PCT = Math.max(
  0,
  Number(
    process.env.COORD_RECURRENCE_PUMP_MIN_OUTCOME_PCT || process.env.SIGNAL_PERF_SUCCESS_MIN_PCT || 1.0
  )
);
const IN_CLAUSE_MINTS_CHUNK = 80;

/** T+N market resolution: same min return as coordinationOutcomes (see COORD_OUTCOME_PUMP_MIN_PCT). */
const COORD_OUTCOME_PUMP_MIN_PCT = Math.max(0, Number(process.env.COORD_OUTCOME_PUMP_MIN_PCT || process.env.SIGNAL_PERF_SUCCESS_MIN_PCT || 1.0));
const COORD_RECURRENCE_PREFER_MARKET_OUTCOMES =
  String(process.env.COORD_RECURRENCE_PREFER_MARKET_OUTCOMES || "true").toLowerCase() === "true";
const COORD_RECURRENCE_SIGNAL_PERF_FALLBACK =
  String(process.env.COORD_RECURRENCE_SIGNAL_PERF_FALLBACK || "true").toLowerCase() === "true";

function safeSupabase() {
  try {
    return getSupabase();
  } catch (_) {
    return null;
  }
}

function asMs(v) {
  const t = Date.parse(String(v || ""));
  return Number.isFinite(t) ? t : null;
}

function pairKey(a, b) {
  const x = String(a || "");
  const y = String(b || "");
  return x < y ? `${x}|${y}` : `${y}|${x}`;
}

function combinations3(values) {
  const out = [];
  for (let i = 0; i < values.length; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) {
      for (let k = j + 1; k < values.length; k += 1) {
        out.push([values[i], values[j], values[k]]);
      }
    }
  }
  return out;
}

async function getHistoricalPairMap() {
  try {
    const hit = await redis.get(REDIS_PAIR_CACHE_KEY);
    if (hit && typeof hit === "object") return hit;
  } catch (_) {}

  const supabase = safeSupabase();
  if (!supabase) return {};
  const { data, error } = await supabase
    .from("wallet_coordination_pairs")
    .select("wallet_a,wallet_b,co_buy_count_30d,early_co_buy_count_30d,strength_score,last_co_buy_at")
    .gte("co_buy_count_30d", MIN_PAIR_CO)
    .order("strength_score", { ascending: false })
    .limit(15000);
  if (error || !Array.isArray(data)) return {};

  const out = {};
  for (const row of data) {
    const key = pairKey(row.wallet_a, row.wallet_b);
    out[key] = {
      co: Number(row.co_buy_count_30d || 0),
      early: Number(row.early_co_buy_count_30d || 0),
      strength: Number(row.strength_score || 0),
      last: row.last_co_buy_at || null
    };
  }
  try {
    await redis.set(REDIS_PAIR_CACHE_KEY, out, { ex: REDIS_PAIR_CACHE_TTL_SEC });
  } catch (_) {}
  return out;
}

function scoreClusterFromPairMap(wallets, pairMap) {
  if (!Array.isArray(wallets) || wallets.length < 3) return null;
  const pairs = [];
  for (let i = 0; i < wallets.length; i += 1) {
    for (let j = i + 1; j < wallets.length; j += 1) {
      const p = pairMap[pairKey(wallets[i], wallets[j])];
      if (!p) return null;
      if (Number(p.co || 0) < MIN_PAIR_CO || Number(p.strength || 0) < MIN_PAIR_STRENGTH) return null;
      pairs.push(p);
    }
  }
  const avgStrength = pairs.reduce((a, b) => a + Number(b.strength || 0), 0) / pairs.length;
  const avgCo = pairs.reduce((a, b) => a + Number(b.co || 0), 0) / pairs.length;
  const avgEarlyRatio =
    pairs.reduce((a, b) => a + (Number(b.co || 0) > 0 ? Number(b.early || 0) / Number(b.co || 1) : 0), 0) /
    pairs.length;
  const score = 0.55 * avgStrength + 0.25 * Math.min(1, avgCo / 8) + 0.2 * avgEarlyRatio;
  return {
    avgStrength: Number(avgStrength.toFixed(4)),
    avgCo: Number(avgCo.toFixed(3)),
    avgEarlyRatio: Number(avgEarlyRatio.toFixed(4)),
    clusterScore: Number(score.toFixed(4))
  };
}

function clusterKey(wallets) {
  return (wallets || [])
    .map((w) => String(w || ""))
    .filter(Boolean)
    .sort()
    .join(",");
}

function coordinationLeadSec(detectedAtMs, windowMinSec) {
  const detSec = (Number(detectedAtMs) || Date.now()) / 1000;
  if (windowMinSec == null || !Number.isFinite(Number(windowMinSec))) return null;
  return Math.max(0, Math.round(detSec - Number(windowMinSec)));
}

function emptyRecurrenceResult() {
  return {
    priorClusterAlerts: 0,
    uniqueMintsPrior: 0,
    meanPriorScore: null,
    meanCoordinationLeadSecPrior: null,
    priorClusterAlertsWithVerifiedPumps: 0,
    uniqueMintsWithVerifiedPumps: 0,
    meanSignalOutcomePctPriorVerified: null,
    meanCoordinationLeadSecPriorVerified: null
  };
}

/**
 * "Reincidencia" base: prior alerts for this cluster_key.
 * Optional: cross `signal_performance` (resolved, outcome >= min) with emitted_at >= that alert
 * to approximate "mints where post-alert follow-through (scored) showed a real pump", not just alert count.
 */
async function fetchSignalPerfResolvedForMints(supabase, uniqueMints, minOutcomePct) {
  const all = [];
  for (let i = 0; i < uniqueMints.length; i += IN_CLAUSE_MINTS_CHUNK) {
    const chunk = uniqueMints.slice(i, i + IN_CLAUSE_MINTS_CHUNK);
    const { data, error } = await supabase
      .from("signal_performance")
      .select("asset, emitted_at, outcome_pct")
      .in("asset", chunk)
      .eq("status", "resolved")
      .not("outcome_pct", "is", null)
      .gte("outcome_pct", minOutcomePct);
    if (error) return null;
    if (Array.isArray(data)) all.push(...data);
  }
  return all;
}

async function fetchCoordinationOutcomesByAlertIds(supabase, alertIds) {
  if (!alertIds || !alertIds.length) return [];
  const all = [];
  for (let i = 0; i < alertIds.length; i += IN_CLAUSE_MINTS_CHUNK) {
    const chunk = alertIds.slice(i, i + IN_CLAUSE_MINTS_CHUNK);
    const { data, error } = await supabase
      .from("coordination_outcomes")
      .select("alert_id, status, outcome_pct, success")
      .in("alert_id", chunk);
    if (error) return null;
    if (Array.isArray(data)) all.push(...data);
  }
  return all;
}

/**
 * prior alert rows: (1) coordination_outcomes resolved @ T+N vs T0 (preferred),
 * (2) legacy: signal_performance match when no outcome row.
 */
async function getClusterRecurrenceStats(clusterKey, beforeMs) {
  const supabase = safeSupabase();
  if (!supabase || !clusterKey) {
    return emptyRecurrenceResult();
  }
  const before = new Date(Number(beforeMs) || Date.now()).toISOString();
  const { data, error } = await supabase
    .from("wallet_coordination_alerts")
    .select("id, mint, score, detected_at, meta")
    .eq("cluster_key", clusterKey)
    .lt("detected_at", before)
    .order("detected_at", { ascending: false })
    .limit(500);
  if (error || !Array.isArray(data) || !data.length) {
    return emptyRecurrenceResult();
  }
  const mints = new Set(data.map((r) => r.mint).filter(Boolean));
  const mean = data.reduce((a, r) => a + Number(r.score || 0), 0) / data.length;
  const leads = data
    .map((r) => {
      const m = r.meta && typeof r.meta === "object" ? r.meta : {};
      return m.coordinationLeadSec != null ? Number(m.coordinationLeadSec) : null;
    })
    .filter((n) => n != null && Number.isFinite(n));
  const leadMean =
    leads.length > 0
      ? Number((leads.reduce((a, b) => a + b, 0) / leads.length).toFixed(1))
      : null;

  let priorClusterAlertsWithVerifiedPumps = 0;
  let uniqueMintsWithVerifiedPumps = 0;
  let meanSignalOutcomePctPriorVerified = null;
  let meanCoordinationLeadSecPriorVerified = null;

  if (COORD_RECURRENCE_VERIFIED_PUMPS && mints.size > 0) {
    const byId = new Map();
    const alertIds = data.map((r) => r.id).filter(Boolean);
    if (alertIds.length && COORD_RECURRENCE_PREFER_MARKET_OUTCOMES) {
      const oc = await fetchCoordinationOutcomesByAlertIds(supabase, alertIds);
      if (oc) for (const r of oc) byId.set(String(r.alert_id), r);
    }
    const okMints = new Set();
    const outcomeSamples = [];
    const leadVerified = [];

    function addVerifiedFromRow(row, outPct) {
      priorClusterAlertsWithVerifiedPumps += 1;
      const ms = String(row.mint || "");
      if (ms) okMints.add(ms);
      if (outPct != null) outcomeSamples.push(outPct);
      const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
      if (meta.coordinationLeadSec != null && Number.isFinite(Number(meta.coordinationLeadSec))) {
        leadVerified.push(Number(meta.coordinationLeadSec));
      }
    }

    for (const row of data) {
      const oc = row.id ? byId.get(String(row.id)) : null;
      if (
        oc &&
        oc.status === "resolved" &&
        Number.isFinite(Number(oc.outcome_pct)) &&
        Number(oc.outcome_pct) >= COORD_OUTCOME_PUMP_MIN_PCT
      ) {
        addVerifiedFromRow(row, Number(oc.outcome_pct));
      }
    }

    const needSignal =
      COORD_RECURRENCE_SIGNAL_PERF_FALLBACK
        ? data.filter((row) => row.id && !byId.has(String(row.id)))
        : [];
    if (needSignal.length) {
      const needMints = [...new Set(needSignal.map((r) => String(r.mint || "")).filter(Boolean))];
      const perf = await fetchSignalPerfResolvedForMints(
        supabase,
        needMints,
        COORD_RECURRENCE_PUMP_MIN_OUTCOME_PCT
      );
      if (perf) {
        for (const row of needSignal) {
          const mintStr = String(row.mint || "");
          const tAlert = Date.parse(String(row.detected_at || ""));
          if (!mintStr || !Number.isFinite(tAlert)) continue;
          const cands = perf.filter(
            (p) => String(p.asset) === mintStr && Date.parse(String(p.emitted_at || 0)) >= tAlert
          );
          if (!cands.length) continue;
          const best = Math.max(...cands.map((c) => Number(c.outcome_pct) || 0));
          if (!Number.isFinite(best) || best < COORD_RECURRENCE_PUMP_MIN_OUTCOME_PCT) continue;
          addVerifiedFromRow(row, best);
        }
      }
    }

    uniqueMintsWithVerifiedPumps = okMints.size;
    meanSignalOutcomePctPriorVerified = outcomeSamples.length
      ? Number((outcomeSamples.reduce((a, b) => a + b, 0) / outcomeSamples.length).toFixed(2))
      : null;
    meanCoordinationLeadSecPriorVerified = leadVerified.length
      ? Number((leadVerified.reduce((a, b) => a + b, 0) / leadVerified.length).toFixed(1))
      : null;
  }

  return {
    priorClusterAlerts: data.length,
    uniqueMintsPrior: mints.size,
    meanPriorScore: Number(mean.toFixed(4)),
    meanCoordinationLeadSecPrior: leadMean,
    priorClusterAlertsWithVerifiedPumps,
    uniqueMintsWithVerifiedPumps,
    meanSignalOutcomePctPriorVerified,
    meanCoordinationLeadSecPriorVerified
  };
}

function findBestClusterTriple(inputWallets, pairMap) {
  const combos = combinations3(inputWallets);
  let best = null;
  for (const c of combos) {
    const s = scoreClusterFromPairMap(c, pairMap);
    if (!s) continue;
    if (!best || s.clusterScore > best.clusterScore) {
      best = { wallets: c, ...s };
    }
  }
  return best;
}

async function persistCoordinationAlert(alert) {
  const supabase = safeSupabase();
  if (!supabase || !alert?.mint || !alert?.clusterKey) return { ok: false, reason: "unconfigured_or_invalid" };

  const dedupeKey = `coord-alert:${alert.mint}:${alert.clusterKey}:${Math.floor(Date.now() / ALERT_DEDUPE_SEC / 1000)}`;
  try {
    const setRes = await redis.set(dedupeKey, "1", { nx: true, ex: ALERT_DEDUPE_SEC });
    if (setRes == null) return { ok: false, reason: "deduped" };
  } catch (_) {
    // fail-open on cache
  }

  const payload = {
    mint: alert.mint,
    cluster_key: alert.clusterKey,
    wallets: alert.wallets,
    wallet_count: alert.wallets.length,
    spread_sec: alert.spreadSec,
    score: alert.score,
    severity: alert.severity || "RED",
    latency_from_deploy_min: alert.latencyFromDeployMin,
    reason: alert.reason || "historical_temporal_cluster_retriggered",
    detected_at: alert.detectedAt || new Date().toISOString(),
    meta: alert.meta || {}
  };

  const { data: inserted, error } = await supabase
    .from("wallet_coordination_alerts")
    .insert(payload)
    .select("id")
    .single();
  if (error) return { ok: false, reason: error.message || "insert_failed" };
  const alertId = inserted?.id;
  if (alertId) {
    const { recordCoordinationOutcomeForAlert } = require("./coordinationOutcomes");
    const lead = payload.meta && payload.meta.coordinationLeadSec;
    recordCoordinationOutcomeForAlert({
      alertId,
      mint: payload.mint,
      clusterKey: payload.cluster_key,
      detectedAtIso: payload.detected_at,
      coordinationLeadSec: lead
    }).catch(() => {});
  }
  return { ok: true, id: alertId };
}

async function buildRedConfirmPayload({ mint, best, detectedAtMs, windowMinSec, windowMaxSec }) {
  const detMs = Number(detectedAtMs) || Date.now();
  const ck = clusterKey(best.wallets);
  const rec = await getClusterRecurrenceStats(ck, detMs);
  const leadSec = coordinationLeadSec(detMs, windowMinSec);
  const spreadClustSec =
    windowMinSec != null && windowMaxSec != null && Number.isFinite(windowMinSec) && Number.isFinite(windowMaxSec)
      ? Math.max(0, Math.round(Number(windowMaxSec) - Number(windowMinSec)))
      : null;

  let latencyFromDeployMin = null;
  try {
    const md = await getMarketData(mint);
    const pairCreatedAt = Number(md?.pairCreatedAt || 0);
    if (Number.isFinite(pairCreatedAt) && pairCreatedAt > 0) {
      const dm = (detMs - pairCreatedAt) / 60000;
      if (Number.isFinite(dm) && dm >= 0) latencyFromDeployMin = Number(dm.toFixed(2));
    }
  } catch (_) {}

  const isEarly = latencyFromDeployMin != null ? latencyFromDeployMin <= EARLY_DEPLOY_MIN : null;
  return {
    mint: String(mint),
    clusterKey: ck,
    wallets: best.wallets,
    spreadSec: 600,
    score: best.clusterScore,
    severity: "RED",
    latencyFromDeployMin,
    reason:
      isEarly === true
        ? "historical_cluster_retriggered_early_post_deploy"
        : "historical_cluster_retriggered",
    detectedAt: new Date(detMs).toISOString(),
    redSignal: "RED_CONFIRM",
    meta: {
      avgStrength: best.avgStrength,
      avgCoBuyCount: best.avgCo,
      avgEarlyRatio: best.avgEarlyRatio,
      earlyDeployThresholdMin: EARLY_DEPLOY_MIN,
      redSignal: "RED_CONFIRM",
      priorClusterAlerts: rec.priorClusterAlerts,
      uniqueMintsWithPriorClusterAlerts: rec.uniqueMintsPrior,
      meanScorePriorClusterAlerts: rec.meanPriorScore,
      meanCoordinationLeadSecPrior: rec.meanCoordinationLeadSecPrior,
      priorClusterAlertsWithVerifiedPumps: rec.priorClusterAlertsWithVerifiedPumps,
      uniqueMintsWithVerifiedPumps: rec.uniqueMintsWithVerifiedPumps,
      meanSignalOutcomePctPriorVerified: rec.meanSignalOutcomePctPriorVerified,
      meanCoordinationLeadSecPriorVerified: rec.meanCoordinationLeadSecPriorVerified,
      pumpMinOutcomePctThreshold: COORD_RECURRENCE_VERIFIED_PUMPS
        ? COORD_RECURRENCE_PUMP_MIN_OUTCOME_PCT
        : null,
      pumpMinMarketOutcomePct: COORD_OUTCOME_PUMP_MIN_PCT,
      coordinationLeadSec: leadSec,
      clusterWindowSpreadSec: spreadClustSec
    }
  };
}

/**
 * @returns {{ confirm: object|null, prepare: object|null }}
 * RED_CONFIRM → Supabase; RED_PREPARE → Redis + optional socket; RED_ABORT handled in checkRedPrepareAbort.
 */
async function processRedCoordinationPhases({ mint, wallets, detectedAtMs, windowMinSec, windowMaxSec }) {
  const inputWallets = Array.from(new Set((wallets || []).map((w) => String(w || "")).filter(Boolean))).slice(0, 9);
  if (!mint || inputWallets.length < ALERT_MIN_WALLETS) return { confirm: null, prepare: null };

  const pairMap = await getHistoricalPairMap();
  if (!pairMap || Object.keys(pairMap).length === 0) return { confirm: null, prepare: null };

  const best = findBestClusterTriple(inputWallets, pairMap);
  if (!best) {
    try {
      await redis.del(REDIS_PREPARE_KEY(mint));
    } catch (_) {}
    return { confirm: null, prepare: null };
  }

  const detMs = Number(detectedAtMs) || Date.now();
  const ck = clusterKey(best.wallets);

  if (best.clusterScore < COORD_RED_PREPARE_MIN_SCORE) {
    try {
      await redis.del(REDIS_PREPARE_KEY(mint));
    } catch (_) {}
    return { confirm: null, prepare: null };
  }

  if (best.clusterScore >= ALERT_MIN_CLUSTER_SCORE) {
    const alert = await buildRedConfirmPayload({ mint, best, detectedAtMs: detMs, windowMinSec, windowMaxSec });
    const persisted = await persistCoordinationAlert(alert);
    if (!persisted.ok) {
      return { confirm: null, prepare: null };
    }
    try {
      await redis.del(REDIS_PREPARE_KEY(mint));
    } catch (_) {}
    return { confirm: alert, prepare: null };
  }

  if (
    COORD_RED_PREPARE_ENABLED &&
    COORD_RED_PREPARE_MIN_SCORE < ALERT_MIN_CLUSTER_SCORE &&
    best.clusterScore >= COORD_RED_PREPARE_MIN_SCORE
  ) {
    const rec = await getClusterRecurrenceStats(ck, detMs);
    const leadSec = coordinationLeadSec(detMs, windowMinSec);
    const prepare = {
      mint: String(mint),
      clusterKey: ck,
      wallets: best.wallets,
      score: best.clusterScore,
      redSignal: "RED_PREPARE",
      severity: "ORANGE",
      detectedAt: new Date(detMs).toISOString(),
      reason: "cluster_score_below_confirm_threshold",
      meta: {
        avgStrength: best.avgStrength,
        priorClusterAlerts: rec.priorClusterAlerts,
        meanScorePriorClusterAlerts: rec.meanPriorScore,
        meanCoordinationLeadSecPrior: rec.meanCoordinationLeadSecPrior,
        priorClusterAlertsWithVerifiedPumps: rec.priorClusterAlertsWithVerifiedPumps,
        uniqueMintsWithVerifiedPumps: rec.uniqueMintsWithVerifiedPumps,
        meanSignalOutcomePctPriorVerified: rec.meanSignalOutcomePctPriorVerified,
        meanCoordinationLeadSecPriorVerified: rec.meanCoordinationLeadSecPriorVerified,
        pumpMinOutcomePctThreshold: COORD_RECURRENCE_VERIFIED_PUMPS
          ? COORD_RECURRENCE_PUMP_MIN_OUTCOME_PCT
          : null,
        pumpMinMarketOutcomePct: COORD_OUTCOME_PUMP_MIN_PCT,
        coordinationLeadSec: leadSec,
        confirmMinScore: ALERT_MIN_CLUSTER_SCORE,
        prepareMinScore: COORD_RED_PREPARE_MIN_SCORE
      }
    };
    try {
      await redis.set(REDIS_PREPARE_KEY(mint), { clusterKey: ck, score: best.clusterScore, atMs: detMs }, {
        ex: COORD_PREPARE_TTL_SEC
      });
    } catch (_) {}
    let emitPrepare = true;
    try {
      const setRes = await redis.set(REDIS_PREPARE_EMIT(mint), String(detMs), { nx: true, ex: COORD_PREPARE_EMIT_DEDUPE_SEC });
      emitPrepare = setRes != null;
    } catch (_) {}
    return { confirm: null, prepare: emitPrepare ? prepare : null };
  }

  return { confirm: null, prepare: null };
}

async function checkRedPrepareAbort(mint, state) {
  if (state && state.detected && Array.isArray(state.wallets) && state.wallets.length >= ALERT_MIN_WALLETS) {
    return null;
  }
  let raw;
  try {
    raw = await redis.get(REDIS_PREPARE_KEY(mint));
  } catch (_) {
    return null;
  }
  if (!raw || typeof raw !== "object" || !raw.clusterKey) return null;
  const ck = String(raw.clusterKey);
  try {
    await redis.del(REDIS_PREPARE_KEY(mint));
  } catch (_) {}
  return {
    mint: String(mint),
    clusterKey: ck,
    redSignal: "RED_ABORT",
    severity: "DIM",
    reason: "prepare_state_cluster_no_longer_confirmed",
    detectedAt: new Date().toISOString()
  };
}

/**
 * @deprecated Prefer processRedCoordinationPhases — returns only RED_CONFIRM payload or null.
 */
async function detectHistoricalCoordinationAlert({ mint, wallets, detectedAtMs, windowMinSec, windowMaxSec } = {}) {
  const { confirm } = await processRedCoordinationPhases({ mint, wallets, detectedAtMs, windowMinSec, windowMaxSec });
  return confirm;
}

async function listRecentCoordinationAlerts(limit = 50) {
  const supabase = safeSupabase();
  if (!supabase) return { ok: false, reason: "supabase_unconfigured", rows: [] };
  const lim = Math.min(300, Math.max(1, Number(limit) || 50));
  const { data, error } = await supabase
    .from("wallet_coordination_alerts")
    .select("*")
    .order("detected_at", { ascending: false })
    .limit(lim);
  if (error) return { ok: false, reason: error.message || "query_failed", rows: [] };
  return { ok: true, rows: data || [] };
}

async function rebuildCoordinationPairs({
  lookbackDays = 30,
  maxWallets = 400,
  windowMin = 10,
  earlyDeployMaxMin = EARLY_DEPLOY_MIN,
  maxTokensForPairCreated = 500
} = {}) {
  const supabase = safeSupabase();
  if (!supabase) return { ok: false, reason: "supabase_unconfigured" };
  const sinceIso = new Date(Date.now() - Math.max(1, Number(lookbackDays) || 30) * 24 * 60 * 60 * 1000).toISOString();
  const limWallets = Math.min(1500, Math.max(20, Number(maxWallets) || 400));

  const { data: wallets, error: wErr } = await supabase
    .from("smart_wallets")
    .select("wallet_address,win_rate")
    .gte("win_rate", 70)
    .order("win_rate", { ascending: false })
    .limit(limWallets);
  if (wErr) return { ok: false, reason: wErr.message || "wallets_query_failed" };
  const walletList = (wallets || []).map((w) => String(w.wallet_address || "")).filter(Boolean);
  if (!walletList.length) return { ok: true, updatedPairs: 0, tokens: 0 };

  const { data: rows, error: tErr } = await supabase
    .from("wallet_tokens")
    .select("wallet_address,token_address,bought_at")
    .in("wallet_address", walletList)
    .gte("bought_at", sinceIso)
    .order("bought_at", { ascending: true })
    .limit(300000);
  if (tErr) return { ok: false, reason: tErr.message || "wallet_tokens_query_failed" };

  const byToken = new Map();
  for (const r of rows || []) {
    const token = String(r.token_address || "");
    const wallet = String(r.wallet_address || "");
    const t = asMs(r.bought_at);
    if (!token || !wallet || t == null) continue;
    if (!byToken.has(token)) byToken.set(token, []);
    byToken.get(token).push({ wallet, t, iso: r.bought_at });
  }

  const pairStats = new Map();
  const tokenKeys = [...byToken.keys()];
  const pairCreatedMap = new Map();
  for (const token of tokenKeys.slice(0, Math.max(0, Number(maxTokensForPairCreated) || 0))) {
    try {
      const md = await getMarketData(token);
      const raw = Number(md?.pairCreatedAt || 0);
      pairCreatedMap.set(token, Number.isFinite(raw) && raw > 0 ? raw : null);
    } catch (_) {
      pairCreatedMap.set(token, null);
    }
  }

  const windowMs = Math.max(60_000, Number(windowMin || 10) * 60_000);
  for (const [token, arrRaw] of byToken.entries()) {
    const arr = [...arrRaw].sort((a, b) => a.t - b.t);
    for (let i = 0; i < arr.length; i += 1) {
      const cur = arr[i];
      for (let j = i - 1; j >= 0; j -= 1) {
        const prev = arr[j];
        const dtMs = cur.t - prev.t;
        if (dtMs > windowMs) break;
        if (prev.wallet === cur.wallet) continue;
        const k = pairKey(prev.wallet, cur.wallet);
        const row =
          pairStats.get(k) || {
            wallet_a: k.split("|")[0],
            wallet_b: k.split("|")[1],
            co_buy_count_30d: 0,
            early_co_buy_count_30d: 0,
            delta_sum_sec: 0,
            delta_count: 0,
            last_co_buy_at: null
          };
        row.co_buy_count_30d += 1;
        row.delta_sum_sec += dtMs / 1000;
        row.delta_count += 1;
        row.last_co_buy_at = cur.iso;

        const pairCreated = pairCreatedMap.get(token);
        if (pairCreated != null) {
          const early = (Math.max(prev.t, cur.t) - pairCreated) / 60000 <= earlyDeployMaxMin;
          if (early) row.early_co_buy_count_30d += 1;
        }
        pairStats.set(k, row);
      }
    }
  }

  const upserts = [];
  for (const row of pairStats.values()) {
    if (row.co_buy_count_30d < MIN_PAIR_CO) continue;
    const avgDeltaSec = row.delta_count > 0 ? row.delta_sum_sec / row.delta_count : 9999;
    const earlyRatio =
      row.co_buy_count_30d > 0 ? row.early_co_buy_count_30d / row.co_buy_count_30d : 0;
    const strengthScore = Math.max(
      0,
      Math.min(
        1,
        0.5 * Math.min(1, row.co_buy_count_30d / 12) + 0.3 * (1 - Math.min(1, avgDeltaSec / 600)) + 0.2 * earlyRatio
      )
    );
    upserts.push({
      wallet_a: row.wallet_a,
      wallet_b: row.wallet_b,
      co_buy_count_30d: row.co_buy_count_30d,
      early_co_buy_count_30d: row.early_co_buy_count_30d,
      avg_delta_sec: Number(avgDeltaSec.toFixed(3)),
      strength_score: Number(strengthScore.toFixed(4)),
      last_co_buy_at: row.last_co_buy_at,
      updated_at: new Date().toISOString()
    });
  }

  if (upserts.length) {
    const { error: uErr } = await supabase
      .from("wallet_coordination_pairs")
      .upsert(upserts, { onConflict: "wallet_a,wallet_b" });
    if (uErr) return { ok: false, reason: uErr.message || "upsert_failed" };
  }
  try {
    await redis.del(REDIS_PAIR_CACHE_KEY);
  } catch (_) {}

  return {
    ok: true,
    wallets: walletList.length,
    tokens: byToken.size,
    updatedPairs: upserts.length
  };
}

module.exports = {
  detectHistoricalCoordinationAlert,
  processRedCoordinationPhases,
  checkRedPrepareAbort,
  listRecentCoordinationAlerts,
  rebuildCoordinationPairs
};

