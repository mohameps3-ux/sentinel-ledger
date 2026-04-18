const { getSupabase } = require("../lib/supabase");

function computeEarlyEntryScore(buyPrice, maxPrice24h, minPrice24h) {
  const buy = Number(buyPrice || 0);
  const max = Number(maxPrice24h || 0);
  const min = Number(minPrice24h || 0);
  if (!max || max === min) return 0;
  const score = ((max - buy) / (max - min)) * 100;
  return Math.max(0, Math.min(100, score));
}

function computeConsistencyScore(winRateRatio, totalTrades) {
  const wr = Number(winRateRatio || 0);
  const trades = Math.max(0, Number(totalTrades || 0));
  const logFactor = Math.log10(trades + 1);
  return Math.max(0, Math.min(100, wr * 100 * logFactor));
}

async function detectCluster(tokenAddress, timestampIso) {
  const supabase = getSupabase();
  const center = new Date(timestampIso).getTime();
  if (!center || Number.isNaN(center)) return 0;
  const windowStart = new Date(center - 5 * 60 * 1000).toISOString();
  const windowEnd = new Date(center + 5 * 60 * 1000).toISOString();

  const { count, error } = await supabase
    .from("token_activity_logs")
    .select("*", { count: "exact", head: true })
    .eq("token_address", tokenAddress)
    .gte("timestamp", windowStart)
    .lte("timestamp", windowEnd);
  if (error) return 0;
  return Math.min(100, (count || 0) * 20);
}

module.exports = {
  computeEarlyEntryScore,
  computeConsistencyScore,
  detectCluster
};

