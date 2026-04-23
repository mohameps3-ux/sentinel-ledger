"use strict";

const { getSupabase } = require("../lib/supabase");
const { getMarketData } = require("./marketData");

const HORIZON_MIN = Math.max(5, Math.min(240, Number(process.env.COORD_OUTCOME_HORIZON_MIN || 30)));
const PUMP_MIN_PCT = Math.max(0, Number(process.env.COORD_OUTCOME_PUMP_MIN_PCT || process.env.SIGNAL_PERF_SUCCESS_MIN_PCT || 1.0));
const MAX_ATTEMPTS = Math.max(1, Math.min(100, Number(process.env.COORD_OUTCOME_MAX_ATTEMPTS || 12)));
const RESOLVE_BATCH = Math.max(1, Math.min(200, Number(process.env.COORD_OUTCOME_RESOLVE_BATCH || 50)));
const COORD_OUTCOME_ENABLED =
  String(process.env.COORD_OUTCOME_ENABLED || "true").toLowerCase() === "true";

function clampInt(n, min, max, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(v)));
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

/**
 * After a RED row is stored, schedule T+N resolution from the same DEX/price path as signal_performance.
 * Best-effort, non-throwing; caller should not await in hot path.
 */
async function recordCoordinationOutcomeForAlert({
  alertId,
  mint,
  clusterKey,
  detectedAtIso,
  coordinationLeadSec = null
}) {
  if (!COORD_OUTCOME_ENABLED) return { ok: false, reason: "disabled" };
  if (!alertId || !mint || !clusterKey) return { ok: false, reason: "invalid" };
  let supabase;
  try {
    supabase = getSupabase();
  } catch (_) {
    return { ok: false, reason: "supabase_unconfigured" };
  }

  const tMs = Date.parse(String(detectedAtIso));
  if (!Number.isFinite(tMs)) return { ok: false, reason: "bad_detected_at" };

  let entryPriceUsd = null;
  try {
    const market = await getMarketData(String(mint));
    const p = Number(market?.price);
    if (Number.isFinite(p) && p > 0) entryPriceUsd = p;
  } catch (_) {}

  const row = {
    alert_id: alertId,
    mint: String(mint).slice(0, 100),
    cluster_key: String(clusterKey).slice(0, 2000),
    alert_detected_at: toIso(tMs),
    coordination_lead_sec: coordinationLeadSec != null && Number.isFinite(Number(coordinationLeadSec)) ? Math.round(Number(coordinationLeadSec)) : null,
    horizon_min: HORIZON_MIN,
    entry_price_usd: entryPriceUsd,
    entry_captured_at: toIso(Date.now()),
    resolve_after: toIso(tMs + HORIZON_MIN * 60_000),
    status: "pending",
    attempts: 0
  };

  const { error } = await supabase.from("coordination_outcomes").insert(row);
  if (error) {
    if (String(error.message || "").toLowerCase().includes("unique")) {
      return { ok: true, reason: "duplicate" };
    }
    return { ok: false, reason: error.message || "insert_failed" };
  }
  return { ok: true };
}

async function runCoordinationOutcomeResolutionOnce(options = {}) {
  let supabase;
  try {
    supabase = getSupabase();
  } catch (_) {
    return { examined: 0, resolved: 0, deferred: 0, failed: 0, error: "supabase_unconfigured" };
  }
  if (!COORD_OUTCOME_ENABLED) {
    return { examined: 0, resolved: 0, deferred: 0, failed: 0, error: "disabled" };
  }
  const batch = clampInt(options.batch || process.env.COORD_OUTCOME_RESOLVE_BATCH || RESOLVE_BATCH, 1, 300, RESOLVE_BATCH);
  const nowIso = toIso(Date.now());
  const { data: rows, error } = await supabase
    .from("coordination_outcomes")
    .select(
      "id,alert_id,mint,alert_detected_at,horizon_min,entry_price_usd,status,attempts"
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
      const next = attempts >= MAX_ATTEMPTS ? "failed" : "pending";
      const update = { attempts, updated_at: toIso(Date.now()) };
      if (next === "failed") {
        update.status = "failed";
        update.resolved_at = toIso(Date.now());
        update.failure_reason = "missing_entry_price";
        failed += 1;
      } else {
        update.resolve_after = toIso(Date.now() + 2 * 60_000);
        deferred += 1;
      }
      await supabase.from("coordination_outcomes").update(update).eq("id", row.id);
      continue;
    }
    let outcomePrice = null;
    try {
      const market = await getMarketData(String(row.mint || ""));
      const p = Number(market?.price);
      if (Number.isFinite(p) && p > 0) outcomePrice = p;
    } catch (_) {}
    if (outcomePrice == null) {
      const next = attempts >= MAX_ATTEMPTS ? "failed" : "pending";
      const update = { attempts, updated_at: toIso(Date.now()) };
      if (next === "failed") {
        update.status = "failed";
        update.resolved_at = toIso(Date.now());
        update.failure_reason = "missing_outcome_price";
        failed += 1;
      } else {
        update.resolve_after = toIso(Date.now() + 2 * 60_000);
        deferred += 1;
      }
      await supabase.from("coordination_outcomes").update(update).eq("id", row.id);
      continue;
    }
    const outcomePct = pctFromPrices(entry, outcomePrice);
    const isSuccess = Number.isFinite(outcomePct) && Number(outcomePct) >= PUMP_MIN_PCT;
    const { error: upErr } = await supabase
      .from("coordination_outcomes")
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

function getCoordinationOutcomeEnv() {
  return {
    enabled: COORD_OUTCOME_ENABLED,
    horizonMin: HORIZON_MIN,
    pumpMinPct: PUMP_MIN_PCT
  };
}

/**
 * Recent T+N market outcome rows (for Ops). Tolerates missing table or empty.
 */
async function listRecentCoordinationOutcomes(options = {}) {
  let supabase;
  try {
    supabase = getSupabase();
  } catch (_) {
    return { ok: true, rows: [], degraded: true, reason: "supabase_unconfigured" };
  }
  const limit = Math.min(200, Math.max(1, Number(options.limit) || 50));
  const { data, error } = await supabase
    .from("coordination_outcomes")
    .select(
      "id, alert_id, mint, cluster_key, alert_detected_at, horizon_min, status, outcome_pct, success, resolved_at, failure_reason, resolve_after, created_at, updated_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    const msg = String(error.message || "").toLowerCase();
    const reason =
      msg.includes("relation") && msg.includes("does not exist") ? "table_missing" : error.message || "query_failed";
    return { ok: true, rows: [], degraded: true, reason };
  }
  return { ok: true, rows: data || [] };
}

module.exports = {
  recordCoordinationOutcomeForAlert,
  runCoordinationOutcomeResolutionOnce,
  getCoordinationOutcomeEnv,
  listRecentCoordinationOutcomes,
  PUMP_MIN_PCT
};
