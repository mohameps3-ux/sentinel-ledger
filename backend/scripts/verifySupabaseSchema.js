/**
 * Read-only checks against Postgres (DATABASE_URL). Same expectations as supabase/apply_production_bundle.sql tail.
 * Also verifies RLS is enabled on coordination_outcomes, wallet_behavior_stats, wallet_coordination_pairs when present
 * (migrations 013–015 / rls_public_lockdown.sql). When `wallet_stalks` exists, expects migration **017** stalker F4 tables.
 *
 * CLI: `node scripts/verifySupabaseSchema.js --stalker-strict` — for the **same** Postgres donde corre Stalker (Railway):
 * exige `public.wallet_stalks` y las dos tablas F4; falla si apuntas a un proyecto sin Stalker (evita SKIP silencioso).
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { tryResolvePostgresUrlFromSupabaseEnv } = require(path.join(
  __dirname,
  "..",
  "src",
  "lib",
  "resolvePostgresUrlFromSupabase"
));
const { Client } = require("pg");

const TABLES = [
  "subscriptions",
  "stripe_events",
  "system_logs",
  "wallet_tokens",
  "wallet_clusters",
  "token_activity_logs"
];

function stalkerStrictMode() {
  return process.argv.includes("--stalker-strict");
}

async function main() {
  const strictStalker = stalkerStrictMode();
  const url = String(tryResolvePostgresUrlFromSupabaseEnv(process.env) || "").trim();
  if (!url) {
    console.error("Missing DATABASE_URL, or SUPABASE_URL + SUPABASE_DB_PASSWORD, in backend/.env");
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

    const { rows: swsigReg } = await client.query("SELECT to_regclass($1) AS r", ["public.smart_wallet_signals"]);
    if (swsigReg[0]?.r) {
      const sswCols = ["min_price_window_usd", "max_price_window_usd"];
      for (const c of sswCols) {
        const { rows } = await client.query(
          `SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'smart_wallet_signals' AND column_name = $1`,
          [c]
        );
        if (rows.length === 0) {
          console.error(`FAIL: smart_wallet_signals.${c} (run migration 016 / npm run db:ensure-signal-performance)`);
          failed += 1;
        } else console.log(`OK: smart_wallet_signals.${c}`);
      }
    } else {
      console.log("SKIP: smart_wallet_signals (table not present)");
    }

    // If these tables exist, RLS must be ON (migrations 013/014/015 or rls_public_lockdown.sql).
    const rlsTables = [
      "coordination_outcomes",
      "wallet_behavior_stats",
      "wallet_coordination_pairs",
      "web_push_subscriptions"
    ];
    for (const t of rlsTables) {
      const { rows: regRows } = await client.query("SELECT to_regclass($1) AS r", [`public.${t}`]);
      if (!regRows[0]?.r) {
        console.log(`SKIP RLS check: public.${t} (table not present yet)`);
        continue;
      }
      const { rows: rlsRows } = await client.query(
        `SELECT c.relrowsecurity AS rls_on
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = $1 AND c.relkind = 'r'`,
        [t]
      );
      const on = rlsRows[0]?.rls_on === true;
      if (!on) {
        console.error(
          `FAIL: RLS disabled on public.${t} — run npm run db:ensure-signal-performance --prefix backend (includes 013–015) or apply the matching migration in SQL Editor, then refresh Security Advisor.`
        );
        failed += 1;
      } else {
        console.log(`OK: RLS enabled on public.${t}`);
      }
    }

    // Wallet Stalker F4 (017): baselines + dedup when Stalker is deployed on this database.
    const { rows: wsReg } = await client.query("SELECT to_regclass($1) AS r", ["public.wallet_stalks"]);
    const hasWalletStalks = Boolean(wsReg[0]?.r);
    const { rows: blReg } = await client.query("SELECT to_regclass($1) AS r", ["public.stalker_position_baselines"]);
    const { rows: ddReg } = await client.query("SELECT to_regclass($1) AS r", ["public.stalker_baseline_dedup"]);
    const hasF4Baselines = Boolean(blReg[0]?.r);
    const hasF4Dedup = Boolean(ddReg[0]?.r);

    if (!hasWalletStalks && (hasF4Baselines || hasF4Dedup)) {
      console.log(
        "WARN: stalker F4 table(s) exist but public.wallet_stalks is missing — wrong Supabase project, or migration 002 never applied on this database."
      );
    }

    if (strictStalker && !hasWalletStalks) {
      console.error(
        "FAIL: public.wallet_stalks missing (--stalker-strict). Point DATABASE_URL (or SUPABASE_URL + SUPABASE_DB_PASSWORD) at the same Postgres the API uses for Stalker, then re-run. See docs/OPS_RUNBOOK.md § Wallet Stalker F4."
      );
      failed += 1;
    } else if (hasWalletStalks) {
      console.log("OK: table public.wallet_stalks");
      for (const t of ["stalker_position_baselines", "stalker_baseline_dedup"]) {
        const { rows } = await client.query("SELECT to_regclass($1) AS r", [`public.${t}`]);
        if (!rows[0]?.r) {
          console.error(
            `FAIL: missing public.${t} — run migration 017 (npm run db:ensure-signal-performance --prefix backend) or paste supabase/migrations/017_stalker_double_down_baselines.sql in SQL Editor.`
          );
          failed += 1;
        } else {
          console.log(`OK: table public.${t}`);
        }
      }
    } else if (!strictStalker) {
      console.log("SKIP: stalker F4 bundle (wallet_stalks not present; use --stalker-strict on Stalker Postgres to require OK)");
    }

    const { rows: feedReg } = await client.query("SELECT to_regclass($1) AS r", ["public.pro_alert_feed_items"]);
    if (feedReg[0]?.r) {
      console.log("OK: table public.pro_alert_feed_items");
    } else {
      console.log("SKIP: pro_alert_feed_items (migration 018 not applied — optional until db:ensure-signal-performance)");
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
