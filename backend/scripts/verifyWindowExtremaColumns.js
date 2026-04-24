/**
 * One-off read: confirms migration 016 columns on smart_wallet_signals. Run: node scripts/verifyWindowExtremaColumns.js
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { getPostgresUrlCandidatesFromSupabaseEnv } = require(path.join(
  __dirname,
  "..",
  "src",
  "lib",
  "resolvePostgresUrlFromSupabase"
));
const { Client } = require("pg");

async function main() {
  const cands = getPostgresUrlCandidatesFromSupabaseEnv(process.env);
  for (const url of cands) {
    const c = new Client({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 12000
    });
    try {
      await c.connect();
      const { rows } = await c.query(
        `SELECT column_name, data_type
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'smart_wallet_signals'
           AND column_name IN ('min_price_window_usd', 'max_price_window_usd')
         ORDER BY 1`
      );
      if (rows.length === 2) {
        console.log("OK: columns min_price_window_usd and max_price_window_usd exist:", rows);
        return;
      }
      console.log("UNEXPECTED: expected 2 columns, got:", rows);
      process.exit(1);
    } catch (e) {
      console.warn("connect failed, next:", e.message);
    } finally {
      try {
        await c.end();
      } catch {
        // ignore
      }
    }
  }
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
