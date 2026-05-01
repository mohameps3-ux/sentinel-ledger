"use strict";

const { getSupabase } = require("../lib/supabase");

const WINDOW_MS = 90_000;
const MIN_CLUSTER_SIZE = 3;
const HIT_THRESHOLD = 5;
const SIGNAL_LIMIT = 20_000;
const PAGE_SIZE = 1000;

function normalize(t) {
  return String(t ?? "")
    .toLowerCase()
    .trim();
}

async function fetchBuySignals(supabase) {
  const out = [];
  let from = 0;
  while (out.length < SIGNAL_LIMIT) {
    const remaining = SIGNAL_LIMIT - out.length;
    const take = Math.min(PAGE_SIZE, remaining);
    const to = from + take - 1;
    const { data: page, error } = await supabase
      .from("smart_wallet_signals")
      .select("id, token_address, wallet_address, created_at")
      .in("last_action", ["buy", "BUY", "Buy"])
      .order("created_at", { ascending: true })
      .range(from, to);
    if (error) throw error;
    if (!page || page.length === 0) break;
    out.push(...page);
    from += page.length;
    if (page.length < take) break;
  }
  return out;
}

async function runClusterBackfill() {
  let supabase;
  try {
    supabase = getSupabase();
  } catch (e) {
    const msg = e?.message || String(e);
    console.error("[cluster-backfill] supabase:", msg);
    return { ok: false, error: msg };
  }

  console.log("[cluster-backfill] starting...");

  let signals;
  try {
    signals = await fetchBuySignals(supabase);
  } catch (error) {
    console.error("[cluster-backfill] failed to load signals:", error.message);
    return { ok: false, error: error.message };
  }

  if (!signals || signals.length === 0) {
    console.warn("[cluster-backfill] 0 signals loaded — check last_action values in DB");
    return { ok: false, error: "no buy signals found" };
  }

  console.log(`[cluster-backfill] loaded ${signals.length} buy signals`);

  const byToken = {};
  for (const s of signals) {
    const k = normalize(s.token_address);
    if (!k) continue;
    if (!byToken[k]) byToken[k] = [];
    byToken[k].push({
      wallet: s.wallet_address,
      ts: new Date(s.created_at).getTime()
    });
  }

  const activations = [];
  for (const [token, entries] of Object.entries(byToken)) {
    entries.sort((a, b) => a.ts - b.ts);

    let i = 0;
    while (i < entries.length) {
      const windowStart = entries[i].ts;
      const windowEnd = windowStart + WINDOW_MS;

      const inWindow = [];
      let j = i;
      while (j < entries.length && entries[j].ts <= windowEnd) {
        inWindow.push(entries[j]);
        j++;
      }

      const uniqueWallets = [...new Set(inWindow.map((e) => e.wallet))].filter(Boolean);

      if (uniqueWallets.length >= MIN_CLUSTER_SIZE) {
        const sorted = [...uniqueWallets].sort();
        const clusterSig = sorted.join("|");
        activations.push({ token, wallets: sorted, clusterSig });
        i = j;
      } else {
        i++;
      }
    }
  }

  console.log(`[cluster-backfill] found ${activations.length} cluster activations`);

  if (activations.length === 0) {
    console.log("[cluster-backfill] no clusters found — need more coordinated buy data");
    return { ok: true, activations: 0, upserted: 0, loaded: signals.length };
  }

  const { data: outcomes, error: outcomesError } = await supabase
    .from("signal_performance")
    .select("asset, outcome_pct, success")
    .not("outcome_pct", "is", null)
    .limit(5000);

  if (outcomesError) {
    console.warn("[cluster-backfill] outcomes load:", outcomesError.message);
  }

  const outcomeByToken = {};
  for (const o of outcomes ?? []) {
    const key = normalize(o.asset);
    if (!key) continue;
    if (!outcomeByToken[key]) outcomeByToken[key] = [];
    outcomeByToken[key].push(Number(o.outcome_pct));
  }

  const clusterMap = {};
  for (const act of activations) {
    if (!clusterMap[act.clusterSig]) {
      clusterMap[act.clusterSig] = {
        wallets: act.wallets,
        clusterSig: act.clusterSig,
        hits: 0,
        total: 0,
        outcomes: []
      };
    }
    const c = clusterMap[act.clusterSig];
    c.total++;

    const tokenOutcomes = outcomeByToken[act.token] ?? [];
    if (tokenOutcomes.length > 0) {
      const avg = tokenOutcomes.reduce((a, b) => a + b, 0) / tokenOutcomes.length;
      c.outcomes.push(avg);
      if (avg > HIT_THRESHOLD) c.hits++;
    }
  }

  let upserted = 0;
  for (const c of Object.values(clusterMap)) {
    const hitRate = c.total > 0 ? c.hits / c.total : 0;

    const avgPerformance =
      c.outcomes.length > 0 ? c.outcomes.reduce((a, b) => a + b, 0) / c.outcomes.length : 0;

    const variance =
      c.outcomes.length > 1
        ? c.outcomes.reduce((a, v) => a + (v - avgPerformance) ** 2, 0) / c.outcomes.length
        : 0;
    const volatilityScore = Math.sqrt(variance);

    const { error: upsertErr } = await supabase.from("cluster_intel").upsert(
      {
        wallet_addresses: c.wallets,
        cluster_sig: c.clusterSig,
        hit_rate: hitRate,
        avg_performance: avgPerformance,
        volatility_score: volatilityScore,
        total_activations: c.total,
        last_active: new Date().toISOString()
      },
      { onConflict: "cluster_sig" }
    );

    if (!upsertErr) {
      upserted++;
    } else {
      console.warn("[cluster-backfill] upsert error:", upsertErr.message);
    }
  }

  console.log(`[cluster-backfill] upserted ${upserted} clusters`);
  return {
    ok: true,
    loaded: signals.length,
    activations: activations.length,
    upserted
  };
}

module.exports = { runClusterBackfill };
