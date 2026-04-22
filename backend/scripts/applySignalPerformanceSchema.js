/**
 * Applies signal_performance schema migration using direct Postgres.
 * Requires DATABASE_URL or SUPABASE_DATABASE_URL (e.g. in backend/.env).
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
  const migrationFiles = ["003_signal_performance.sql", "011_signal_performance_emission_regime.sql"];
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
    console.log("OK: signal_performance schema applied.");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});

