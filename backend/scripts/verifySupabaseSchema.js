/**
 * Read-only checks against Postgres (DATABASE_URL). Same expectations as supabase/apply_production_bundle.sql tail.
 */
require("dotenv").config();
const { Client } = require("pg");

const TABLES = [
  "subscriptions",
  "stripe_events",
  "system_logs",
  "wallet_tokens",
  "wallet_clusters",
  "token_activity_logs"
];

async function main() {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL;
  if (!url) {
    console.error("Missing DATABASE_URL or SUPABASE_DATABASE_URL");
    process.exit(1);
  }
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  let failed = 0;
  try {
    for (const t of TABLES) {
      const { rows } = await client.query("SELECT to_regclass($1) AS r", [`public.${t}`]);
      if (!rows[0]?.r) {
        console.error(`FAIL: missing table public.${t}`);
        failed += 1;
      } else {
        console.log(`OK: table public.${t}`);
      }
    }

    const userCols = ["telegram_chat_id", "pro_alerts_enabled", "pro_alert_prefs"];
    for (const c of userCols) {
      const { rows } = await client.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'users' AND column_name = $1`,
        [c]
      );
      if (rows.length === 0) {
        console.error(`FAIL: users.${c}`);
        failed += 1;
      } else console.log(`OK: users.${c}`);
    }

    const swCols = ["total_trades", "smart_score"];
    for (const c of swCols) {
      const { rows } = await client.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'smart_wallets' AND column_name = $1`,
        [c]
      );
      if (rows.length === 0) {
        console.error(`FAIL: smart_wallets.${c}`);
        failed += 1;
      } else console.log(`OK: smart_wallets.${c}`);
    }
  } finally {
    await client.end();
  }
  if (failed) {
    console.error(`\n${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll schema checks passed.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
