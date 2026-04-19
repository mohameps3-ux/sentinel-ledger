const { getSupabase } = require("../../../lib/supabase");
const { isLikelyMint } = require("../utils");

async function handleGetWallet(entities) {
  const wallet = String(entities?.wallet || "").trim();
  if (!isLikelyMint(wallet)) return { ok: false, error: "Provide a valid Solana wallet address." };

  try {
    const supabase = getSupabase();

    const { data: row, error } = await supabase
      .from("smart_wallets")
      .select("*")
      .eq("wallet_address", wallet)
      .maybeSingle();
    if (error) {
      console.error("[nlu] wallet main lookup failed:", error.message);
      return { ok: false, error: "Wallet lookup failed." };
    }
    if (!row) return { ok: false, error: "Wallet not found in smart_wallets." };

    let activity = [];
    try {
      const { data } = await supabase
        .from("smart_wallet_signals")
        .select("token_address,last_action,confidence,created_at,result_pct")
        .eq("wallet_address", wallet)
        .order("created_at", { ascending: false })
        .limit(5);
      activity = data || [];
    } catch (error) {
      console.warn("[nlu] wallet activity lookup failed:", error.message);
      activity = [];
    }

    const winRate = Number(row.win_rate || 0);
    const pnl30d = Number(row.pnl_30d || 0);
    const avgPos = Number(row.avg_position_size || 0);
    const roi30d = avgPos > 0 ? (pnl30d / avgPos) * 100 : 0;
    const riskProfile = winRate >= 85 ? "LOW-RISK ALPHA" : winRate >= 72 ? "BALANCED" : "SPECULATIVE";

    return {
      ok: true,
      intent: "GET_WALLET",
      data: {
        wallet,
        winRate,
        roi30d,
        pnl30d,
        totalTrades: Number(row.total_trades || 0),
        recentHits: Number(row.recent_hits || 0),
        riskProfile,
        recentTrades: activity.map((a) => ({
          token: a.token_address,
          side: a.last_action,
          confidence: Number(a.confidence || 0),
          resultPct: a.result_pct != null ? Number(a.result_pct) : null,
          at: a.created_at
        }))
      }
    };
  } catch (error) {
    console.error("[nlu] handleGetWallet failed:", error.message);
    return { ok: false, error: "Wallet lookup failed." };
  }
}

module.exports = {
  handleGetWallet
};

