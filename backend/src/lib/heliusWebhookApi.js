"use strict";

const HELIUS_API_BASE = "https://api.helius.xyz/v0";

function heliusApiKey() {
  return String(process.env.HELIUS_KEY || process.env.HELIUS_API_KEY || "").trim();
}

function webhookProdUrl() {
  const base = String(
    process.env.BACKEND_URL || process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : "https://sentinel-ledger-backend-production.up.railway.app"
  ).replace(/\/+$/, "");
  return `${base}/api/v1/webhooks/helius`;
}

async function heliusFetch(path, opts = {}) {
  const key = heliusApiKey();
  if (!key) throw new Error("HELIUS_KEY missing");
  const url = `${HELIUS_API_BASE}${path}${path.includes("?") ? "&" : "?"}api-key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    signal: AbortSignal.timeout(30_000)
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  if (!res.ok) {
    const msg = json?.message || json?.error || text.slice(0, 200) || res.statusText;
    throw new Error(`Helius ${path} HTTP ${res.status}: ${msg}`);
  }
  return json;
}

async function listWebhooks() {
  const out = await heliusFetch("/webhooks");
  return Array.isArray(out) ? out : [];
}

async function getWebhook(webhookId) {
  return heliusFetch(`/webhooks/${encodeURIComponent(webhookId)}`);
}

async function createWebhook(body) {
  return heliusFetch("/webhooks", { method: "POST", body: JSON.stringify(body) });
}

async function updateWebhook(webhookId, body) {
  return heliusFetch(`/webhooks/${encodeURIComponent(webhookId)}`, {
    method: "PUT",
    body: JSON.stringify(body)
  });
}

module.exports = {
  heliusApiKey,
  webhookProdUrl,
  listWebhooks,
  getWebhook,
  createWebhook,
  updateWebhook
};
