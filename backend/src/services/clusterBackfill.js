"use strict";

const { createHash } = require("crypto");
const { getSupabase } = require("../lib/supabase");

const WINDOW_MS = 90_000;
const MIN_CLUSTER_SIZE = 3;
const HIT_THRESHOLD = 5;
const SIGNAL_LIMIT = 20_000;
const PAGE_SIZE = 1000;
const MIN_WALLET_GROUP = 2;
const MIN_SHARED_TOKENS = 2;

function clusterHash(wallets) {
  const sig = [...wallets].sort().join("|");
  return createHash("sha1").update(sig).digest("hex").slice(0, 32);
}

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

async function upsertIntelIdentity(supabase, clusterSig, sortedWallets) {
  const { data: existing, error: selErr } = await supabase
    .from("cluster_intel")
    .select("cluster_id")
    .eq("cluster_sig", clusterSig)
    .maybeSingle();
  if (selErr) {
    console.warn("[cluster-backfill] cluster_intel lookup:", selErr.message);
    return false;
  }
  const lastActive = new Date().toISOString();
  if (existing) {
    const { error } = await supabase
      .from("cluster_intel")
      .update({ wallet_addresses: sortedWallets, last_active: lastActive })
      .eq("cluster_sig", clusterSig);
    return !error;
  }
  const { error } = await supabase.from("cluster_intel").insert({
    cluster_sig: clusterSig,
    wallet_addresses: sortedWallets,
    last_active: lastActive
  });
  return !error;
}

/**
 * Builds wallet_clusters from coordinated-buy history: wallets that share >= MIN_SHARED_TOKENS
 * distinct tokens. Syncs identity rows into cluster_intel without wiping outcome metrics.
 */
async function buildWalletClusters() {
  let supabase;
  try {
    supabase = getSupabase();
  } catch (e) {
    const msg = e?.message || String(e);
    console.error("[wallet-clusters] supabase:", msg);
    return {
      ok: false,
      error: msg,
      pairsGe2SharedTokens: 0,
      groups: 0,
      walletRowsUpserted: 0,
      intelSynced: 0
    };
  }

  let signals;
  try {
    signals = await fetchBuySignals(supabase);
  } catch (error) {
    console.error("[wallet-clusters] load signals:", error.message);
    return {
      ok: false,
      error: error.message,
      pairsGe2SharedTokens: 0,
      groups: 0,
      walletRowsUpserted: 0,
      intelSynced: 0
    };
  }

  if (!signals.length) {
    return {
      ok: true,
      pairsGe2SharedTokens: 0,
      groups: 0,
      walletRowsUpserted: 0,
      intelSynced: 0
    };
  }

  const walletToTokens = new Map();
  for (const s of signals) {
    const w = String(s.wallet_address || "").trim();
    const t = normalize(s.token_address);
    if (!w || !t) continue;
    if (!walletToTokens.has(w)) walletToTokens.set(w, new Set());
    walletToTokens.get(w).add(t);
  }

  const wallets = [...walletToTokens.keys()];
  let pairsGe2SharedTokens = 0;
  const adj = new Map();

  function addEdge(a, b) {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a).add(b);
    adj.get(b).add(a);
  }

  for (let i = 0; i < wallets.length; i++) {
    for (let j = i + 1; j < wallets.length; j++) {
      const a = wallets[i];
      const b = wallets[j];
      const sa = walletToTokens.get(a);
      const sb = walletToTokens.get(b);
      let shared = 0;
      if (sa && sb) {
        for (const x of sa) {
          if (sb.has(x)) {
            shared += 1;
            if (shared >= MIN_SHARED_TOKENS) break;
          }
        }
      }
      if (shared >= MIN_SHARED_TOKENS) {
        pairsGe2SharedTokens += 1;
        addEdge(a, b);
      }
    }
  }

  const visited = new Set();
  const rawGroups = [];
  for (const w of wallets) {
    if (visited.has(w)) continue;
    if (!adj.has(w) || adj.get(w).size === 0) continue;
    const comp = [];
    const stack = [w];
    while (stack.length) {
      const x = stack.pop();
      if (visited.has(x)) continue;
      visited.add(x);
      comp.push(x);
      for (const y of adj.get(x) || []) {
        if (!visited.has(y)) stack.push(y);
      }
    }
    if (comp.length >= MIN_WALLET_GROUP) rawGroups.push(comp.sort());
  }

  const { data: smartRows, error: smartErr } = await supabase
    .from("smart_wallets")
    .select("wallet_address");
  if (smartErr) {
    console.warn("[wallet-clusters] smart_wallets:", smartErr.message);
  }
  const smartSet = new Set((smartRows || []).map((r) => String(r.wallet_address || "").trim()).filter(Boolean));

  const validGroups = rawGroups
    .map((g) => g.filter((addr) => smartSet.has(addr)))
    .filter((g) => g.length >= MIN_WALLET_GROUP);

  let walletRowsUpserted = 0;
  let intelSynced = 0;

  for (const group of validGroups) {
    const sorted = [...group].sort();
    const clusterSig = clusterHash(sorted);

    const { error: delErr } = await supabase.from("wallet_clusters").delete().in("wallet_address", sorted);
    if (delErr) console.warn("[wallet-clusters] delete:", delErr.message);

    for (const addr of sorted) {
      const { error: insErr } = await supabase.from("wallet_clusters").insert({
        cluster_name: clusterSig,
        wallet_address: addr,
        confidence: 70
      });
      if (!insErr) walletRowsUpserted += 1;
      else console.warn("[wallet-clusters] insert:", insErr.message);
    }

    if (await upsertIntelIdentity(supabase, clusterSig, sorted)) {
      intelSynced += 1;
    }
  }

  return {
    ok: true,
    pairsGe2SharedTokens,
    groups: validGroups.length,
    walletRowsUpserted,
    intelSynced
  };
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
        const clusterSig = clusterHash(sorted);
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

module.exports = { runClusterBackfill, buildWalletClusters, clusterHash };
