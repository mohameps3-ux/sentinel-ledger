"use strict";

const { isProbableSolanaPubkey } = require("../lib/solanaAddress");

/**
 * Active crypto/USDC subscription for a wallet (subscriptions.wallet_address + expires_at).
 * Returns null when wallet is invalid, no row, or on any DB/lookup failure (fail-closed).
 */
async function getActiveWalletSubscription(supabase, walletAddress) {
  const wallet = String(walletAddress ?? "").trim();
  if (!wallet || !isProbableSolanaPubkey(wallet)) {
    return null;
  }
  if (!supabase) {
    return null;
  }

  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("subscriptions")
      .select("plan, expires_at")
      .eq("wallet_address", wallet)
      .gt("expires_at", nowIso)
      .order("expires_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("[subscriptionAccess] active subscription lookup failed:", error.message);
      return null;
    }

    const row = Array.isArray(data) && data.length ? data[0] : null;
    if (!row) {
      return null;
    }

    return {
      plan: row.plan || null,
      expires_at: row.expires_at || null
    };
  } catch (err) {
    console.error(
      "[subscriptionAccess] active subscription lookup threw:",
      err?.message || err
    );
    return null;
  }
}

/**
 * True when the wallet has an active crypto/USDC subscription (expires_at > now).
 * Always false on invalid wallet, missing supabase, or any lookup error.
 */
async function checkWalletProStatus(supabase, walletAddress) {
  const row = await getActiveWalletSubscription(supabase, walletAddress);
  return row != null;
}

module.exports = {
  getActiveWalletSubscription,
  checkWalletProStatus
};
