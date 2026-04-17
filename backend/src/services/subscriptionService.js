const { getSupabase } = require("../lib/supabase");

const DAY_MS = 24 * 60 * 60 * 1000;

function normalizePlanStatus(subscriptionRow) {
  if (!subscriptionRow) {
    return { plan: "free", isActive: false, expiresAt: null };
  }
  const expiresAt = subscriptionRow.expires_at ? new Date(subscriptionRow.expires_at) : null;
  const now = Date.now();
  const isActive = !expiresAt || Number.isNaN(expiresAt.getTime()) ? true : expiresAt.getTime() > now;
  return {
    plan: isActive ? subscriptionRow.plan || "free" : "free",
    isActive,
    expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt.toISOString() : null
  };
}

async function getLatestSubscription(userId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return Array.isArray(data) && data.length ? data[0] : null;
}

async function getUserPlanStatus(userId) {
  const row = await getLatestSubscription(userId);
  const status = normalizePlanStatus(row);
  return {
    ...status,
    subscription: row
  };
}

async function grantPlanDuration({
  userId,
  plan = "pro",
  durationMs,
  stripeCustomerId = null,
  stripeSubscriptionId = null
}) {
  const supabase = getSupabase();
  const current = await getLatestSubscription(userId);
  const now = Date.now();
  const currentExpiryMs = current?.expires_at ? new Date(current.expires_at).getTime() : null;
  const baseMs = currentExpiryMs && currentExpiryMs > now ? currentExpiryMs : now;
  const nextExpiry = durationMs ? new Date(baseMs + durationMs).toISOString() : null;

  if (current) {
    const { data, error } = await supabase
      .from("subscriptions")
      .update({
        plan,
        status: "active",
        starts_at: current.starts_at || new Date(now).toISOString(),
        expires_at: nextExpiry,
        stripe_customer_id: stripeCustomerId || current.stripe_customer_id || null,
        stripe_subscription_id: stripeSubscriptionId || current.stripe_subscription_id || null,
        updated_at: new Date().toISOString()
      })
      .eq("id", current.id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("subscriptions")
    .insert({
      user_id: userId,
      plan,
      status: "active",
      starts_at: new Date(now).toISOString(),
      expires_at: nextExpiry,
      stripe_customer_id: stripeCustomerId || null,
      stripe_subscription_id: stripeSubscriptionId || null
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

function durationForPlan(plan) {
  if (plan === "pro" || plan === "super_pro") return 30 * DAY_MS;
  if (plan === "lifetime") return 36500 * DAY_MS;
  return 0;
}

module.exports = {
  DAY_MS,
  durationForPlan,
  getLatestSubscription,
  getUserPlanStatus,
  grantPlanDuration
};
