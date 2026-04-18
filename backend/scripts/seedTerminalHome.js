#!/usr/bin/env node
/**
 * Idempotent demo data for the home terminal APIs (Supabase only, $0 external APIs).
 *
 * - smart_wallets: scores for /api/v1/smart-wallets/top
 * - smart_wallet_signals: rows with result_pct for /api/v1/signals/outcomes (Proof of Edge)
 * - tokens_analyzed: ia_score for /api/v1/tokens/hot merge
 *
 * Requires: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * Optional SQL (run once in Supabase SQL editor if upsert fails on prices):
 *   see ../supabase/public_surface_enhancements.sql
 *
 * Usage (from backend/): npm run seed:terminal-home
 */
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const MINTS = {
  bonk: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  wif: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
  jup: "JUPyiwrYJFksjQVdKWvHJHGzS76nqbwsjZBM74fATFc",
  wsol: "So11111111111111111111111111111111111111112"
};

/** Same demo wallets as supabase/seed_smart_wallets_demo.sql (44-char addresses). */
const W = [
  "7YqvBxbp5XJvYzX1Q2f7pN8mQ3uQmY9mQb8Qxqj2mT8x",
  "4g3b6PqvT2n8mM9mQx2sJ1pK8pQ9xY7uV2cR5bN1mX3q",
  "9mQx2sJ1pK8pQ9xY7uV2cR5bN1mX3q4g3b6PqvT2n8m",
  "5tK9pQxY7uV2cR5bN1mX3q4g3b6PqvT2n8mM9mQx2sJ",
  "2cR5bN1mX3q4g3b6PqvT2n8mM9mQx2sJ1pK8pQ9xY7u",
  "BqvT2n8mM9mQx2sJ1pK8pQ9xY7uV2cR5bN1mX3q4g3b",
  "C6PqvT2n8mM9mQx2sJ1pK8pQ9xY7uV2cR5bN1mX3q4g",
  "D2n8mM9mQx2sJ1pK8pQ9xY7uV2cR5bN1mX3q4g3b6Pq"
];

function isoHoursAgo(h) {
  return new Date(Date.now() - h * 3600 * 1000).toISOString();
}

function buildWalletRows() {
  const nowIso = new Date().toISOString();
  return W.map((wallet_address, idx) => {
    const winRate = 72 + (idx % 18);
    const early = 65 + ((idx * 3) % 28);
    const cluster = 60 + ((idx * 5) % 32);
    const consistency = 62 + ((idx * 4) % 28);
    const smartScore = Math.round(winRate * 0.4 + early * 0.3 + cluster * 0.2 + consistency * 0.1);
    return {
      wallet_address,
      win_rate: winRate,
      pnl_30d: 5000 + idx * 2100,
      avg_position_size: 900 + idx * 120,
      recent_hits: 2 + (idx % 6),
      early_entry_score: early,
      cluster_score: cluster,
      consistency_score: consistency,
      smart_score: smartScore,
      last_seen: nowIso,
      updated_at: nowIso
    };
  });
}

function demoSignalId(n) {
  return `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
}

/** Fixed UUIDs so re-runs overwrite the same demo signals. */
function buildSignalRows(withPrices) {
  const specs = [
    { id: demoSignalId(1), mint: MINTS.bonk, w: 0, conf: 91, h: 2, pct: 52.4 },
    { id: demoSignalId(2), mint: MINTS.wif, w: 1, conf: 89, h: 5, pct: 38.1 },
    { id: demoSignalId(3), mint: MINTS.jup, w: 2, conf: 86, h: 8, pct: 22.0 },
    { id: demoSignalId(4), mint: MINTS.wsol, w: 3, conf: 84, h: 12, pct: -8.2 },
    { id: demoSignalId(5), mint: MINTS.bonk, w: 4, conf: 82, h: 18, pct: 15.5 },
    { id: demoSignalId(6), mint: MINTS.wif, w: 5, conf: 80, h: 22, pct: -11.3 },
    { id: demoSignalId(7), mint: MINTS.jup, w: 6, conf: 78, h: 28, pct: 41.0 },
    { id: demoSignalId(8), mint: MINTS.wsol, w: 7, conf: 76, h: 34, pct: 6.2 },
    { id: demoSignalId(9), mint: MINTS.bonk, w: 0, conf: 74, h: 40, pct: -4.1 },
    { id: demoSignalId(10), mint: MINTS.wif, w: 1, conf: 72, h: 46, pct: 63.2 }
  ];

  return specs.map((s) => {
    const base = {
      id: s.id,
      token_address: s.mint,
      wallet_address: W[s.w % W.length],
      last_action: "buy",
      confidence: s.conf,
      created_at: isoHoursAgo(s.h)
    };
    if (!withPrices) return base;
    const entry = 0.5 + (s.conf % 20) * 0.01;
    const later = entry * (1 + s.pct / 100);
    return {
      ...base,
      entry_price_usd: entry,
      price_1h_usd: later,
      result_pct: s.pct
    };
  });
}

function buildTokensAnalyzed() {
  return [
    { token_address: MINTS.bonk, ia_score: 88, decision: "BUY", confidence: 82 },
    { token_address: MINTS.wif, ia_score: 90, decision: "BUY", confidence: 85 },
    { token_address: MINTS.jup, ia_score: 84, decision: "WATCH", confidence: 70 },
    { token_address: MINTS.wsol, ia_score: 62, decision: "WATCH", confidence: 55 }
  ].map((r) => ({
    ...r,
    chain: "solana",
    components: {},
    details: {},
    version: "v1.0",
    last_checked: new Date().toISOString()
  }));
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (.env in backend/).");
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const fullWallets = buildWalletRows();
  let { error: wErr } = await supabase.from("smart_wallets").upsert(fullWallets, { onConflict: "wallet_address" });
  if (wErr) {
    console.warn("smart_wallets full upsert failed, retrying base columns:", wErr.message);
    const minimal = fullWallets.map(
      ({ wallet_address, win_rate, pnl_30d, avg_position_size, recent_hits, last_seen, updated_at }) => ({
        wallet_address,
        win_rate,
        pnl_30d,
        avg_position_size,
        recent_hits,
        last_seen,
        updated_at
      })
    );
    ({ error: wErr } = await supabase.from("smart_wallets").upsert(minimal, { onConflict: "wallet_address" }));
  }
  if (wErr) {
    console.error("smart_wallets upsert:", wErr.message);
    process.exit(1);
  }
  console.log(`OK: upserted ${W.length} smart_wallets rows.`);

  let withPrices = true;
  let sigRows = buildSignalRows(true);
  let { error: sErr } = await supabase.from("smart_wallet_signals").upsert(sigRows, { onConflict: "id" });
  if (sErr && /entry_price_usd|column|schema/i.test(sErr.message)) {
    console.warn("Retrying signals without price columns — run supabase/public_surface_enhancements.sql then re-run.");
    withPrices = false;
    sigRows = buildSignalRows(false);
    ({ error: sErr } = await supabase.from("smart_wallet_signals").upsert(sigRows, { onConflict: "id" }));
  }
  if (sErr) {
    console.error("smart_wallet_signals upsert:", sErr.message);
    process.exit(1);
  }
  console.log(`OK: upserted ${sigRows.length} smart_wallet_signals rows${withPrices ? " (with result_pct)" : " (add price columns + npm run signal-prices-once)"}.`);

  const { error: tErr } = await supabase.from("tokens_analyzed").upsert(buildTokensAnalyzed(), {
    onConflict: "token_address"
  });
  if (tErr) {
    console.warn("tokens_analyzed upsert (optional):", tErr.message);
  } else {
    console.log("OK: upserted tokens_analyzed ia_score rows for hot merge.");
  }

  console.log("\nNext (Railway / local):");
  console.log("  • Keep SIGNAL_PRICE_CRON_ENABLED=true so worker fills entry/result over time.");
  console.log("  • One-shot enrichment: npm run signal-prices-once");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
