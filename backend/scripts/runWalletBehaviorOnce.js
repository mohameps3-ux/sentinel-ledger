#!/usr/bin/env node
/**
 * Recomputes wallet_behavior_stats (+ token features + smart_wallets profile fields)
 * for active wallets — same logic as the server cron tick.
 *
 * Usage (from backend/):
 *   npm run behavior:wallets-once
 *
 * Env: same as backend (.env): Supabase + optional WALLET_BEHAVIOR_* overrides.
 * Does NOT need OMNI_BOT_OPS_KEY (runs in-process).
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { runWalletBehaviorTick, getWalletBehaviorCronStatus } = require("../src/jobs/walletBehaviorCron");

async function main() {
  console.log("[wallet-behavior-once] starting tick…");
  await runWalletBehaviorTick();
  const st = getWalletBehaviorCronStatus();
  console.log(JSON.stringify(st, null, 2));
  const ls = st.lastStats || {};
  if (ls.error) {
    console.error("[wallet-behavior-once] tick error:", ls.error);
    process.exit(1);
  }
  if ((ls.failed || 0) > 0 && (ls.updated || 0) === 0) {
    console.warn("[wallet-behavior-once] all wallets failed — check Supabase + network.");
    process.exit(1);
  }
  console.log("[wallet-behavior-once] done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
