/**
 * One-shot Postgres migrations (002 … 018). Safe to re-run (IF NOT EXISTS / idempotent patterns).
 *
 * Runbook
 * - Set at least DATABASE_URL or SUPABASE_DATABASE_URL in backend/.env (or Railway/Supabase panel).
 *   This URI is for running this script only; API runtime uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 * - Once: from repo root: `node backend/scripts/applySignalPerformanceSchema.js`
 *   or: `npm run db:ensure-signal-performance` with cwd backend (see package.json).
 * - Order: 002 → 002_validation_oracle → 003 → 011 → 010 → 012 → 013 → 014 → 015 → 016 → 017 → 018.
 * - Optional tunables: see backend/.env.example (COORD_OUTCOME_HORIZON_MIN, COORD_OUTCOME_PUMP_MIN_PCT, COORD_OUTCOME_CRON_ENABLED, …).
 * - If 012 is not applied: app remains tolerant; “verified” recurrence uses signal_performance fallback when
 *   coordination_outcomes has no row; if the table is missing, the outcome map is empty and the same fallback applies.
 */
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { getPostgresUrlCandidatesFromSupabaseEnv } = require(path.join(
  __dirname,
  "..",
  "src",
  "lib",
  "resolvePostgresUrlFromSupabase"
));
const { Client } = require("pg");

const CONNECT_TIMEOUT_MS = 12000;

function redactUrlForLog(u) {
  return String(u || "").replace(/(:)([^@/]+)(@)/, "$1***$3");
}

async function main() {
  const candidates = getPostgresUrlCandidatesFromSupabaseEnv(process.env);
  if (!candidates.length) {
    console.error(
      "Missing a Postgres connection for this script (direct URI or derivable from Supabase).\n" +
        "  Option A: set DATABASE_URL or SUPABASE_DATABASE_URL in backend/.env (Supabase → Database → URI, pooler or direct).\n" +
        "  Option B: set SUPABASE_URL + SUPABASE_DB_PASSWORD (database password from the same screen — not the service role key).\n" +
        "           The script tries Session pooler (IPv4) in several regions, then direct db.<ref> (may be IPv6-only).\n" +
        "  Option C: set SUPABASE_DB_REGION if you know the AWS region from Connect → Session mode.\n" +
        "  Option D: railway run npm run db:ensure-signal-performance (injects env from a linked project).\n" +
        "Note: this script always loads backend/.env from disk."
    );
    process.exit(1);
  }
  const migrationsDir = path.join(__dirname, "..", "..", "supabase", "migrations");
  // Order: 002 wallet_stalks (Stalker) before 017 F4; signal_performance 003+; 010 before 012 (FK to wallet_coordination_alerts).
  const migrationFiles = [
    "002_deployer_dna_wallet_stalker.sql",
    "002_validation_oracle.sql",
    "003_signal_performance.sql",
    "011_signal_performance_emission_regime.sql",
    "010_wallet_coordination_alerting.sql",
    "012_coordination_outcomes.sql",
    "013_coordination_outcomes_rls.sql",
    "014_wallet_behavior_and_coordination_rls.sql",
    "015_web_push_subscriptions.sql",
    "016_smart_wallet_signal_window_extrema.sql",
    "017_stalker_double_down_baselines.sql",
    "018_pro_alert_feed_items.sql",
    "019_flipside_smart_wallet_source.sql"
  ];

  let lastErr;
  for (const url of candidates) {
    const client = new Client({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS
    });
    try {
      await client.connect();
      lastErr = null;
      try {
        for (const name of migrationFiles) {
          const sqlPath = path.join(migrationsDir, name);
          if (!fs.existsSync(sqlPath)) {
            console.error(`MISSING migration file (expected in repo): ${sqlPath}`);
            throw new Error(`missing_migration:${name}`);
          }
          const sql = fs.readFileSync(sqlPath, "utf8");
          await client.query(sql);
          console.log(`OK: ${name}`);
        }
        console.log(
          "OK: wallet_stalks (002), validation oracle, signal_performance, coordination tables, RLS, web_push (015), window extrema (016), stalker F4 (017), PRO alert feed (018) applied."
        );
        console.log(`(connected with ${redactUrlForLog(url)})`);
      } finally {
        await client.end();
      }
      return;
    } catch (e) {
      lastErr = e;
      const msg = String(e?.message || e);
      console.warn(`[db] connect/migrate failed, next candidate. ${redactUrlForLog(url)} → ${msg}`);
      try {
        await client.end();
      } catch {
        // ignore
      }
    }
  }
  if (lastErr) throw lastErr;
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});

