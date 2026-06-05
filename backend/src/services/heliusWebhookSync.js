"use strict";

const { getSupabase } = require("../lib/supabase");
const {
  listWebhooks,
  getWebhook,
  createWebhook,
  updateWebhook,
  webhookProdUrl
} = require("../lib/heliusWebhookApi");
const {
  recordHeliusSyncSuccess,
  recordHeliusSyncError
} = require("../lib/heliusWebhookSyncTelemetry");

function accountLimit() {
  const n = Number(process.env.HELIUS_WEBHOOK_ACCOUNT_LIMIT || 200);
  return Math.min(10000, Math.max(1, Math.floor(n)));
}

function parseExclude() {
  const raw = process.env.HELIUS_WEBHOOK_EXCLUDE || "";
  const fromEnv = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const defaults = ["675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"];
  return new Set([...defaults, ...fromEnv]);
}

/**
 * Default source: top smart_wallets by score (same ranking as registerHeliusWebhook.js).
 * @param {{ limit?: number, source?: string }} [opts]
 */
async function fetchHeliusAccountAddresses(opts = {}) {
  const source = String(opts.source || process.env.HELIUS_SYNC_SOURCE || "smart_score_ranked").trim();
  const limit = Math.min(10000, Math.max(1, Number(opts.limit) || accountLimit()));
  if (source !== "smart_score_ranked") {
    throw new Error(`unsupported_helius_sync_source:${source}`);
  }

  const supabase = getSupabase();
  const exclude = parseExclude();
  const { data, error } = await supabase
    .from("smart_wallets")
    .select("wallet_address, smart_score, win_rate, last_seen")
    .order("smart_score", { ascending: false, nullsFirst: false })
    .order("win_rate", { ascending: false, nullsFirst: false })
    .order("last_seen", { ascending: false, nullsFirst: true })
    .limit(Math.min(5000, limit * 3));
  if (error) throw new Error(error.message || "smart_wallets_query_failed");

  const out = [];
  for (const row of data || []) {
    const w = String(row.wallet_address || "").trim();
    if (!w || exclude.has(w)) continue;
    out.push(w);
    if (out.length >= limit) break;
  }
  return out;
}

function pickWebhook(webhooks, targetUrl) {
  const normalized = targetUrl.replace(/\/+$/, "");
  return (
    webhooks.find((w) => String(w.webhookURL || w.webhookUrl || "").replace(/\/+$/, "") === normalized) ||
    webhooks[0] ||
    null
  );
}

async function resolveWebhookAuthHeader() {
  const secret = String(process.env.HELIUS_WEBHOOK_SECRET || "").trim();
  if (secret) return secret;
  const existing = await listWebhooks().catch(() => []);
  const wh = existing[0];
  if (wh?.webhookID) {
    const full = await getWebhook(wh.webhookID).catch(() => null);
    const authHeader = String(full?.authHeader || "").trim();
    if (authHeader) return authHeader;
  }
  throw new Error("HELIUS_WEBHOOK_SECRET missing");
}

/**
 * Sync Helius enhanced webhook accountAddresses from smart_wallets ranking.
 * @param {{ dryRun?: boolean, source?: string, limit?: number }} [opts]
 */
async function syncHeliusAccountAddresses(opts = {}) {
  const dryRun = Boolean(opts.dryRun);
  const targetUrl = webhookProdUrl();
  const addresses = await fetchHeliusAccountAddresses(opts);
  if (!addresses.length) {
    const err = new Error("no smart_wallets addresses to sync");
    recordHeliusSyncError(err);
    return { ok: false, reason: "no_addresses", addressCount: 0 };
  }

  const authHeader = await resolveWebhookAuthHeader();
  const existing = await listWebhooks();
  let webhookId = String(process.env.HELIUS_WEBHOOK_ID || "").trim();
  let current = webhookId ? await getWebhook(webhookId).catch(() => null) : null;
  if (!current) {
    current = pickWebhook(existing, targetUrl);
    webhookId = current?.webhookID || current?.id || "";
  }

  const body = {
    webhookURL: targetUrl,
    transactionTypes: ["ANY"],
    accountAddresses: addresses,
    webhookType: "enhanced"
  };

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      webhookId: webhookId || null,
      addressCount: addresses.length,
      webhookURL: targetUrl
    };
  }

  try {
    let result;
    if (webhookId) {
      result = await updateWebhook(webhookId, body);
    } else {
      result = await createWebhook(body);
      webhookId = result?.webhookID || result?.id || "";
    }
    const count = Number((result?.accountAddresses || addresses).length) || addresses.length;
    recordHeliusSyncSuccess({ addressCount: count, webhookId });
    return {
      ok: true,
      webhookId,
      addressCount: count,
      webhookURL: result?.webhookURL || targetUrl
    };
  } catch (error) {
    recordHeliusSyncError(error);
    return { ok: false, reason: error?.message || "sync_failed", addressCount: 0 };
  }
}

module.exports = {
  syncHeliusAccountAddresses,
  fetchHeliusAccountAddresses,
  accountLimit
};
