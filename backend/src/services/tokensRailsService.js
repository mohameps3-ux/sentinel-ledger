"use strict";

/**
 * Hot / Live / Velocity token rails for home + scanner.
 *
 * Field proxies (no DB columns for sub-hour tape):
 * - liquidity_usd  ← market_snapshots.liquidity or live getMarketData().liquidity
 * - price_change_15m_pct ← getMarketData().priceChange5m (5m Dex proxy for 15m)
 * - price_change_60m_pct ← getMarketData().priceChange1h (1h proxy for 60m)
 * - volume_15m_usd ← volume24h / 96 when Dex m5 volume unavailable
 * - volume_60m_usd ← volume24h / 24 when Dex h1 volume unavailable
 */

const { getSupabase } = require("../lib/supabase");
const { getOpsPostgresPool } = require("../lib/opsPostgresPool");
const { getMarketData } = require("./marketData");
const { getRecentMarketSnapshot } = require("./marketSnapshots");

const CACHE_TTL_MS = Math.max(5_000, Number(process.env.TOKENS_RAILS_CACHE_MS || 30_000));
const SNAPSHOT_MAX_AGE_MS = Math.max(60_000, Number(process.env.TOKENS_RAILS_SNAPSHOT_MAX_AGE_MS || 5 * 60_000));
const RAIL_MIN_LIQUIDITY_USD = Number(process.env.TOKENS_RAILS_MIN_LIQUIDITY_USD || 15000);
const RAIL_MAX_24H_DRAWDOWN_PCT = Number(process.env.TOKENS_RAILS_MAX_24H_DRAWDOWN_PCT || -50);
const MARKET_BATCH = Math.max(2, Math.min(8, Number(process.env.TOKENS_RAILS_MARKET_BATCH || 6)));
const ELITE_WIN_RATE = Math.max(50, Number(process.env.WALLET_REPUTATION_ELITE_WIN_RATE || 55));

let cache = { at: 0, payload: null };

function safeSupabase() {
  try {
    return getSupabase();
  } catch {
    return null;
  }
}

function num(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function formatUsdCompact(n) {
  const v = num(n, 0);
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1000)}k`;
  return `$${Math.round(v)}`;
}

function signalTagsFromJson(signals) {
  if (!Array.isArray(signals)) return [];
  return [...new Set(signals.map((s) => String(s || "").trim()).filter(Boolean))];
}

async function fetchHotCandidatesPg(client) {
  const { rows } = await client.query(
    `
    SELECT
      wt.token_address,
      COUNT(DISTINCT wt.wallet_address)::int AS distinct_wallets_4h,
      COUNT(DISTINCT wt.wallet_address) FILTER (
        WHERE COALESCE(sw.win_rate, 0) >= $1 OR COALESCE(sw.smart_score, 0) >= 70
      )::int AS smart_wallets_4h,
      COALESCE(SUM(wt.amount_usd), 0)::float AS volume_4h_usd
    FROM wallet_tokens wt
    LEFT JOIN smart_wallets sw ON sw.wallet_address = wt.wallet_address
    WHERE wt.bought_at >= NOW() - INTERVAL '4 hours'
    GROUP BY wt.token_address
    HAVING COUNT(DISTINCT wt.wallet_address) >= 1
    ORDER BY (
      COUNT(DISTINCT wt.wallet_address) * 2
      + COUNT(DISTINCT wt.wallet_address) FILTER (
          WHERE COALESCE(sw.win_rate, 0) >= $1 OR COALESCE(sw.smart_score, 0) >= 70
        ) * 10
      + LN(GREATEST(COALESCE(SUM(wt.amount_usd), 0), 1)) * 5
    ) DESC
    LIMIT 60
    `,
    [ELITE_WIN_RATE]
  );
  return rows || [];
}

async function fetchHotCandidatesSupabase(supabase) {
  const since = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("wallet_tokens")
    .select("token_address, wallet_address, amount_usd")
    .gte("bought_at", since)
    .limit(8000);
  if (error || !data?.length) return [];

  const walletSet = new Set(data.map((r) => r.wallet_address).filter(Boolean));
  const eliteWallets = new Set();
  if (walletSet.size) {
    const wallets = [...walletSet].slice(0, 500);
    const { data: swRows } = await supabase
      .from("smart_wallets")
      .select("wallet_address, win_rate, smart_score")
      .in("wallet_address", wallets);
    for (const sw of swRows || []) {
      if (num(sw.win_rate, 0) >= ELITE_WIN_RATE || num(sw.smart_score, 0) >= 70) {
        eliteWallets.add(sw.wallet_address);
      }
    }
  }

  const byToken = new Map();
  for (const row of data) {
    const mint = String(row.token_address || "");
    if (!mint) continue;
    let agg = byToken.get(mint);
    if (!agg) {
      agg = { token_address: mint, wallets: new Set(), smartWallets: new Set(), volume_4h_usd: 0 };
      byToken.set(mint, agg);
    }
    agg.wallets.add(row.wallet_address);
    if (eliteWallets.has(row.wallet_address)) agg.smartWallets.add(row.wallet_address);
    agg.volume_4h_usd += num(row.amount_usd, 0);
  }

  return [...byToken.values()]
    .map((agg) => {
      const distinct = agg.wallets.size;
      const smart = agg.smartWallets.size;
      const vol = agg.volume_4h_usd;
      const hotScore = distinct * 2 + smart * 10 + Math.log(Math.max(vol, 1)) * 5;
      return {
        token_address: agg.token_address,
        distinct_wallets_4h: distinct,
        smart_wallets_4h: smart,
        volume_4h_usd: vol,
        hot_score: hotScore
      };
    })
    .sort((a, b) => b.hot_score - a.hot_score)
    .slice(0, 60);
}

async function fetchHotCandidates() {
  const pool = getOpsPostgresPool();
  if (pool) {
    const client = await pool.connect();
    try {
      return await fetchHotCandidatesPg(client);
    } finally {
      client.release();
    }
  }
  const supabase = safeSupabase();
  if (!supabase) return [];
  return fetchHotCandidatesSupabase(supabase);
}

async function fetchLiveCandidatesPg(client) {
  const { rows } = await client.query(
    `
    SELECT asset AS token_address,
           MAX(confidence)::float AS max_confidence,
           COUNT(*)::int AS signals_count,
           MAX(emitted_at) AS last_signal_at,
           jsonb_agg(signals) AS signals_json
    FROM signal_performance
    WHERE emitted_at >= NOW() - INTERVAL '60 minutes'
    GROUP BY asset
    ORDER BY MAX(confidence) DESC, COUNT(*) DESC
    LIMIT 40
    `
  );
  return (rows || []).map((r) => ({
    token_address: r.token_address,
    max_confidence: num(r.max_confidence, 0),
    signals_count: num(r.signals_count, 0),
    last_signal_at: r.last_signal_at,
    signal_types: signalTagsFromJson(
      Array.isArray(r.signals_json) ? r.signals_json.flatMap((j) => signalTagsFromJson(j)) : []
    )
  }));
}

async function fetchLiveCandidatesSupabase(supabase) {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("signal_performance")
    .select("asset, confidence, signals, emitted_at")
    .gte("emitted_at", since)
    .order("confidence", { ascending: false })
    .limit(500);
  if (error || !data?.length) return [];

  const byAsset = new Map();
  for (const row of data) {
    const mint = String(row.asset || "");
    if (!mint) continue;
    let agg = byAsset.get(mint);
    if (!agg) {
      agg = {
        token_address: mint,
        max_confidence: 0,
        signals_count: 0,
        signal_types: new Set(),
        last_signal_at: row.emitted_at
      };
      byAsset.set(mint, agg);
    }
    agg.signals_count += 1;
    agg.max_confidence = Math.max(agg.max_confidence, num(row.confidence, 0));
    for (const tag of signalTagsFromJson(row.signals)) agg.signal_types.add(tag);
    if (row.emitted_at > agg.last_signal_at) agg.last_signal_at = row.emitted_at;
  }

  return [...byAsset.values()]
    .map((agg) => ({
      token_address: agg.token_address,
      max_confidence: agg.max_confidence,
      signals_count: agg.signals_count,
      last_signal_at: agg.last_signal_at,
      signal_types: [...agg.signal_types]
    }))
    .sort((a, b) => b.max_confidence - a.max_confidence || b.signals_count - a.signals_count)
    .slice(0, 40);
}

async function fetchLiveCandidates() {
  const pool = getOpsPostgresPool();
  if (pool) {
    const client = await pool.connect();
    try {
      return await fetchLiveCandidatesPg(client);
    } finally {
      client.release();
    }
  }
  const supabase = safeSupabase();
  if (!supabase) return [];
  return fetchLiveCandidatesSupabase(supabase);
}

async function fetchVelocitySnapshotCandidates(supabase) {
  const since = new Date(Date.now() - SNAPSHOT_MAX_AGE_MS).toISOString();
  const { data } = await supabase
    .from("market_snapshots")
    .select("mint, symbol, price, liquidity, volume24h, price_change24h, updated_at")
    .gte("updated_at", since)
    .gte("liquidity", RAIL_MIN_LIQUIDITY_USD)
    .order("volume24h", { ascending: false })
    .limit(80);
  return data || [];
}

async function fetchSymbolsForMints(supabase, mints) {
  const out = new Map();
  if (!supabase || !mints.length) return out;
  const { data } = await supabase
    .from("market_snapshots")
    .select("mint, symbol")
    .in("mint", mints.slice(0, 80));
  for (const row of data || []) {
    out.set(String(row.mint), String(row.symbol || "?"));
  }
  return out;
}

async function enrichMarketForMints(mints) {
  const unique = [...new Set(mints.filter(Boolean))].slice(0, 64);
  const out = new Map();
  for (let i = 0; i < unique.length; i += MARKET_BATCH) {
    const batch = unique.slice(i, i + MARKET_BATCH);
    const chunk = await Promise.all(
      batch.map(async (mint) => {
        try {
          const live = await getMarketData(mint);
          if (live?.price || live?.liquidity || live?.volume24h) {
            const vol24 = num(live.volume24h, 0);
            return {
              mint,
              symbol: live.symbol || "?",
              price_usd: num(live.price, 0),
              liquidity_usd: num(live.liquidity, 0),
              price_change_15m_pct: num(live.priceChange5m, null),
              price_change_60m_pct: num(live.priceChange1h, null),
              price_change_24h_pct: num(live.priceChange24h, null),
              volume_15m_usd: vol24 > 0 ? vol24 / 96 : null,
              volume_60m_usd: vol24 > 0 ? vol24 / 24 : null,
              volume24h: vol24,
              fresh: true
            };
          }
        } catch {
          /* fall through */
        }
        const snap = await getRecentMarketSnapshot(mint, SNAPSHOT_MAX_AGE_MS);
        if (!snap) return null;
        const vol24 = num(snap.volume24h, 0);
        return {
          mint,
          symbol: snap.symbol || "?",
          price_usd: num(snap.price, 0),
          liquidity_usd: num(snap.liquidity, 0),
          price_change_15m_pct: null,
          price_change_60m_pct: num(snap.priceChange24h, null),
          price_change_24h_pct: num(snap.priceChange24h, null),
          volume_15m_usd: vol24 > 0 ? vol24 / 96 : null,
          volume_60m_usd: vol24 > 0 ? vol24 / 24 : null,
          volume24h: vol24,
          fresh: true
        };
      })
    );
    for (const row of chunk) {
      if (row?.mint) out.set(row.mint, row);
    }
  }
  return out;
}

function computeVelocityScore(m) {
  const p15 = num(m.price_change_15m_pct, null);
  const p60 = num(m.price_change_60m_pct, null);
  const v15 = num(m.volume_15m_usd, 0);
  const v60 = num(m.volume_60m_usd, 0);
  if (p15 == null) return null;
  if (p15 <= 0) return null;
  if (p60 != null && p60 < -15) return null;
  const priceTerm = p15 + (p60 != null && p60 > 0 ? p60 * 0.25 : 0);
  const volBaseline = v60 > 0 ? v60 / 4 : 0;
  const volTerm = volBaseline > 0 ? v15 / volBaseline : v15 >= 1000 ? 1 : 0;
  return priceTerm + volTerm;
}

function buildRailItem(base, market, rail, railScore, railReason, extras = {}) {
  const mint = String(base.token_address || base.mint || "");
  const m = market || {};
  return {
    token_address: mint,
    token_symbol: String(m.symbol || base.symbol || "?").replace(/^\$/, ""),
    rail,
    rail_score: Math.round(num(railScore, 0) * 10) / 10,
    rail_reason: railReason,
    liquidity_usd: num(m.liquidity_usd, 0),
    price_usd: num(m.price_usd, 0),
    price_change_15m_pct: m.price_change_15m_pct ?? null,
    price_change_60m_pct: m.price_change_60m_pct ?? null,
    volume_15m_usd: num(m.volume_15m_usd, 0),
    volume_60m_usd: num(m.volume_60m_usd, 0),
    smart_wallets_active_4h: num(extras.smart_wallets_active_4h, 0),
    signals_active: Array.isArray(extras.signals_active) ? extras.signals_active : [],
    max_confidence_60m: num(extras.max_confidence_60m, null),
    multi_rail: false
  };
}

function markMultiRail(hot, live, velocity) {
  const counts = new Map();
  for (const arr of [hot, live, velocity]) {
    for (const item of arr) {
      const k = item.token_address;
      counts.set(k, (counts.get(k) || 0) + 1);
    }
  }
  for (const arr of [hot, live, velocity]) {
    for (const item of arr) {
      if ((counts.get(item.token_address) || 0) >= 2) item.multi_rail = true;
    }
  }
}

async function composeTokensRails() {
  const start = Date.now();
  const supabase = safeSupabase();

  const [hotRaw, liveRaw, velocitySnaps] = await Promise.all([
    fetchHotCandidates(),
    fetchLiveCandidates(),
    supabase ? fetchVelocitySnapshotCandidates(supabase) : Promise.resolve([])
  ]);

  const mintSet = new Set();
  for (const r of hotRaw) mintSet.add(r.token_address);
  for (const r of liveRaw) mintSet.add(r.token_address);
  for (const r of velocitySnaps) mintSet.add(r.mint);

  const marketByMint = await enrichMarketForMints([...mintSet]);
  const symbolFallback = supabase ? await fetchSymbolsForMints(supabase, [...mintSet]) : new Map();

  const hot = [];
  for (const row of hotRaw) {
    const mint = String(row.token_address);
    const market = marketByMint.get(mint);
    const liq = num(market?.liquidity_usd, 0);
    if (liq < RAIL_MIN_LIQUIDITY_USD) continue;
    const ch24 = num(market?.price_change_24h_pct, null);
    if (ch24 != null && ch24 < RAIL_MAX_24H_DRAWDOWN_PCT) continue;
    const distinct = num(row.distinct_wallets_4h, 0);
    const smart = num(row.smart_wallets_4h, 0);
    const vol = num(row.volume_4h_usd, 0);
    const hotScore =
      num(row.hot_score, null) ??
      distinct * 2 + smart * 10 + Math.log(Math.max(vol, 1)) * 5;
    hot.push(
      buildRailItem(
        { token_address: mint, symbol: symbolFallback.get(mint) },
        market || { symbol: symbolFallback.get(mint), liquidity_usd: liq },
        "hot",
        hotScore,
        `${distinct} wallets · ${smart} smart · ${formatUsdCompact(vol)} vol (4h)`,
        {
          smart_wallets_active_4h: smart,
          signals_active: [],
          max_confidence_60m: null
        }
      )
    );
    if (hot.length >= 20) break;
  }

  const live = [];
  for (const row of liveRaw) {
    const mint = String(row.token_address);
    const market = marketByMint.get(mint);
    if (!market?.fresh) continue;
    const liq = num(market.liquidity_usd, 0);
    if (liq < RAIL_MIN_LIQUIDITY_USD) continue;
    const ch24 = num(market?.price_change_24h_pct, null);
    if (ch24 != null && ch24 < RAIL_MAX_24H_DRAWDOWN_PCT) continue;
    const types = row.signal_types || [];
    const typeLabel = types.length ? types.slice(0, 3).join(" + ") : "signal";
    live.push(
      buildRailItem(
        { token_address: mint, symbol: symbolFallback.get(mint) },
        market,
        "live",
        num(row.max_confidence, 0),
        `${typeLabel} · conf ${Math.round(num(row.max_confidence, 0))} · ${row.signals_count} signals (60m)`,
        {
          smart_wallets_active_4h: 0,
          signals_active: types,
          max_confidence_60m: num(row.max_confidence, 0)
        }
      )
    );
    if (live.length >= 20) break;
  }

  const velocityCandidates = [];
  for (const snap of velocitySnaps) {
    const mint = String(snap.mint);
    const market = marketByMint.get(mint) || {
      mint,
      symbol: snap.symbol,
      price_usd: num(snap.price, 0),
      liquidity_usd: num(snap.liquidity, 0),
      price_change_15m_pct: null,
      price_change_60m_pct: num(snap.price_change24h, null),
      volume_15m_usd: num(snap.volume24h, 0) / 96,
      volume_60m_usd: num(snap.volume24h, 0) / 24,
      fresh: true
    };
    const score = computeVelocityScore(market);
    if (score == null) continue;
    velocityCandidates.push({ mint, market, score });
  }
  for (const [mint, market] of marketByMint) {
    if (velocityCandidates.some((c) => c.mint === mint)) continue;
    const score = computeVelocityScore(market);
    if (score == null) continue;
    velocityCandidates.push({ mint, market, score });
  }
  velocityCandidates.sort((a, b) => b.score - a.score);

  const velocity = [];
  for (const { mint, market, score } of velocityCandidates) {
    const liq = num(market.liquidity_usd, 0);
    const v15 = num(market.volume_15m_usd, 0);
    const p15 = num(market.price_change_15m_pct, null);
    if (liq < RAIL_MIN_LIQUIDITY_USD || v15 < 1000 || p15 == null) continue;
    const ch24 = num(market?.price_change_24h_pct, null);
    if (ch24 != null && ch24 < RAIL_MAX_24H_DRAWDOWN_PCT) continue;
    const p15Label = p15 >= 0 ? `+${p15.toFixed(1)}%` : `${p15.toFixed(1)}%`;
    const volMult =
      num(market.volume_60m_usd, 0) > 0
        ? (v15 / (num(market.volume_60m_usd, 0) / 4)).toFixed(1)
        : "?";
    velocity.push(
      buildRailItem(
        { token_address: mint, symbol: market.symbol || symbolFallback.get(mint) },
        market,
        "velocity",
        score,
        `${p15Label} (15m) · vol ${volMult}x avg · liq ${formatUsdCompact(liq)}`,
        { smart_wallets_active_4h: 0, signals_active: [], max_confidence_60m: null }
      )
    );
    if (velocity.length >= 20) break;
  }

  markMultiRail(hot, live, velocity);

  return {
    ok: true,
    generated_at: new Date().toISOString(),
    hot,
    live,
    velocity,
    durationMs: Date.now() - start
  };
}

async function getTokensRailsCached({ force = false } = {}) {
  const now = Date.now();
  if (!force && cache.payload && now - cache.at < CACHE_TTL_MS) {
    return { ...cache.payload, cached: true };
  }
  const payload = await composeTokensRails();
  cache = { at: now, payload };
  return { ...payload, cached: false };
}

module.exports = {
  getTokensRailsCached,
  composeTokensRails,
  _clearTokensRailsCache: () => {
    cache = { at: 0, payload: null };
  }
};
