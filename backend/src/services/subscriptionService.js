const { getSupabase } = require("../lib/supabase");

const DAY_MS = 24 * 60 * 60 * 1000;
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

function looksLikeUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function hasProAccess(row) {
  if (!row || row.plan === "free") return false;
  const exp = row.expires_at ? new Date(row.expires_at).getTime() : null;
  const now = Date.now();

  if (row.wallet_address) {
    if (!exp || Number.isNaN(exp)) return false;
    return exp > now;
  }

  if (row.status === "expired") return false;
  if (row.plan === "lifetime" && row.status === "active") return true;
  if (row.plan !== "lifetime") {
    if (!exp || Number.isNaN(exp)) return false;
    if (exp <= now) return false;
  }
  if (row.status === "active" && row.plan !== "lifetime") return true;
  if (row.status === "cancelled" && row.plan !== "lifetime" && exp && !Number.isNaN(exp)) {
    return exp > now;
  }
  return false;
}

async function getWalletAddressForUser(userId) {
  if (!looksLikeUuid(userId) || String(userId) === ZERO_UUID) return null;
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("users")
    .select("wallet_address")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  const wallet = data?.wallet_address ? String(data.wallet_address).trim() : "";
  return wallet || null;
}

async function getLatestSubscription(userId) {
  const walletAddress = await getWalletAddressForUser(userId);
  if (!walletAddress) return null;
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("wallet_address", walletAddress)
    .order("expires_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return Array.isArray(data) && data.length ? data[0] : null;
}

async function findSubscriptionByStripeSubscriptionId(stripeSubscriptionId) {
  if (!stripeSubscriptionId) return null;
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function doesUserExist(userId) {
  if (!looksLikeUuid(userId) || String(userId) === ZERO_UUID) return false;
  const supabase = getSupabase();
  const { data, error } = await supabase.from("users").select("id").eq("id", userId).maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

/** For JWT middleware + /user/status */
async function getSubscriptionAuthContext(userId) {
  const row = await getLatestSubscription(userId);
  if (!row) {
    return {
      plan: "free",
      subscriptionStatus: null,
      planExpiresAt: null,
      isLifetime: false,
      hasProAccess: false
    };
  }
  return {
    plan: row.plan || "free",
    subscriptionStatus: row.status || null,
    planExpiresAt: row.expires_at || null,
    isLifetime: row.plan === "lifetime",
    hasProAccess: hasProAccess(row)
  };
}

async function upsertSubscriptionRow({
  userId,
  plan,
  status = "active",
  expiresAt,
  stripeCustomerId,
  stripeSubscriptionId
}) {
  const supabase = getSupabase();
  const current = await getLatestSubscription(userId);
  const nowIso = new Date().toISOString();
  const payload = {
    plan,
    status,
    expires_at: expiresAt,
    stripe_customer_id: stripeCustomerId || null,
    stripe_subscription_id: stripeSubscriptionId || null,
    updated_at: nowIso
  };

  if (current) {
    const { data, error } = await supabase
      .from("subscriptions")
      .update({
        ...payload,
        starts_at: current.starts_at || nowIso
      })
      .eq("id", current.id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  const walletAddress = await getWalletAddressForUser(userId);
  if (!walletAddress) {
    throw new Error("user_wallet_not_found");
  }

  const { data, error } = await supabase
    .from("subscriptions")
    .insert({
      wallet_address: walletAddress,
      plan,
      status,
      starts_at: nowIso,
      expires_at: expiresAt,
      stripe_customer_id: stripeCustomerId || null,
      stripe_subscription_id: stripeSubscriptionId || null
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/** checkout.session.completed — initial entitlement */
async function applyCheckoutSessionCompleted(session) {
  const userId = session.metadata?.userId;
  const plan = session.metadata?.plan;
  if (!userId || !plan) return;
  if (!(await doesUserExist(userId))) {
    console.warn("checkout.session.completed skipped: user not found", {
      userId,
      sessionId: session?.id || null
    });
    return;
  }

  const customerId = session.customer ? String(session.customer) : null;

  if (session.mode === "subscription") {
    const subId = session.subscription ? String(session.subscription) : null;
    const expiresAt = new Date(Date.now() + 30 * DAY_MS).toISOString();
    await upsertSubscriptionRow({
      userId,
      plan,
      status: "active",
      expiresAt,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subId
    });
    return;
  }

  if (session.mode === "payment" && plan === "lifetime") {
    await upsertSubscriptionRow({
      userId,
      plan: "lifetime",
      status: "active",
      expiresAt: null,
      stripeCustomerId: customerId,
      stripeSubscriptionId: null
    });
  }
}

/** invoice.paid — renew monthly (skip first invoice; checkout.session.completed already grants 30d) */
async function applyInvoicePaid(invoice) {
  if (invoice.billing_reason === "subscription_create") return;

  const subscriptionId = invoice.subscription ? String(invoice.subscription) : null;
  if (!subscriptionId) return;

  const row = await findSubscriptionByStripeSubscriptionId(subscriptionId);
  if (!row) return;

  const now = Date.now();
  const currentExp = row.expires_at ? new Date(row.expires_at).getTime() : now;
  const base = currentExp > now ? currentExp : now;
  const nextExpiry = new Date(base + 30 * DAY_MS).toISOString();

  const supabase = getSupabase();
  const { error } = await supabase
    .from("subscriptions")
    .update({
      expires_at: nextExpiry,
      status: "active",
      updated_at: new Date().toISOString()
    })
    .eq("id", row.id);
  if (error) throw error;
}

/** customer.subscription.deleted */
async function applySubscriptionDeleted(stripeSubscription) {
  const id = stripeSubscription?.id;
  if (!id) return;

  const supabase = getSupabase();
  const { error } = await supabase
    .from("subscriptions")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString()
    })
    .eq("stripe_subscription_id", id);
  if (error) throw error;
}

/**
 * Daily cron hook. On-chain wallet subscriptions (wallet_address + expires_at) do not use
 * a status column — entitlement is evaluated at read time (expires_at > now).
 */
async function expireStaleSubscriptions() {
  return;
}

async function applyStripeEvent(event) {
  const type = String(event?.type || "");
  if (type === "checkout.session.completed") {
    await applyCheckoutSessionCompleted(event.data.object);
    return;
  }
  if (type === "invoice.paid") {
    await applyInvoicePaid(event.data.object);
    return;
  }
  if (type === "customer.subscription.deleted") {
    await applySubscriptionDeleted(event.data.object);
  }
}

module.exports = {
  DAY_MS,
  hasProAccess,
  getLatestSubscription,
  findSubscriptionByStripeSubscriptionId,
  getSubscriptionAuthContext,
  upsertSubscriptionRow,
  applyCheckoutSessionCompleted,
  applyInvoicePaid,
  applySubscriptionDeleted,
  applyStripeEvent,
  expireStaleSubscriptions
};
