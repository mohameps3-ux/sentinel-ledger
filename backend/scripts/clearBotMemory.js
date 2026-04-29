#!/usr/bin/env node
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { Client } = require("pg");
const {
  getPostgresUrlCandidatesFromSupabaseEnv
} = require("../src/lib/resolvePostgresUrlFromSupabase");

async function main() {
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
      const { rowCount } = await client.query("DELETE FROM public.bot_memory");
      await client.end();
      console.log("OK: deleted rows from public.bot_memory count=", rowCount);
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
