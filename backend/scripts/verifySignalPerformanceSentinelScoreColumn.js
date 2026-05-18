/**
 * Confirms public.signal_performance has sentinel_score (migration 032).
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
      `SELECT column_name, data_type, numeric_precision, numeric_scale, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'signal_performance'
         AND column_name = 'sentinel_score'`
    );
    if (!rows.length) {
      console.error("FAIL: column public.signal_performance.sentinel_score does not exist.");
      process.exit(1);
    }
    console.log("OK: sentinel_score column exists:", rows[0]);
    if (rows[0].is_nullable !== "YES") {
      console.warn("WARN: expected sentinel_score to be nullable (non-fatal).");
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
