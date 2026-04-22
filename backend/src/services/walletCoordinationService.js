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

  const { error } = await supabase.from("wallet_coordination_alerts").insert(payload);
  if (error) return { ok: false, reason: error.message || "insert_failed" };
  return { ok: true };
}

async function detectHistoricalCoordinationAlert({ mint, wallets, detectedAtMs }) {
  const inputWallets = Array.from(new Set((wallets || []).map((w) => String(w || "")).filter(Boolean))).slice(0, 9);
  if (!mint || inputWallets.length < ALERT_MIN_WALLETS) return null;

  const pairMap = await getHistoricalPairMap();
  if (!pairMap || Object.keys(pairMap).length === 0) return null;

  const combos = combinations3(inputWallets);
  let best = null;
  for (const c of combos) {
    const s = scoreClusterFromPairMap(c, pairMap);
    if (!s) continue;
    if (!best || s.clusterScore > best.clusterScore) {
      best = { wallets: c, ...s };
    }
  }
  if (!best || best.clusterScore < ALERT_MIN_CLUSTER_SCORE) return null;

  let latencyFromDeployMin = null;
  try {
    const md = await getMarketData(mint);
    const pairCreatedAt = Number(md?.pairCreatedAt || 0);
    if (Number.isFinite(pairCreatedAt) && pairCreatedAt > 0) {
      const dm = ((Number(detectedAtMs) || Date.now()) - pairCreatedAt) / 60000;
      if (Number.isFinite(dm) && dm >= 0) latencyFromDeployMin = Number(dm.toFixed(2));
    }
  } catch (_) {}

  const isEarly = latencyFromDeployMin != null ? latencyFromDeployMin <= EARLY_DEPLOY_MIN : null;
  const alert = {
    mint: String(mint),
    clusterKey: clusterKey(best.wallets),
    wallets: best.wallets,
    spreadSec: 600,
    score: best.clusterScore,
    severity: "RED",
    latencyFromDeployMin,
    reason:
      isEarly === true
        ? "historical_cluster_retriggered_early_post_deploy"
        : "historical_cluster_retriggered",
    detectedAt: new Date(Number(detectedAtMs) || Date.now()).toISOString(),
    meta: {
      avgStrength: best.avgStrength,
      avgCoBuyCount: best.avgCo,
      avgEarlyRatio: best.avgEarlyRatio,
      earlyDeployThresholdMin: EARLY_DEPLOY_MIN
    }
  };
  const persisted = await persistCoordinationAlert(alert);
  if (!persisted.ok) return null;
  return alert;
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
  listRecentCoordinationAlerts,
  rebuildCoordinationPairs
};

