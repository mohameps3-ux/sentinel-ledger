#!/usr/bin/env node
/**
 * One-off maintenance: remove smart_wallets rows that are empty shells (total_trades = 0)
 * and stale (updated_at older than STALE_HOURS, default 48h).
 *
 * Dry-run by default. Pass --execute to delete.
 *
 *   node scripts/pruneSmartWalletShellRows.js
 *   node scripts/pruneSmartWalletShellRows.js --execute
 */
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const STALE_HOURS = Math.max(1, Math.min(168, Number(process.env.PRUNE_SHELL_STALE_HOURS || 48)));
const execute = process.argv.includes("--execute");

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const cutoff = new Date(Date.now() - STALE_HOURS * 3600_000).toISOString();

  const { data: candidates, error: selErr } = await supabase
    .from("smart_wallets")
    .select("wallet_address, updated_at, total_trades")
    .eq("total_trades", 0)
    .lt("updated_at", cutoff);
  if (selErr) {
    console.error("select failed:", selErr.message);
    process.exit(1);
  }
  const rows = Array.isArray(candidates) ? candidates : [];
  console.log(
    `[prune-smart-wallets] cutoff=${cutoff} stale_hours=${STALE_HOURS} candidates=${rows.length} execute=${execute}`
  );
  if (!rows.length) {
    console.log("Nothing to prune.");
    return;
  }
  if (!execute) {
    console.log("Dry-run. First 20 wallet_address:");
    for (const r of rows.slice(0, 20)) {
      console.log(`  ${r.wallet_address}  updated_at=${r.updated_at}`);
    }
    console.log("Re-run with --execute to delete.");
    return;
  }

  const addrs = rows.map((r) => r.wallet_address).filter(Boolean);
  let deleted = 0;
  for (const addr of addrs) {
    const { error } = await supabase.from("smart_wallets").delete().eq("wallet_address", addr);
    if (error) {
      console.warn(`delete failed ${addr}:`, error.message);
    } else {
      deleted += 1;
    }
  }
  console.log(`[prune-smart-wallets] deleted=${deleted}/${addrs.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
