"use strict";

const { getSupabase } = require("../lib/supabase");
const { getMarketData } = require("./marketData");

function safeSupabase() {
  try {
    return getSupabase();
  } catch (_) {
    return null;
  }
}

function toIso(d) {
  return new Date(d).toISOString();
}

function asMs(v) {
  const t = Date.parse(String(v || ""));
  return Number.isFinite(t) ? t : null;
}

function pct(n, d) {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return 0;
  return n / d;
}

function round(n, digits = 4) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  const p = 10 ** digits;
  return Math.round(x * p) / p;
}

function avg(values) {
  const xs = values.map((x) => Number(x)).filter((x) => Number.isFinite(x));
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function classifyStyle({
  groupRatio,
  anticipatoryRatio,
  breakoutRatio,
  avgLatencyMin,
  resolvedSignals,
  minSampleForStyle = 5
}) {
  if (!Number.isFinite(resolvedSignals) || resolvedSignals < Math.max(3, Number(minSampleForStyle) || 5)) {
    return "insufficient_sample";
  }
  if (anticipatoryRatio >= 0.55 && avgLatencyMin != null && avgLatencyMin <= 90) return "anticipatory_sniper";
  if (breakoutRatio >= 0.55) return "breakout_follower";
  if (groupRatio >= 0.6) return "cluster_trader";
  if (groupRatio <= 0.35) return "solo_operator";
  return "balanced_operator";
}

/**
 * Compute distinct wallets around each buy in +-windowMs.
 * Returns Map key `token|bought_at_iso` -> distinct wallet count.
 */
function buildNeighborWalletCounts(rows, windowMs = 10 * 60 * 1000) {
  const byToken = new Map();
  for (const r of rows) {
    const token = String(r.token_address || "");
    const t = asMs(r.bought_at);
    if (!token || t == null) continue;
    if (!byToken.has(token)) byToken.set(token, []);
    byToken.get(token).push({ wallet: String(r.wallet_address || ""), t, bought_at: r.bought_at });
  }
  const out = new Map();
  for (const [token, arr] of byToken.entries()) {
    arr.sort((a, b) => a.t - b.t);
    for (let i = 0; i < arr.length; i += 1) {
      const center = arr[i];
      const wallets = new Set();
      for (let j = i; j >= 0; j -= 1) {
        if (center.t - arr[j].t > windowMs) break;
        if (arr[j].wallet) wallets.add(arr[j].wallet);
      }
      for (let j = i + 1; j < arr.length; j += 1) {
        if (arr[j].t - center.t > windowMs) break;
        if (arr[j].wallet) wallets.add(arr[j].wallet);
      }
      out.set(`${token}|${String(center.bought_at)}`, wallets.size);
    }
  }
  return out;
}

async function getActiveWallets(limit = 200) {
  const supabase = safeSupabase();
  if (!supabase) return { ok: false, reason: "supabase_unconfigured", rows: [] };
  const lim = Math.min(1000, Math.max(10, Math.floor(Number(limit) || 200)));
  const { data, error } = await supabase
    .from("smart_wallets")
    .select("wallet_address")
    .order("updated_at", { ascending: false })
    .limit(lim);
  if (error) return { ok: false, reason: error.message || "query_failed", rows: [] };
  return { ok: true, rows: (data || []).map((r) => String(r.wallet_address || "")).filter(Boolean) };
}

async function computeWalletBehaviorForWindow({
  walletAddress,
  lookbackDays = 30,
  pairCreatedAtCache = new Map(),
  minSampleForStyle = 5
}) {
  const supabase = safeSupabase();
  if (!supabase) return { ok: false, reason: "supabase_unconfigured" };
  const sinceIso = toIso(Date.now() - Math.max(1, lookbackDays) * 24 * 60 * 60 * 1000);

  const [{ data: buys, error: buysError }, { data: signals, error: sigError }] = await Promise.all([
    supabase
      .from("wallet_tokens")
      .select("wallet_address,token_address,bought_at,amount_usd")
      .eq("wallet_address", walletAddress)
      .gte("bought_at", sinceIso)
      .order("bought_at", { ascending: true })
      .limit(5000),
    supabase
      .from("smart_wallet_signals")
      .select("token_address,created_at,result_pct")
      .eq("wallet_address", walletAddress)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: true })
      .limit(5000)
  ]);
  if (buysError) return { ok: false, reason: buysError.message || "wallet_tokens_query_failed" };
  if (sigError) return { ok: false, reason: sigError.message || "signals_query_failed" };

  const buyRows = Array.isArray(buys) ? buys : [];
  const signalRows = Array.isArray(signals) ? signals : [];
  const tokenSet = new Set(buyRows.map((r) => String(r.token_address || "")).filter(Boolean));
  if (!buyRows.length && !signalRows.length) {
    return {
      ok: true,
      summary: {
        wallet_address: walletAddress,
        lookback_days: lookbackDays,
        sample_signals: 0,
        resolved_signals: 0,
        win_rate_real: 0,
        avg_position_size_usd: 0,
        avg_size_pre_pump_usd: 0,
        avg_latency_post_deploy_min: null,
        solo_buy_ratio: 0,
        group_buy_ratio: 0,
        anticipatory_buy_ratio: 0,
        breakout_buy_ratio: 0,
        style_label: "insufficient_sample",
        computed_at: toIso(Date.now())
      },
      tokenFeatures: []
    };
  }

  // Peer rows for solo/group analysis.
  let peerRows = [];
  if (tokenSet.size > 0) {
    const tokens = [...tokenSet].slice(0, 500);
    const { data: peers } = await supabase
      .from("wallet_tokens")
      .select("wallet_address,token_address,bought_at")
      .in("token_address", tokens)
      .gte("bought_at", sinceIso)
      .order("bought_at", { ascending: true })
      .limit(20000);
    peerRows = Array.isArray(peers) ? peers : [];
  }
  const neighborMap = buildNeighborWalletCounts(peerRows);

  // Token-level signals by token for matching.
  const byTokenSignals = new Map();
  for (const s of signalRows) {
    const token = String(s.token_address || "");
    if (!token) continue;
    if (!byTokenSignals.has(token)) byTokenSignals.set(token, []);
    byTokenSignals.get(token).push(s);
  }

  const prePumpAmounts = [];
  const latencyMinArr = [];
  let groupBuys = 0;
  let soloBuys = 0;
  let anticipatoryBuys = 0;
  let breakoutBuys = 0;

  const tokenAgg = new Map(); // token -> agg
  const buyAmountArr = buyRows.map((r) => Number(r.amount_usd)).filter((n) => Number.isFinite(n) && n > 0);

  for (const b of buyRows) {
    const token = String(b.token_address || "");
    const boughtAtIso = String(b.bought_at || "");
    const boughtAtMs = asMs(boughtAtIso);
    if (!token || boughtAtMs == null) continue;
    const amountUsd = Number(b.amount_usd);

    const nWallets = Number(neighborMap.get(`${token}|${boughtAtIso}`) || 1);
    const isGroup = nWallets >= 3;
    if (isGroup) groupBuys += 1;
    else soloBuys += 1;

    let pairCreatedAtMs = pairCreatedAtCache.get(token);
    if (pairCreatedAtMs === undefined) {
      try {
        const md = await getMarketData(token);
        const raw = Number(md?.pairCreatedAt);
        pairCreatedAtMs = Number.isFinite(raw) && raw > 0 ? raw : null;
      } catch (_) {
        pairCreatedAtMs = null;
      }
      pairCreatedAtCache.set(token, pairCreatedAtMs);
    }
    let latencyMin = null;
    if (pairCreatedAtMs != null) {
      const m = (boughtAtMs - pairCreatedAtMs) / 60000;
      if (Number.isFinite(m) && m >= 0) {
        latencyMin = m;
        latencyMinArr.push(m);
        if (m <= 60) anticipatoryBuys += 1;
        if (m >= 180) breakoutBuys += 1;
      }
    }

    // Match closest signal (same token) in +-6h to derive "pre-pump" from realized proxy.
    const rows = byTokenSignals.get(token) || [];
    let best = null;
    let bestDt = Infinity;
    for (const s of rows) {
      const st = asMs(s.created_at);
      if (st == null) continue;
      const dt = Math.abs(st - boughtAtMs);
      if (dt < bestDt && dt <= 6 * 60 * 60 * 1000) {
        bestDt = dt;
        best = s;
      }
    }
    const resPct = best?.result_pct != null ? Number(best.result_pct) : null;
    const isPrePumpWin = Number.isFinite(resPct) && resPct >= 20;
    if (isPrePumpWin && Number.isFinite(amountUsd) && amountUsd > 0) prePumpAmounts.push(amountUsd);

    const key = token;
    if (!tokenAgg.has(key)) {
      tokenAgg.set(key, {
        wallet_address: walletAddress,
        token_address: token,
        buys_count: 0,
        amount_sum_usd: 0,
        amount_count: 0,
        first_buy_at: boughtAtIso,
        last_buy_at: boughtAtIso,
        latency_sum_min: 0,
        latency_count: 0,
        group_count: 0,
        anticipatory_count: 0,
        breakout_count: 0,
        result_sum_pct: 0,
        result_count: 0,
        result_win_count: 0
      });
    }
    const agg = tokenAgg.get(key);
    agg.buys_count += 1;
    if (Number.isFinite(amountUsd) && amountUsd > 0) {
      agg.amount_sum_usd += amountUsd;
      agg.amount_count += 1;
    }
    if (asMs(agg.first_buy_at) > boughtAtMs) agg.first_buy_at = boughtAtIso;
    if (asMs(agg.last_buy_at) < boughtAtMs) agg.last_buy_at = boughtAtIso;
    if (latencyMin != null) {
      agg.latency_sum_min += latencyMin;
      agg.latency_count += 1;
    }
    if (isGroup) agg.group_count += 1;
    if (latencyMin != null && latencyMin <= 60) agg.anticipatory_count += 1;
    if (latencyMin != null && latencyMin >= 180) agg.breakout_count += 1;
    if (Number.isFinite(resPct)) {
      agg.result_sum_pct += resPct;
      agg.result_count += 1;
      if (resPct > 0) agg.result_win_count += 1;
    }
  }

  const resolvedSignals = signalRows
    .map((s) => Number(s.result_pct))
    .filter((n) => Number.isFinite(n));
  const wins = resolvedSignals.filter((n) => n > 0).length;
  const sampleSignals = signalRows.length;
  const buyCount = buyRows.length;
  const winRateReal = round(100 * pct(wins, resolvedSignals.length), 2);
  const avgPositionSizeUsd = round(avg(buyAmountArr) || 0, 4);
  const avgSizePrePumpUsd = round(avg(prePumpAmounts) || 0, 4);
  const avgLatencyPostDeployMin = avg(latencyMinArr);
  const groupRatio = round(pct(groupBuys, buyCount), 4);
  const soloRatio = round(pct(soloBuys, buyCount), 4);
  const anticipatoryRatio = round(pct(anticipatoryBuys, buyCount), 4);
  const breakoutRatio = round(pct(breakoutBuys, buyCount), 4);

  const summary = {
    wallet_address: walletAddress,
    lookback_days: Math.max(1, Number(lookbackDays) || 30),
    sample_signals: sampleSignals,
    resolved_signals: resolvedSignals.length,
    win_rate_real: winRateReal,
    avg_position_size_usd: avgPositionSizeUsd,
    avg_size_pre_pump_usd: avgSizePrePumpUsd,
    avg_latency_post_deploy_min:
      Number.isFinite(avgLatencyPostDeployMin) && avgLatencyPostDeployMin != null
        ? round(avgLatencyPostDeployMin, 4)
        : null,
    solo_buy_ratio: soloRatio,
    group_buy_ratio: groupRatio,
    anticipatory_buy_ratio: anticipatoryRatio,
    breakout_buy_ratio: breakoutRatio,
    style_label: classifyStyle({
      groupRatio,
      anticipatoryRatio,
      breakoutRatio,
      avgLatencyMin: avgLatencyPostDeployMin,
      resolvedSignals: resolvedSignals.length,
      minSampleForStyle
    }),
    computed_at: toIso(Date.now())
  };

  const tokenFeatures = [...tokenAgg.values()].map((x) => ({
    wallet_address: x.wallet_address,
    token_address: x.token_address,
    first_buy_at: x.first_buy_at,
    last_buy_at: x.last_buy_at,
    buys_count: x.buys_count,
    avg_amount_usd: x.amount_count > 0 ? round(x.amount_sum_usd / x.amount_count, 4) : 0,
    avg_latency_post_deploy_min: x.latency_count > 0 ? round(x.latency_sum_min / x.latency_count, 4) : null,
    group_buy_ratio: round(pct(x.group_count, x.buys_count), 4),
    anticipatory_ratio: round(pct(x.anticipatory_count, x.buys_count), 4),
    breakout_ratio: round(pct(x.breakout_count, x.buys_count), 4),
    win_rate_real: round(100 * pct(x.result_win_count, x.result_count), 2),
    avg_result_pct: x.result_count > 0 ? round(x.result_sum_pct / x.result_count, 4) : null,
    computed_at: toIso(Date.now())
  }));

  return { ok: true, summary, tokenFeatures };
}

async function upsertWalletBehavior(computed) {
  const supabase = safeSupabase();
  if (!supabase) return { ok: false, reason: "supabase_unconfigured" };
  const summary = computed?.summary;
  const tokenFeatures = Array.isArray(computed?.tokenFeatures) ? computed.tokenFeatures : [];
  if (!summary?.wallet_address) return { ok: false, reason: "invalid_payload" };

  const { error: sErr } = await supabase
    .from("wallet_behavior_stats")
    .upsert(summary, { onConflict: "wallet_address" });
  if (sErr) return { ok: false, reason: sErr.message || "summary_upsert_failed" };

  // Keep feature table bounded to recent token rows by replacing wallet slice atomically-ish.
  const { error: dErr } = await supabase
    .from("wallet_behavior_token_features")
    .delete()
    .eq("wallet_address", summary.wallet_address);
  if (dErr) return { ok: false, reason: dErr.message || "token_features_delete_failed" };

  if (tokenFeatures.length > 0) {
    const { error: iErr } = await supabase
      .from("wallet_behavior_token_features")
      .insert(tokenFeatures.slice(0, 1000));
    if (iErr) return { ok: false, reason: iErr.message || "token_features_insert_failed" };
  }

  return { ok: true, tokenFeatures: tokenFeatures.length };
}

async function getWalletBehaviorSummary(walletAddress) {
  const supabase = safeSupabase();
  if (!supabase) return { ok: false, reason: "supabase_unconfigured" };
  const { data, error } = await supabase
    .from("wallet_behavior_stats")
    .select("*")
    .eq("wallet_address", String(walletAddress || ""))
    .maybeSingle();
  if (error) return { ok: false, reason: error.message || "query_failed" };
  return { ok: true, data: data || null };
}

async function getWalletBehaviorTop({ limit = 50, minResolved = 5 } = {}) {
  const supabase = safeSupabase();
  if (!supabase) return { ok: false, reason: "supabase_unconfigured", rows: [] };
  const lim = Math.min(200, Math.max(1, Number(limit) || 50));
  const minR = Math.max(0, Number(minResolved) || 5);
  const { data, error } = await supabase
    .from("wallet_behavior_stats")
    .select("*")
    .gte("resolved_signals", minR)
    .order("win_rate_real", { ascending: false })
    .limit(lim);
  if (error) return { ok: false, reason: error.message || "query_failed", rows: [] };
  return { ok: true, rows: data || [] };
}

async function getWalletBehaviorTokenFeatures(walletAddress, limit = 100) {
  const supabase = safeSupabase();
  if (!supabase) return { ok: false, reason: "supabase_unconfigured", rows: [] };
  const lim = Math.min(500, Math.max(1, Number(limit) || 100));
  const { data, error } = await supabase
    .from("wallet_behavior_token_features")
    .select("*")
    .eq("wallet_address", String(walletAddress || ""))
    .order("computed_at", { ascending: false })
    .order("buys_count", { ascending: false })
    .limit(lim);
  if (error) return { ok: false, reason: error.message || "query_failed", rows: [] };
  return { ok: true, rows: data || [] };
}

module.exports = {
  getActiveWallets,
  computeWalletBehaviorForWindow,
  upsertWalletBehavior,
  getWalletBehaviorSummary,
  getWalletBehaviorTop,
  getWalletBehaviorTokenFeatures
};

