/**
 * Read-only: last few smart_wallet_signals relevant to price job (why skips).
 * node scripts/inspectSignalPriceCandidates.js
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { getSupabase } = require("../src/lib/supabase");

async function main() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("smart_wallet_signals")
    .select(
      "id, created_at, token_address, entry_price_usd, min_price_window_usd, max_price_window_usd, " +
        "price_5m_usd, price_1h_usd, result_pct"
    )
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) throw error;
  const now = Date.now();
  for (const r of data || []) {
    const ageH = ((now - new Date(r.created_at).getTime()) / 3600000).toFixed(2);
    console.log(JSON.stringify({ ...r, ageHours: ageH }, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
