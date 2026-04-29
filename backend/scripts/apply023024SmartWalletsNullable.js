#!/usr/bin/env node
/**
 * Applies Supabase migrations 023 and 024 (smart_wallets nullable pnl_30d, win_rate).
 * Idempotent: safe if columns already nullable.
 */
const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { Client } = require("pg");
const {
  getPostgresUrlCandidatesFromSupabaseEnv
} = require("../src/lib/resolvePostgresUrlFromSupabase");

const FILES = [
  "023_smart_wallets_pnl_30d_nullable.sql",
  "024_smart_wallets_win_rate_nullable.sql"
];

async function main() {
  const candidates = getPostgresUrlCandidatesFromSupabaseEnv(process.env);
  if (!candidates.length) {
    console.error("No Postgres URL configured.");
    process.exit(1);
  }
  const migrationsRoot = path.join(__dirname, "..", "..", "supabase", "migrations");
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
        const sqlPath = path.join(migrationsRoot, name);
        const sql = fs.readFileSync(sqlPath, "utf8");
        await client.query(sql);
        console.log("OK:", name);
      }
      await client.end();
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
