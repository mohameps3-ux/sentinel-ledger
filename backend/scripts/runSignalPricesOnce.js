#!/usr/bin/env node
/**
 * One-shot enrichment for smart_wallet_signals (DexScreener spot USD).
 * Usage: from backend/, `node scripts/runSignalPricesOnce.js`
 */
require("dotenv").config();
const { runSignalPriceEnrichmentOnce } = require("../src/services/smartWalletSignalPrices");

runSignalPriceEnrichmentOnce()
  .then((s) => {
    console.log(JSON.stringify(s, null, 2));
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
