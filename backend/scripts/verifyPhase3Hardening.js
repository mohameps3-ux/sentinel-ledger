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

const BASE = "https://sentinel-ledger-backend-production.up.railway.app";

async function main() {
  const url = String(tryResolvePostgresUrlFromSupabaseEnv(process.env) || "").trim() || null;
  const opsKey = process.env.OMNI_BOT_OPS_KEY || "";
  if (!url) throw new Error("missing database url");
  if (!opsKey) throw new Error("missing OMNI_BOT_OPS_KEY");

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  let db = {};
  try {
    const col = await client.query(
      "select 1 from information_schema.columns where table_schema='public' and table_name='smart_wallet_signals' and column_name='created_minute'"
    );
    const idx = await client.query(
      "select 1 from pg_indexes where schemaname='public' and tablename='smart_wallet_signals' and indexname='ux_smart_wallet_signals_wallet_token_action_minute'"
    );
    db = {
      createdMinuteColumn: col.rows.length > 0,
      uniqueMinuteIndex: idx.rows.length > 0
    };
  } finally {
    await client.end();
  }

  const headers = { "x-ops-key": opsKey };
  const [sloRes, freshRes, latestRes] = await Promise.all([
    fetch(`${BASE}/api/v1/ops/signals-supabase-slo/snapshot`, { headers }),
    fetch(`${BASE}/api/v1/ops/data-freshness`, { headers }),
    fetch(`${BASE}/api/v1/signals/latest?limit=12&strategy=balanced`)
  ]);
  const [slo, fresh, latest] = await Promise.all([
    sloRes.json().catch(() => ({})),
    freshRes.json().catch(() => ({})),
    latestRes.json().catch(() => ({}))
  ]);

  console.log(
    JSON.stringify(
      {
        db,
        sloStatus: sloRes.status,
        sloConfig: slo?.config || null,
        freshnessStatus: freshRes.status,
        supabaseRate24h: fresh?.data?.signalsLatest?.supabaseSourceRate24h,
        latestStatus: latestRes.status,
        latestSource: latest?.meta?.source || null,
        latestProviderUsed: latest?.meta?.providerUsed || null
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
