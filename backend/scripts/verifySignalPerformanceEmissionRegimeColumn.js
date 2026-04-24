/**
 * Confirms public.signal_performance has emission_regime (migration 011).
 * Loads backend/.env from disk (same pattern as applySignalPerformanceSchema.js).
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

async function main() {
  const url = String(tryResolvePostgresUrlFromSupabaseEnv(process.env) || "").trim();
  if (!url) {
    console.error("Missing DATABASE_URL, or SUPABASE_URL + SUPABASE_DB_PASSWORD, in backend/.env");
    process.exit(1);
  }
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT column_name, data_type, character_maximum_length
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'signal_performance'
         AND column_name = 'emission_regime'`
    );
    if (!rows.length) {
      console.error("FAIL: column public.signal_performance.emission_regime does not exist.");
      process.exit(1);
    }
    console.log("OK: emission_regime column exists:", rows[0]);

    const { rows: idx } = await client.query(
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename = 'signal_performance'
         AND indexname = 'idx_signal_perf_emission_regime_emitted'`
    );
    if (!idx.length) {
      console.warn("WARN: expected index idx_signal_perf_emission_regime_emitted not found (non-fatal).");
    } else {
      console.log("OK: index", idx[0].indexname);
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
