#!/usr/bin/env node
"use strict";
/**
 * Idempotent Helius enhanced webhook registration / sync.
 * - Ensures webhook URL matches prod Railway backend
 * - Syncs accountAddresses from top smart_wallets (score-ranked)
 * - Sets authHeader = HELIUS_WEBHOOK_SECRET (Helius sends as Authorization)
 *
 * Usage:
 *   node backend/scripts/registerHeliusWebhook.js
 *   node backend/scripts/registerHeliusWebhook.js --dry-run
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { getSupabase } = require("../src/lib/supabase");
const {
  listWebhooks,
  getWebhook,
  createWebhook,
  updateWebhook,
  webhookProdUrl
} = require("../src/lib/heliusWebhookApi");

const DRY_RUN = process.argv.includes("--dry-run");

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

async function fetchTrackedAddresses() {
  const supabase = getSupabase();
  const exclude = parseExclude();
  const limit = accountLimit();
  const { data, error } = await supabase
    .from("smart_wallets")
    .select("wallet_address, smart_score, win_rate, last_seen")
    .order("smart_score", { ascending: false, nullsFirst: false })
    .order("win_rate", { ascending: false, nullsFirst: false })
    .order("last_seen", { ascending: false, nullsFirst: true })
    .limit(Math.min(5000, limit * 3));
  if (error) throw new Error(error.message);
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

async function main() {
  const secret = String(process.env.HELIUS_WEBHOOK_SECRET || "").trim();
  let authHeader = secret;
  if (!authHeader) {
    const existing = await listWebhooks().catch(() => []);
    const wh = existing[0];
    if (wh?.webhookID) {
      const full = await getWebhook(wh.webhookID).catch(() => null);
      authHeader = String(full?.authHeader || "").trim();
    }
  }
  if (!authHeader) {
    console.error("HELIUS_WEBHOOK_SECRET is required (or existing webhook authHeader via Helius API).");
    process.exit(1);
  }

  const targetUrl = webhookProdUrl();
  const addresses = await fetchTrackedAddresses();
  if (!addresses.length) {
    console.error("No smart_wallets addresses to track.");
    process.exit(1);
  }

  console.log(`Target URL: ${targetUrl}`);
  console.log(`Accounts to sync: ${addresses.length} (limit=${accountLimit()})`);

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
    webhookType: "enhanced",
    authHeader: authHeader
  };

  if (DRY_RUN) {
    console.log(JSON.stringify({ dryRun: true, webhookId: webhookId || null, body: { ...body, authHeader: "[REDACTED]" } }, null, 2));
    return;
  }

  let result;
  if (webhookId) {
    console.log(`Updating webhook ${webhookId}…`);
    result = await updateWebhook(webhookId, body);
  } else {
    console.log("Creating new Helius webhook…");
    result = await createWebhook(body);
    webhookId = result?.webhookID || result?.id;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        webhookID: webhookId,
        webhookURL: result?.webhookURL || targetUrl,
        accountAddresses: (result?.accountAddresses || addresses).length,
        active: result?.active ?? true,
        hint: "Set HELIUS_WEBHOOK_ID=" + webhookId + " in Railway env for faster re-sync"
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error("FAIL:", e?.message || e);
  process.exit(1);
});
