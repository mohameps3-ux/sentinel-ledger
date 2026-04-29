#!/usr/bin/env node
const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { Client } = require("pg");
const {
  getPostgresUrlCandidatesFromSupabaseEnv
} = require("../src/lib/resolvePostgresUrlFromSupabase");

const SQL_PATH = path.join(
  __dirname,
  "..",
  "..",
  "supabase",
  "migrations",
  "022_guest_trials.sql"
);

async function main() {
  const sql = fs.readFileSync(SQL_PATH, "utf8");
  const candidates = getPostgresUrlCandidatesFromSupabaseEnv(process.env);
  if (!candidates.length) {
    console.error("No Postgres URL configured.");
    process.exit(1);
  }
  let lastErr;
  for (const url of candidates) {
    const client = new Client({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15000
    });
    try {
      await client.connect();
      await client.query(sql);
      await client.end();
      console.log("OK: applied", path.basename(SQL_PATH));
      return;
    } catch (e) {
      lastErr = e;
      try {
        await client.end();
      } catch {
        // ignore
      }
      console.warn("[db]", e.message);
    }
  }
  throw lastErr || new Error("failed");
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
