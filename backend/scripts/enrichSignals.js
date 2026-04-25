#!/usr/bin/env node
"use strict";

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { getSupabase } = require("../src/lib/supabase");
const { runSignalResultEnrichmentOnce } = require("../src/services/smartWalletSignalPrices");

function argNumber(name, fallback) {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (!raw) return fallback;
  const n = Number(raw.split("=")[1]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

async function countPending() {
  const supabase = getSupabase();
  const { count, error } = await supabase
    .from("smart_wallet_signals")
    .select("id", { count: "exact", head: true })
    .is("result_pct", null);
  if (error) throw error;
  return count || 0;
}

async function main() {
  const batch = argNumber("batch", Number(process.env.SIGNAL_RESULT_ENRICH_BATCH || 500));
  const maxPasses = argNumber("passes", Number(process.env.SIGNAL_RESULT_ENRICH_PASSES || 20));

  let before = await countPending();
  console.log(`[enrich:signals] pending=${before} batch=${batch}`);

  let examined = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  let tokensFetched = 0;

  for (let pass = 1; pass <= maxPasses && before > 0; pass += 1) {
    const result = await runSignalResultEnrichmentOnce({ batch });
    examined += result.examined;
    updated += result.updated;
    skipped += result.skipped;
    errors += result.errors;
    tokensFetched += result.tokensFetched;
    console.log(
      `[enrich:signals] pass=${pass} examined=${result.examined} updated=${result.updated} ` +
        `skipped=${result.skipped} errors=${result.errors} tokens=${result.tokensFetched}`
    );
    if (result.examined === 0 || result.updated === 0) break;
    before = await countPending();
  }

  const after = await countPending();
  console.log(
    `[enrich:signals] complete examined=${examined} updated=${updated} skipped=${skipped} ` +
      `errors=${errors} tokensFetched=${tokensFetched} pending=${after}`
  );
}

main().catch((error) => {
  console.error("[enrich:signals] failed:", error?.message || error);
  process.exit(1);
});
