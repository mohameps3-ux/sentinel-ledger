#!/usr/bin/env node
/**
 * HOT tab / trending: public SELECT on tables that had RLS enabled without read policies.
 * Postgres has no CREATE POLICY IF NOT EXISTS; use DROP IF EXISTS + CREATE.
 *
 * Not run on API deploy — execute when needed: npm run db:apply-hot-rls-read-policies (cwd: backend).
 * Railway: railway run npm run db:apply-hot-rls-read-policies. See README § Supabase.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { Client } = require("pg");
const {
  getPostgresUrlCandidatesFromSupabaseEnv
} = require("../src/lib/resolvePostgresUrlFromSupabase");

const SQL = `
BEGIN;
DROP POLICY IF EXISTS "public_read_auto_discovered" ON public.auto_discovered_wallets;
CREATE POLICY "public_read_auto_discovered" ON public.auto_discovered_wallets FOR SELECT USING (true);
DROP POLICY IF EXISTS "public_read_signal_outcomes" ON public.signal_outcomes;
CREATE POLICY "public_read_signal_outcomes" ON public.signal_outcomes FOR SELECT USING (true);
COMMIT;
`;

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
      await client.query(SQL);
      await client.end();
      console.log("OK: public_read_auto_discovered + public_read_signal_outcomes");
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
