/**
 * One-shot Postgres migrations (003, 011, 010, 012). Safe to re-run (IF NOT EXISTS / idempotent patterns).
 *
 * Runbook
 * - Set at least DATABASE_URL or SUPABASE_DATABASE_URL in backend/.env (or Railway/Supabase panel).
 *   This URI is for running this script only; API runtime uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 * - Once: from repo root: `node backend/scripts/applySignalPerformanceSchema.js`
 *   or: `npm run db:ensure-signal-performance` with cwd backend (see package.json).
 * - Order: 003 (signal_performance) → 011 (emission_regime) → 010 (wallet_coordination_*) → 012 (coordination_outcomes, FK to alerts).
 * - Optional tunables: see backend/.env.example (COORD_OUTCOME_HORIZON_MIN, COORD_OUTCOME_PUMP_MIN_PCT, COORD_OUTCOME_CRON_ENABLED, …).
 * - If 012 is not applied: app remains tolerant; “verified” recurrence uses signal_performance fallback when
 *   coordination_outcomes has no row; if the table is missing, the outcome map is empty and the same fallback applies.
 */
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { Client } = require("pg");

async function main() {
  const url = String(process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || "").trim();
  if (!url) {
    console.error(
      "Missing DATABASE_URL or SUPABASE_DATABASE_URL.\n" +
        "  • Set one of them in backend/.env (Supabase → Project Settings → Database → URI, use pooler or session mode).\n" +
        "  • Or: railway run npm run db:ensure-signal-performance (uses Railway service env).\n" +
        "Note: this script always loads backend/.env from disk, not the shell cwd."
    );
    process.exit(1);
  }
  const migrationsDir = path.join(__dirname, "..", "..", "supabase", "migrations");
  // Order: signal_performance first; 010 before 012 (FK to wallet_coordination_alerts).
  const migrationFiles = [
    "003_signal_performance.sql",
    "011_signal_performance_emission_regime.sql",
    "010_wallet_coordination_alerting.sql",
    "012_coordination_outcomes.sql"
  ];
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    for (const name of migrationFiles) {
      const sqlPath = path.join(migrationsDir, name);
      if (!fs.existsSync(sqlPath)) continue;
      const sql = fs.readFileSync(sqlPath, "utf8");
      await client.query(sql);
      console.log(`OK: ${name}`);
    }
    console.log("OK: signal_performance, coordination tables, and coordination_outcomes applied.");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});

