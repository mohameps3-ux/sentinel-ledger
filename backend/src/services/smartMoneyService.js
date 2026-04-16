const { getSupabase } = require("../lib/supabase");

const MIN_WIN_RATE = 70;
const MAX_RESULTS = 12;

function mapSmartWallet(wallet, signal) {
  return {
    wallet: wallet.wallet_address,
    winRate: Number(wallet.win_rate || 0),
    realizedPnl: Number(wallet.pnl_30d || 0),
    lastAction: signal?.last_action || "unknown",
    confidence: Number(signal?.confidence || wallet.confidence || 0)
  };
}

async function getSmartWalletsForToken(tokenAddress) {
  const supabase = getSupabase();

  // 1) Prefer token-specific signals when table exists and has rows.
  try {
    const { data: signals, error: signalsError } = await supabase
      .from("smart_wallet_signals")
      .select("wallet_address,last_action,confidence")
      .eq("token_address", tokenAddress)
      .order("confidence", { ascending: false })
      .limit(MAX_RESULTS);

    if (!signalsError && signals?.length) {
      const wallets = signals.map((s) => s.wallet_address);
      const { data: smartWallets, error: walletsError } = await supabase
        .from("smart_wallets")
        .select("wallet_address,win_rate,pnl_30d,confidence")
        .in("wallet_address", wallets)
        .gte("win_rate", MIN_WIN_RATE)
        .order("win_rate", { ascending: false })
        .limit(MAX_RESULTS);

      if (!walletsError && smartWallets?.length) {
        const byWallet = new Map(signals.map((s) => [s.wallet_address, s]));
        return smartWallets
          .map((wallet) => mapSmartWallet(wallet, byWallet.get(wallet.wallet_address)))
          .slice(0, MAX_RESULTS);
      }
    }
  } catch (error) {
    // Table can be absent in early environments; fallback below.
    console.error("Smart wallet token-signal lookup error:", error.message);
  }

  // 2) Fallback: global smart wallets list.
  try {
    const { data: smartWallets, error } = await supabase
      .from("smart_wallets")
      .select("wallet_address,win_rate,pnl_30d,confidence")
      .gte("win_rate", MIN_WIN_RATE)
      .order("win_rate", { ascending: false })
      .limit(MAX_RESULTS);

    if (error || !smartWallets?.length) return [];
    return smartWallets.map((wallet) => mapSmartWallet(wallet, null));
  } catch (error) {
    console.error("Smart wallet global lookup error:", error.message);
    return [];
  }
}

module.exports = { getSmartWalletsForToken };

