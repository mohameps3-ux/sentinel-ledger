#!/usr/bin/env node
/**
 * One-shot enrichment for smart_wallet_signals (DexScreener spot USD).
 * Usage: from backend/, `npm run signal-prices-once`
 * Optional: SIGNAL_PRICE_BATCH=80 node scripts/runSignalPricesOnce.js
 * Or: node scripts/runSignalPricesOnce.js --batch=80
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { runSignalPriceEnrichmentOnce } = require("../src/services/smartWalletSignalPrices");

function parseBatchArg() {
  const raw = process.argv.find((a) => /^--batch=/.test(a));
  if (raw) {
    const n = Number(raw.split("=")[1]);
    if (Number.isFinite(n) && n > 0) return Math.min(100, Math.floor(n));
  }
  return undefined;
}

const batch = parseBatchArg();
runSignalPriceEnrichmentOnce(batch != null ? { batch } : {})
  .then((s) => {
    console.log(JSON.stringify(s, null, 2));
    if (s.examined > 0 && s.updated === 0) {
      console.warn(
        "[signal-prices-once] 0 updates: common causes — Dex sin precio para el mint; " +
          "filas ya completas en checkpoints; o señales más viejas que SIGNAL_PRICE_WINDOW_EXTREMA_MS (~25h), " +
          "en cuyo caso min/max de ventana ya no se escriben (extremaSource sigue en checkpoints)."
      );
    }
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
