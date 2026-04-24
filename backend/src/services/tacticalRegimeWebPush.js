/**
 * Web Push (VAPID) for tactical regime lines — same payload as Telegram; uses `web-push` + `web_push_subscriptions`.
 */
"use strict";

const webpush = require("web-push");
const { getSupabase } = require("../lib/supabase");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** W3C Push: endpoints must be HTTPS; http allowed only for loopback dev endpoints. */
const MAX_ENDPOINT_LEN = 2500;
const MAX_B64_KEY_LEN = 200;

function isValidPushHttpUrl(endpoint) {
  if (typeof endpoint !== "string" || endpoint.length === 0 || endpoint.length > MAX_ENDPOINT_LEN) {
    return false;
  }
  let u;
  try {
    u = new URL(endpoint);
  } catch {
    return false;
  }
  if (u.hash && u.hash.length > 0) {
    return false;
  }
  if (u.protocol === "https:") {
    return u.hostname.length > 0;
  }
  if (u.protocol === "http:") {
    const h = u.hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  }
  return false;
}

function isValidWebPushKeyString(s) {
  if (typeof s !== "string" || s.length === 0 || s.length > MAX_B64_KEY_LEN) {
    return false;
  }
  if (/[\0\r\n]/.test(s)) {
    return false;
  }
  if (!/^[A-Za-z0-9+/_-]+=*$/.test(s)) {
    return false;
  }
  return true;
}

/**
 * @returns {{ ok: true, payload: { endpoint: string, keys: { p256dh: string, auth: string } } }|{ ok: false, error: string }}
 */
function parseSafePushSubscriptionInput(sub) {
  if (sub == null || typeof sub !== "object" || Array.isArray(sub)) {
    return { ok: false, error: "invalid_subscription" };
  }
  const subProto = Object.getPrototypeOf(sub);
  if (subProto !== null && subProto !== Object.prototype) {
    return { ok: false, error: "invalid_subscription" };
  }
  const endpoint = sub.endpoint;
  if (!isValidPushHttpUrl(endpoint)) {
    return { ok: false, error: "invalid_subscription" };
  }
  const k = sub.keys;
  if (k == null || typeof k !== "object" || Array.isArray(k) || (Object.getPrototypeOf(k) !== null && Object.getPrototypeOf(k) !== Object.prototype)) {
    return { ok: false, error: "invalid_subscription" };
  }
  const p256dh = k.p256dh;
  const auth = k.auth;
  if (!isValidWebPushKeyString(p256dh) || !isValidWebPushKeyString(auth)) {
    return { ok: false, error: "invalid_subscription" };
  }
  return { ok: true, payload: { endpoint, keys: { p256dh, auth } } };
}

function isVapidKeyMaterialPresent() {
  return Boolean(process.env.WEB_PUSH_VAPID_PUBLIC_KEY && process.env.WEB_PUSH_VAPID_PRIVATE_KEY);
}

let configured = false;
function ensureVapid() {
  if (configured) return true;
  const pub = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const priv = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT || "mailto:ops@sentinel-ledger.local";
  if (!pub || !priv) return false;
  try {
    webpush.setVapidDetails(subject, pub, priv);
    configured = true;
    return true;
  } catch (e) {
    console.warn("web-push VAPID config failed:", e?.message || e);
    return false;
  }
}

/**
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.mint
 * @param {object} opts.regime
 * @param {string} opts.message
 * @param {string} [opts.url] token page
 */
async function trySendTacticalRegimeWebPush(opts) {
  const { userId, mint, regime, message, url } = opts;
  if (!userId || !UUID_RE.test(String(userId))) {
    return { ok: false, reason: "no_user_or_invalid" };
  }
  if (!ensureVapid()) {
    return { ok: false, reason: "vapid_not_configured" };
  }

  const supabase = getSupabase();
  const { data: rows, error } = await supabase
    .from("web_push_subscriptions")
    .select("id, endpoint, keys")
    .eq("user_id", userId);
  if (error) {
    console.warn("web_push_subscriptions read:", error.message);
    return { ok: false, reason: "db_error" };
  }
  if (!rows?.length) {
    return { ok: false, reason: "no_subscriptions" };
  }

  const title = "Sentinel · Execution regime (advisory)";
  const body = String(message || "")
    .split("\n")
    .filter(Boolean)
    .slice(0, 3)
    .join(" · ");
  const payload = JSON.stringify({
    type: "tactical_regime",
    title,
    body: body || title,
    url: url || "/",
    mint: mint || null,
    action: regime?.action || null
  });

  let sent = 0;
  for (const row of rows) {
    const sub = { endpoint: row.endpoint, keys: row.keys };
    try {
      await webpush.sendNotification(sub, payload, { TTL: 3600, urgency: "normal" });
      sent += 1;
    } catch (e) {
      const code = e?.statusCode;
      if (code === 410 || code === 404) {
        await supabase.from("web_push_subscriptions").delete().eq("id", row.id);
      }
    }
  }
  return { ok: sent > 0, reason: sent > 0 ? "sent" : "all_failed", sent };
}

/**
 * @param {string} userId
 * @param {object} subscription - browser PushSubscription.toJSON()
 * @param {string} [userAgent]
 */
async function upsertPushSubscription(userId, subscription, userAgent) {
  if (!userId || !UUID_RE.test(String(userId))) {
    return { ok: false, error: "invalid_subscription" };
  }
  const parsed = parseSafePushSubscriptionInput(subscription);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }
  const { endpoint, keys } = parsed.payload;
  const supabase = getSupabase();
  const { error } = await supabase.from("web_push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint,
      keys: { p256dh: keys.p256dh, auth: keys.auth },
      user_agent: userAgent || null,
      updated_at: new Date().toISOString()
    },
    { onConflict: "user_id,endpoint" }
  );
  if (error) {
    console.error("web_push_subscriptions.upsert:", error?.message || error);
    return { ok: false, error: "storage_failed" };
  }
  return { ok: true };
}

async function removePushSubscription(userId, endpoint) {
  if (!userId || !UUID_RE.test(String(userId)) || !endpoint) {
    return { ok: false, error: "missing" };
  }
  if (!isValidPushHttpUrl(String(endpoint).trim())) {
    return { ok: false, error: "invalid_endpoint" };
  }
  const supabase = getSupabase();
  const { error } = await supabase
    .from("web_push_subscriptions")
    .delete()
    .eq("user_id", userId)
    .eq("endpoint", String(endpoint).trim());
  if (error) {
    console.error("web_push_subscriptions.delete:", error?.message || error);
    return { ok: false, error: "storage_failed" };
  }
  return { ok: true };
}

function getVapidPublicKeyForClient() {
  return process.env.WEB_PUSH_VAPID_PUBLIC_KEY || null;
}

module.exports = {
  trySendTacticalRegimeWebPush,
  upsertPushSubscription,
  removePushSubscription,
  getVapidPublicKeyForClient,
  ensureVapid,
  isVapidKeyMaterialPresent,
  isValidPushHttpUrl,
  parseSafePushSubscriptionInput
};
