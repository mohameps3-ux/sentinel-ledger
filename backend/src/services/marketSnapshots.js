"use strict";

const { getSupabase } = require("../lib/supabase");

const DEFAULT_MAX_AGE_MS = Math.max(60_000, Number(process.env.MARKET_SNAPSHOT_MAX_AGE_MS || 5 * 60 * 1000));

function safeSupabase() {
  try {
    return getSupabase();
  } catch (_) {
    return null;
  }
}

function toNum(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeSnapshotRow(row) {
  if (!row) return null;
  return {
    mint: String(row.mint || ""),
    price: toNum(row.price, 0),
    liquidity: toNum(row.liquidity, 0),
    volume24h: toNum(row.volume24h, 0),
    priceChange24h: toNum(row.price_change24h, 0),
    marketCap: toNum(row.market_cap, null),
    symbol: String(row.symbol || "?"),
    name: String(row.name || ""),
    source: String(row.source || "snapshot"),
    providerUsed: row.provider_used ? String(row.provider_used) : null,
    updatedAt: row.updated_at || null
  };
}

async function upsertMarketSnapshot(mint, marketData, meta = {}) {
  const supabase = safeSupabase();
  if (!supabase || !mint || !marketData) return { ok: false, reason: "unconfigured" };
  const payload = {
    mint: String(mint),
    price: toNum(marketData.price, 0),
    liquidity: toNum(marketData.liquidity, 0),
    volume24h: toNum(marketData.volume24h, 0),
    price_change24h: toNum(marketData.priceChange24h, 0),
    market_cap: toNum(marketData.marketCap, null),
    symbol: String(marketData.symbol || "?"),
    name: String(marketData.name || ""),
    source: String(meta.source || "market_data"),
    provider_used: meta.providerUsed ? String(meta.providerUsed) : null,
    updated_at: new Date().toISOString()
  };
  const { error } = await supabase.from("market_snapshots").upsert(payload, { onConflict: "mint" });
  if (error) return { ok: false, reason: error.message || "upsert_failed" };
  return { ok: true };
}

async function getRecentMarketSnapshot(mint, maxAgeMs = DEFAULT_MAX_AGE_MS) {
  const supabase = safeSupabase();
  if (!supabase || !mint) return null;
  const { data, error } = await supabase
    .from("market_snapshots")
    .select("mint, price, liquidity, volume24h, price_change24h, market_cap, symbol, name, source, provider_used, updated_at")
    .eq("mint", String(mint))
    .maybeSingle();
  if (error || !data) return null;
  const updatedAtMs = Date.parse(data.updated_at);
  if (!Number.isFinite(updatedAtMs)) return null;
  if (Date.now() - updatedAtMs > Math.max(60_000, Number(maxAgeMs) || DEFAULT_MAX_AGE_MS)) return null;
  return normalizeSnapshotRow(data);
}

async function listWarmupCandidateMints(limit = 40) {
  const supabase = safeSupabase();
  if (!supabase) return [];
  const lim = Math.min(200, Math.max(10, Number(limit) || 40));
  const horizonIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const score = new Map();
  const note = (mint, points) => {
    if (!mint) return;
    score.set(mint, (score.get(mint) || 0) + points);
  };

  try {
    const { data: sws } = await supabase
      .from("smart_wallet_signals")
      .select("token_address, created_at")
      .gte("created_at", horizonIso)
      .order("created_at", { ascending: false })
      .limit(400);
    for (const row of sws || []) {
      note(String(row.token_address || ""), 3);
    }
  } catch (_) {}

  try {
    const { data: perf } = await supabase
      .from("signal_performance")
      .select("asset, emitted_at")
      .gte("emitted_at", horizonIso)
      .order("emitted_at", { ascending: false })
      .limit(400);
    for (const row of perf || []) {
      note(String(row.asset || ""), 2);
    }
  } catch (_) {}

  try {
    const { data: analyzed } = await supabase
      .from("tokens_analyzed")
      .select("token_address, updated_at")
      .order("updated_at", { ascending: false })
      .limit(300);
    for (const row of analyzed || []) {
      note(String(row.token_address || ""), 1);
    }
  } catch (_) {}

  return [...score.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, lim)
    .map(([mint]) => mint)
    .filter(Boolean);
}

module.exports = {
  upsertMarketSnapshot,
  getRecentMarketSnapshot,
  listWarmupCandidateMints
};
