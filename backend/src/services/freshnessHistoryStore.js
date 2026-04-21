"use strict";

const { getSupabase } = require("../lib/supabase");

function safeSupabase() {
  try {
    return getSupabase();
  } catch (_) {
    return null;
  }
}

function asObj(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function clampHours(hours) {
  const h = Number(hours);
  if (!Number.isFinite(h)) return 24;
  return Math.min(24 * 30, Math.max(1, Math.floor(h)));
}

function clampLimit(limit) {
  const n = Number(limit);
  if (!Number.isFinite(n)) return 2000;
  return Math.min(5000, Math.max(50, Math.floor(n)));
}

function normalizeEndpoint(endpoint) {
  const raw = String(endpoint || "").trim();
  if (raw === "signalsLatest" || raw === "tokensHot") return raw;
  return null;
}

function buildRowsFromSnapshot(snapshot) {
  const capturedAt = snapshot?.generatedAt ? new Date(snapshot.generatedAt).toISOString() : new Date().toISOString();
  const signals = snapshot?.signalsLatest || {};
  const hot = snapshot?.tokensHot || {};
  return [
    {
      captured_at: capturedAt,
      endpoint: "signalsLatest",
      requests_24h: Number(signals.requests24h || 0),
      real_ratio_24h: Number(signals.realRatio24h || 0),
      static_fallback_rate_24h: Number(signals.staticFallbackRate24h || 0),
      supabase_source_rate_24h: Number(signals.supabaseSourceRate24h || 0),
      source_breakdown_24h: asObj(signals.sourceBreakdown24h),
      fallback_reason_breakdown_24h: asObj(signals.fallbackReasonBreakdown24h),
      provider_used_breakdown_24h: asObj(signals.providerUsedBreakdown24h),
      slo_target: Number(signals?.slo?.targetSupabaseRate || 0),
      slo_met: Boolean(signals?.slo?.met)
    },
    {
      captured_at: capturedAt,
      endpoint: "tokensHot",
      requests_24h: Number(hot.requests24h || 0),
      real_ratio_24h: Number(hot.realRatio24h || 0),
      static_fallback_rate_24h: Number(hot.staticFallbackRate24h || 0),
      supabase_source_rate_24h: null,
      source_breakdown_24h: asObj(hot.sourceBreakdown24h),
      fallback_reason_breakdown_24h: asObj(hot.fallbackReasonBreakdown24h),
      provider_used_breakdown_24h: asObj(hot.providerUsedBreakdown24h),
      slo_target: null,
      slo_met: null
    }
  ];
}

async function appendFreshnessSnapshotHistory(snapshot) {
  const supabase = safeSupabase();
  if (!supabase) return { ok: false, reason: "supabase_unconfigured", inserted: 0, pruned: 0 };
  const rows = buildRowsFromSnapshot(snapshot);
  const { error } = await supabase.from("ops_data_freshness_history").insert(rows);
  if (error) return { ok: false, reason: error.message || "insert_failed", inserted: 0, pruned: 0 };
  return { ok: true, inserted: rows.length, pruned: 0 };
}

async function pruneFreshnessHistory(retentionDays = 30) {
  const supabase = safeSupabase();
  if (!supabase) return { ok: false, reason: "supabase_unconfigured", deleted: 0 };
  const d = Number(retentionDays);
  const safeDays = Number.isFinite(d) ? Math.min(365, Math.max(7, Math.floor(d))) : 30;
  const cutoffIso = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000).toISOString();
  const { data: oldRows, error: listError } = await supabase
    .from("ops_data_freshness_history")
    .select("id")
    .lt("captured_at", cutoffIso)
    .limit(5000);
  if (listError) return { ok: false, reason: listError.message || "prune_list_failed", deleted: 0 };
  if (!Array.isArray(oldRows) || oldRows.length === 0) return { ok: true, deleted: 0 };
  const ids = oldRows.map((r) => r.id).filter(Boolean);
  if (!ids.length) return { ok: true, deleted: 0 };
  const { error: deleteError } = await supabase.from("ops_data_freshness_history").delete().in("id", ids);
  if (deleteError) return { ok: false, reason: deleteError.message || "prune_delete_failed", deleted: 0 };
  return { ok: true, deleted: ids.length };
}

async function getFreshnessHistory({ endpoint = null, hours = 24, limit = 2000 } = {}) {
  const supabase = safeSupabase();
  if (!supabase) return { ok: false, reason: "supabase_unconfigured", rows: [] };
  const safeHours = clampHours(hours);
  const safeLimit = clampLimit(limit);
  const sinceIso = new Date(Date.now() - safeHours * 60 * 60 * 1000).toISOString();
  const endpointNorm = normalizeEndpoint(endpoint);

  let query = supabase
    .from("ops_data_freshness_history")
    .select(
      "captured_at, endpoint, requests_24h, real_ratio_24h, static_fallback_rate_24h, supabase_source_rate_24h, source_breakdown_24h, fallback_reason_breakdown_24h, provider_used_breakdown_24h, slo_target, slo_met"
    )
    .gte("captured_at", sinceIso)
    .order("captured_at", { ascending: true })
    .limit(safeLimit);

  if (endpointNorm) query = query.eq("endpoint", endpointNorm);

  const { data, error } = await query;
  if (error) return { ok: false, reason: error.message || "query_failed", rows: [] };
  return {
    ok: true,
    hours: safeHours,
    endpoint: endpointNorm,
    rows: data || []
  };
}

module.exports = {
  appendFreshnessSnapshotHistory,
  pruneFreshnessHistory,
  getFreshnessHistory
};
