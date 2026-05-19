"use strict";

/** Max age of last_seen (days) for leaderboard pool queries. 0 = no filter. */
function leaderboardMaxStaleDays() {
  const raw = Number(process.env.LEADERBOARD_MAX_STALE_DAYS ?? 14);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.min(3650, Math.floor(raw));
}

/**
 * Wallet addresses in the same DB pool as GET /smart-wallets-leaderboard (pre client filters).
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<string[]>}
 */
async function fetchLeaderboardWalletAddresses(supabase, opts = {}) {
  const limRaw = Number(opts.limit ?? 240);
  const limit = Number.isFinite(limRaw) && limRaw > 0 ? Math.min(1000, Math.floor(limRaw)) : 240;

  let q = supabase.from("smart_wallets").select("wallet_address").gt("total_trades", 0).gt("win_rate", 0);

  const maxStaleDays = leaderboardMaxStaleDays();
  if (maxStaleDays > 0) {
    const cutoffIso = new Date(Date.now() - maxStaleDays * 86_400_000).toISOString();
    q = q.gte("last_seen", cutoffIso);
  }

  const { data, error } = await q.order("total_trades", { ascending: false }).limit(limit);
  if (error) {
    throw error;
  }

  const seen = new Set();
  const out = [];
  for (const row of data || []) {
    const addr = String(row?.wallet_address || "").trim();
    if (!addr || seen.has(addr)) continue;
    seen.add(addr);
    out.push(addr);
  }
  return out;
}

module.exports = {
  leaderboardMaxStaleDays,
  fetchLeaderboardWalletAddresses
};
