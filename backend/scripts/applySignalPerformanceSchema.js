/**
 * Applies signal_performance schema migration using direct Postgres.
 * Requires DATABASE_URL or SUPABASE_DATABASE_URL in backend/.env.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

async function main() {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL;
  if (!url) {
    console.error("Missing DATABASE_URL or SUPABASE_DATABASE_URL in .env");
    process.exit(1);
  }
  const sqlPath = path.join(__dirname, "..", "..", "supabase", "migrations", "003_signal_performance.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    console.log("OK: signal_performance schema applied.");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});

