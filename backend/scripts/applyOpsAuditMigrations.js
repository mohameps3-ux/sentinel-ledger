"use strict";

const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { Client } = require("pg");
const { getPostgresUrlCandidatesFromSupabaseEnv } = require(path.join(
  __dirname,
  "..",
  "src",
  "lib",
  "resolvePostgresUrlFromSupabase"
));

const FILES = ["030_ops_audit_log.sql", "031_ops_autonomy.sql", "034_ops_audit_full_autonomy.sql"];

async function main() {
  const candidates = getPostgresUrlCandidatesFromSupabaseEnv(process.env);
  if (!candidates.length) {
    console.error("No Postgres URL (set DATABASE_URL or SUPABASE_URL + SUPABASE_DB_PASSWORD)");
    process.exit(1);
  }
  const migrationsDir = path.join(__dirname, "..", "..", "supabase", "migrations");
  let lastErr;
  for (const url of candidates) {
    const client = new Client({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15000
    });
    try {
      await client.connect();
      for (const name of FILES) {
        const sqlPath = path.join(migrationsDir, name);
        if (!fs.existsSync(sqlPath)) {
          console.error("Missing:", sqlPath);
          process.exit(1);
        }
        const sql = fs.readFileSync(sqlPath, "utf8");
        console.log("Applying", name, "...");
        await client.query(sql);
      }
      const verify = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'ops_audit_log'
        ORDER BY column_name
      `);
      console.log(
        "ops_audit_log columns:",
        verify.rows.map((r) => r.column_name).join(", ")
      );
      await client.end();
      console.log("OK: ops audit migrations applied.");
      return;
    } catch (e) {
      lastErr = e;
      try {
        await client.end();
      } catch (_) {}
    }
  }
  console.error("Failed:", lastErr?.message || lastErr);
  process.exit(1);
}

main();
