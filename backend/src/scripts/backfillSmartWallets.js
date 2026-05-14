"use strict";

/**
 * One-off: re-run analyzeWallet for smart_wallets rows with total_trades = 0.
 * Run from backend root: node src/scripts/backfillSmartWallets.js
 */

require("dotenv").config();

const { getSupabase } = require("../lib/supabase");
const { analyzeWallet } = require("../services/analyzeWallet");

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 2000;
const PAGE_SIZE = 1000;
const MAX_ERROR_SAMPLES = 30;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

async function fetchWalletAddressesZeroTrades(supabase) {
  const addresses = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("smart_wallets")
      .select("wallet_address")
      .eq("total_trades", 0)
      .order("wallet_address", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const row of data) {
      const w = row?.wallet_address;
      if (w) addresses.push(String(w).trim());
    }

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return [...new Set(addresses)];
}

/**
 * @returns {Promise<{ ok: boolean, walletCount: number, batchCount: number, errors: number, errorSamples: Array<{ wallet: string, error: string }> }>}
 */
async function runBackfillSmartWallets() {
  const supabase = getSupabase();
  const wallets = await fetchWalletAddressesZeroTrades(supabase);

  if (!wallets.length) {
    console.log("[backfillSmartWallets] No wallets with total_trades = 0.");
    return { ok: true, walletCount: 0, batchCount: 0, errors: 0, errorSamples: [] };
  }

  console.log(`[backfillSmartWallets] Found ${wallets.length} wallet(s) with total_trades = 0.`);

  const batches = chunk(wallets, BATCH_SIZE);
  const totalBatches = batches.length;
  let errors = 0;
  const errorSamples = [];

  for (let i = 0; i < batches.length; i += 1) {
    const batch = batches[i];
    const batchNum = i + 1;

    for (const wallet of batch) {
      console.log(`Processing batch ${batchNum}/${totalBatches} - wallet: ${wallet}`);
      try {
        await analyzeWallet(wallet);
      } catch (err) {
        errors += 1;
        const msg = err?.message || String(err);
        console.error(`[backfillSmartWallets] error wallet=${wallet}:`, msg);
        if (errorSamples.length < MAX_ERROR_SAMPLES) {
          errorSamples.push({ wallet, error: msg });
        }
      }
    }

    if (i < batches.length - 1) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  console.log("[backfillSmartWallets] Done.");
  return {
    ok: true,
    walletCount: wallets.length,
    batchCount: totalBatches,
    errors,
    errorSamples
  };
}

if (require.main === module) {
  runBackfillSmartWallets()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error("[backfillSmartWallets] fatal:", e?.message || e);
      process.exit(1);
    });
}

module.exports = { runBackfillSmartWallets };
