#!/usr/bin/env node
"use strict";

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { tryResolvePostgresUrlFromSupabaseEnv } = require(path.join(
  __dirname,
  "..",
  "src",
  "lib",
  "resolvePostgresUrlFromSupabase"
));
const { Client } = require("pg");

const BASE_URL = String(process.env.BACKEND_URL || "https://sentinel-ledger-backend-production.up.railway.app").replace(
  /\/+$/,
  ""
);

async function main() {
  const dbUrl = String(tryResolvePostgresUrlFromSupabaseEnv(process.env) || "").trim();
  const webhookSecret = process.env.HELIUS_WEBHOOK_SECRET;
  if (!dbUrl) throw new Error("Missing DATABASE_URL or SUPABASE_URL+SUPABASE_DB_PASSWORD");
  if (!webhookSecret) throw new Error("Missing HELIUS_WEBHOOK_SECRET");

  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const walletRow = (
      await client.query(
        "select wallet_address from smart_wallets where win_rate >= 70 order by updated_at desc nulls last limit 1"
      )
    ).rows[0];
    if (!walletRow?.wallet_address) throw new Error("No smart wallet found with win_rate >= 70");
    const wallet = String(walletRow.wallet_address);
    const mint = "So11111111111111111111111111111111111111112";

    const before = (
      await client.query(
        "select count(*)::int as n, max(created_at) as last_at from smart_wallet_signals where token_address=$1 and wallet_address=$2",
        [mint, wallet]
      )
    ).rows[0];
    const beforeLastMs = before?.last_at ? Date.parse(before.last_at) : 0;

    const payload = [
      {
        signature: `probe-${Date.now().toString(36)}`,
        feePayer: wallet,
        timestamp: Math.floor(Date.now() / 1000),
        tokenTransfers: [{ mint, tokenAmount: 1234, toUserAccount: wallet, fromUserAccount: null }]
      }
    ];

    const res = await fetch(`${BASE_URL}/api/v1/webhooks/helius`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-helius-secret": webhookSecret
      },
      body: JSON.stringify(payload)
    });
    const body = await res.json().catch(() => ({}));
    await new Promise((r) => setTimeout(r, 1500));

    const after = (
      await client.query(
        "select count(*)::int as n, max(created_at) as last_at from smart_wallet_signals where token_address=$1 and wallet_address=$2",
        [mint, wallet]
      )
    ).rows[0];
    const afterLastMs = after?.last_at ? Date.parse(after.last_at) : 0;

    console.log(
      JSON.stringify(
        {
          ok: true,
          wallet,
          mint,
          webhookStatus: res.status,
          webhookBody: body,
          beforeCount: Number(before?.n || 0),
          afterCount: Number(after?.n || 0),
          beforeLastAt: before?.last_at || null,
          afterLastAt: after?.last_at || null,
          newerTimestampObserved: Number.isFinite(afterLastMs) && afterLastMs > beforeLastMs
        },
        null,
        2
      )
    );
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
