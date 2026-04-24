/**
 * Ensures `subscriptions` table exists using direct Postgres (pooler).
 * Set DATABASE_URL in backend/.env — Supabase → Project Settings → Database → URI (Session mode or Transaction).
 * Or run supabase/payments_and_pro.sql manually in SQL Editor.
 */
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { tryResolvePostgresUrlFromSupabaseEnv } = require(path.join(
  __dirname,
  "..",
  "src",
  "lib",
  "resolvePostgresUrlFromSupabase"
));

async function main() {
  const { Client } = require("pg");
  const url = String(tryResolvePostgresUrlFromSupabaseEnv(process.env) || "").trim();
  if (!url) {
    console.error(
      "Missing Postgres connection: set DATABASE_URL, or SUPABASE_URL + SUPABASE_DB_PASSWORD, in backend/.env (see .env.example)."
    );
    process.exit(1);
  }
  const sqlPath = path.join(__dirname, "..", "..", "supabase", "payments_and_pro.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    console.log("OK: subscriptions schema applied.");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
