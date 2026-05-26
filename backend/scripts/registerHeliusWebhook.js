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
const { syncHeliusAccountAddresses, accountLimit } = require("../src/services/heliusWebhookSync");

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const result = await syncHeliusAccountAddresses({ dryRun: DRY_RUN });
  if (!result.ok && !result.dryRun) {
    console.error("FAIL:", result.reason || "sync_failed");
    process.exit(1);
  }
  console.log(JSON.stringify({ ...result, limit: accountLimit() }, null, 2));
}

main().catch((e) => {
  console.error("FAIL:", e?.message || e);
  process.exit(1);
});
