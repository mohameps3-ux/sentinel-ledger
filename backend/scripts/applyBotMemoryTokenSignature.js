#!/usr/bin/env node
/**
 * One-off: ALTER public.bot_memory + index token_signature.
 * Uses same Postgres resolution as other migration scripts.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { Client } = require("pg");
const {
  getPostgresUrlCandidatesFromSupabaseEnv
} = require("../src/lib/resolvePostgresUrlFromSupabase");

const SQL = `
ALTER TABLE public.bot_memory
  ADD COLUMN IF NOT EXISTS token_signature VARCHAR(200);

CREATE INDEX IF NOT EXISTS idx_bot_memory_signature
  ON public.bot_memory (token_signature);
`;

async function main() {
  const candidates = getPostgresUrlCandidatesFromSupabaseEnv(process.env);
  if (!candidates.length) {
    console.error("No DATABASE_URL / derivable Supabase Postgres. See backend/.env.example.");
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
      await client.query(SQL);
      const { rows } = await client.query(`
        SELECT column_name, data_type, character_maximum_length
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'bot_memory' AND column_name = 'token_signature'
      `);
      await client.end();
      if (!rows.length) {
        console.error("FAIL: column token_signature not visible after ALTER");
        process.exit(1);
      }
      console.log("OK: bot_memory.token_signature", rows[0]);
      return;
    } catch (e) {
      lastErr = e;
      try {
        await client.end();
      } catch {
        // ignore
      }
      console.warn("[db] try failed:", e.message || e);
    }
  }
  throw lastErr || new Error("all connection candidates failed");
}

main().catch((e) => {
  console.error("FAIL:", e.message || e);
  process.exit(1);
});
