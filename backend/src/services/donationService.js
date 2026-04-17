const { getSupabase } = require("../lib/supabase");
const { DAY_MS, grantPlanDuration } = require("./subscriptionService");
const { sendTelegramToChatId } = require("../bots/telegramBot");

function rewardForUsd(amountUsd) {
  const usd = Number(amountUsd || 0);
  if (usd < 1) return null;
  if (usd < 5) return { badge: null, durationMs: 4 * 60 * 60 * 1000, source: "donation_4h" };
  if (usd < 10) return { badge: "Soporte", durationMs: 2 * DAY_MS, source: "donation_2d" };
  if (usd < 25) return { badge: "Soporte+", durationMs: 5 * DAY_MS, source: "donation_5d" };
  if (usd < 50) return { badge: "Colaborador", durationMs: 12 * DAY_MS, source: "donation_12d" };
  if (usd < 100) return { badge: "Sustentador", durationMs: 25 * DAY_MS, source: "donation_25d" };
  return { badge: "Patrocinador", durationMs: 60 * DAY_MS, source: "donation_60d" };
}

function rewardDaysInt(reward) {
  if (!reward?.durationMs) return 0;
  return Math.floor(reward.durationMs / DAY_MS);
}

async function getUserByWallet(walletAddress) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("users")
    .select("id,wallet_address,telegram_id")
    .eq("wallet_address", walletAddress)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function persistDonationAndRewards({
  txHash,
  fromWallet,
  amountSol,
  amountUsd,
  occurredAt = new Date().toISOString()
}) {
  const supabase = getSupabase();
  const reward = rewardForUsd(amountUsd);

  const { data: existing, error: existingError } = await supabase
    .from("donations")
    .select("id,tx_hash")
    .eq("tx_hash", txHash)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return { ok: true, skipped: true, reason: "already_processed" };

  const user = await getUserByWallet(fromWallet);
  let applied = false;
  if (user?.id && reward?.durationMs) {
    await grantPlanDuration({
      userId: user.id,
      plan: "pro",
      durationMs: reward.durationMs
    });
    applied = true;
  }

  const donationPayload = {
    user_id: user?.id || null,
    tx_hash: txHash,
    from_wallet: fromWallet,
    amount_sol: amountSol,
    amount_usd: Number(amountUsd || 0),
    reward_days: rewardDaysInt(reward),
    badge: reward?.badge || null,
    status: reward ? (applied ? "processed" : "pending") : "processed",
    processed_at: applied ? new Date().toISOString() : null,
    created_at: occurredAt
  };
  const { data: donation, error: donationError } = await supabase
    .from("donations")
    .insert(donationPayload)
    .select("*")
    .single();
  if (donationError) throw donationError;

  if (reward?.durationMs && user?.id) {
    const { error: rewardError } = await supabase.from("user_rewards").insert({
      user_id: user.id,
      reward_type: "pro_days",
      amount: reward.durationMs / DAY_MS,
      source: reward.source,
      is_claimed: true
    });
    if (rewardError) throw rewardError;
  }

  if (user?.telegram_id && reward?.durationMs) {
    await sendTelegramToChatId(
      user.telegram_id,
      `✅ Donation received\nTx: ${txHash}\nAmount: ${Number(amountSol).toFixed(4)} SOL ($${Number(amountUsd).toFixed(2)})\nReward: +${(reward.durationMs / DAY_MS).toFixed(2)} PRO days`
    );
  }

  return { ok: true, donation, rewardApplied: applied };
}

async function assignPendingDonationsForWallet({ userId, walletAddress }) {
  const supabase = getSupabase();
  const { data: pending, error } = await supabase
    .from("donations")
    .select("*")
    .is("user_id", null)
    .eq("from_wallet", walletAddress)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw error;
  if (!pending?.length) return { updated: 0 };

  let updated = 0;
  for (const donation of pending) {
    const reward = rewardForUsd(donation.amount_usd);
    if (reward?.durationMs) {
      await grantPlanDuration({
        userId,
        plan: "pro",
        durationMs: reward.durationMs
      });
      await supabase.from("user_rewards").insert({
        user_id: userId,
        reward_type: "pro_days",
        amount: reward.durationMs / DAY_MS,
        source: "donation_pending_claim",
        is_claimed: true
      });
    }

    const { error: updateError } = await supabase
      .from("donations")
      .update({
        user_id: userId,
        status: "processed",
        processed_at: new Date().toISOString()
      })
      .eq("id", donation.id);
    if (updateError) throw updateError;
    updated += 1;
  }

  return { updated };
}

module.exports = {
  rewardForUsd,
  persistDonationAndRewards,
  assignPendingDonationsForWallet
};
