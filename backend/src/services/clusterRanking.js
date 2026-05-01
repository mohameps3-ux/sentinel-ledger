"use strict";

const { getSupabase } = require("../lib/supabase");

function clamp(n, min, max) {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function computeClusterRank(cluster) {
  const hitRate = Number(cluster.hit_rate ?? 0);
  const avgPerf = Number(cluster.avg_performance ?? 0);
  const vol = Number(cluster.volatility_score ?? 0);
  const total = Number(cluster.total_activations ?? 0);
  const fails = Number(cluster.consecutive_failures ?? 0);

  const consistency = hitRate * 100;
  const sampleBonus = Math.log10(total + 1) * 10;
  const perfBonus = avgPerf > 0 ? avgPerf * 2 : avgPerf;
  const volPenalty = vol * 1.5;
  const failPenalty = fails * 12;

  const lastActiveTs = cluster.last_active ? new Date(cluster.last_active).getTime() : 0;
  const ageHours = lastActiveTs ? (Date.now() - lastActiveTs) / (1000 * 60 * 60) : 999;

  let decayMultiplier = 1;
  if (ageHours > 72) decayMultiplier = 0.2;
  else if (ageHours > 48) decayMultiplier = 0.4;
  else if (ageHours > 24) decayMultiplier = 0.7;

  const raw = consistency + sampleBonus + perfBonus - volPenalty - failPenalty;
  return clamp(raw * decayMultiplier, 0, 100);
}

async function updateClusterRanking() {
  let supabase;
  try {
    supabase = getSupabase();
  } catch (e) {
    return { ok: false, error: e?.message || "supabase_unconfigured" };
  }

  console.log("[cluster-ranking] starting...");

  const { data: clusters, error } = await supabase
    .from("cluster_intel")
    .select(
      "cluster_id, hit_rate, avg_performance, volatility_score, total_activations, consecutive_failures, last_active, tags"
    );

  if (error) {
    console.error("[cluster-ranking] load error:", error.message);
    return { ok: false, error: error.message };
  }

  if (!clusters?.length) {
    console.log("[cluster-ranking] no clusters to rank yet");
    return { ok: true, updated: 0 };
  }

  let updated = 0;
  for (const c of clusters) {
    const fails = Number(c.consecutive_failures ?? 0);
    const isBlacklisted = fails >= 3;
    const rankScore = isBlacklisted ? 0 : computeClusterRank(c);
    const decayScore = clamp(100 - rankScore, 0, 100);

    const existingTags = Array.isArray(c.tags) ? c.tags : [];
    const newTags = isBlacklisted
      ? [...new Set([...existingTags, "blacklisted"])]
      : existingTags.filter((t) => t !== "blacklisted");

    const { error: upErr } = await supabase
      .from("cluster_intel")
      .update({
        rank_score: rankScore,
        decay_score: decayScore,
        last_ranked_at: new Date().toISOString(),
        tags: newTags
      })
      .eq("cluster_id", c.cluster_id);

    if (!upErr) updated++;
    else console.warn("[cluster-ranking] update error:", upErr.message);
  }

  console.log(`[cluster-ranking] ranked ${updated} clusters`);
  return { ok: true, updated };
}

module.exports = { updateClusterRanking, computeClusterRank };
