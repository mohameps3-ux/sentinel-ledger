import { getPublicApiUrl } from "./publicRuntime";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    out[i] = raw.charCodeAt(i);
  }
  return out;
}

export function isWebPushEnvironmentSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function fetchVapidPublicKey() {
  const res = await fetch(`${getPublicApiUrl()}/api/v1/push/vapid-public-key`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j?.ok || !j?.data?.publicKey) return null;
  return j.data.publicKey;
}

export async function getPushSubscriptionInBrowser() {
  if (!isWebPushEnvironmentSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

export async function registerSentinelServiceWorker() {
  if (!isWebPushEnvironmentSupported()) return null;
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

/**
 * @param {string} token - JWT
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function subscribeWebPush(token) {
  if (!isWebPushEnvironmentSupported()) {
    return { ok: false, reason: "unsupported" };
  }
  const vapid = await fetchVapidPublicKey();
  if (!vapid) {
    return { ok: false, reason: "vapid_unavailable" };
  }
  if (window.Notification) {
    if (window.Notification.permission === "denied") {
      return { ok: false, reason: "permission_denied" };
    }
    if (window.Notification.permission === "default") {
      const perm = await window.Notification.requestPermission();
      if (perm !== "granted") {
        return { ok: false, reason: "permission_denied" };
      }
    }
  }
  const reg = await registerSentinelServiceWorker();
  if (!reg) {
    return { ok: false, reason: "no_sw" };
  }
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    await sub.unsubscribe().catch(() => {});
  }
  sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapid)
  });
  const res = await fetch(`${getPublicApiUrl()}/api/v1/push/subscribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ subscription: sub.toJSON() })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j?.ok) {
    return { ok: false, reason: j?.error || "subscribe_failed" };
  }
  return { ok: true };
}

/**
 * @param {string} token - JWT
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function unsubscribeWebPush(token) {
  if (!isWebPushEnvironmentSupported()) {
    return { ok: false, reason: "unsupported" };
  }
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) {
    return { ok: false, reason: "no_sw" };
  }
  const sub = await reg.pushManager.getSubscription();
  if (!sub) {
    return { ok: true };
  }
  const endpoint = sub.endpoint;
  const res = await fetch(`${getPublicApiUrl()}/api/v1/push/unsubscribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ endpoint })
  });
  const j = await res.json().catch(() => ({}));
  try {
    await sub.unsubscribe();
  } catch (_) {
    // ignore
  }
  if (!res.ok || !j?.ok) {
    return { ok: false, reason: j?.error || "unsubscribe_failed" };
  }
  return { ok: true };
}
