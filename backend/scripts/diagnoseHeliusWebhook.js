#!/usr/bin/env node
"use strict";
/**
 * PROMPT 3.1 — Helius webhook diagnostic (read-only + one synthetic POST test).
 * Usage: node backend/scripts/diagnoseHeliusWebhook.js [--skip-post]
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { Client } = require("pg");
const { tryResolvePostgresUrlFromSupabaseEnv } = require(path.join(
  __dirname,
  "..",
  "src",
  "lib",
  "resolvePostgresUrlFromSupabase"
));

const BASE_URL = String(
  process.env.BACKEND_URL || "https://sentinel-ledger-backend-production.up.railway.app"
).replace(/\/+$/, "");
const SKIP_POST = process.argv.includes("--skip-post");

function envPresent(name) {
  const v = process.env[name];
  return Boolean(v && String(v).trim());
}

function maskUrl(url) {
  if (!url) return "—";
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return String(url).slice(0, 80);
  }
}

async function fetchJson(url, opts = {}) {
  try {
    const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(20_000) });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text.slice(0, 500) };
    }
    return { ok: res.ok, status: res.status, json, headers: Object.fromEntries(res.headers.entries()) };
  } catch (e) {
    return { ok: false, status: 0, error: e?.message || String(e) };
  }
}

async function listHeliusWebhooks(apiKey) {
  const res = await fetchJson(`https://api.helius.xyz/v0/webhooks?api-key=${encodeURIComponent(apiKey)}`);
  return res;
}

async function pgStats(client) {
  const { rows } = await client.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 hour')::int AS last_1h,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS last_24h,
      MAX(created_at) AS last_at
    FROM smart_wallet_signals
  `);
  return rows[0];
}

async function syntheticPost(secret, wallet) {
  const mint = "So11111111111111111111111111111111111111112";
  const payload = [
    {
      signature: `diag-${Date.now().toString(36)}`,
      feePayer: wallet,
      timestamp: Math.floor(Date.now() / 1000),
      tokenTransfers: [{ mint, tokenAmount: 1234, toUserAccount: wallet, fromUserAccount: null }]
    }
  ];
  return fetchJson(`${BASE_URL}/api/v1/webhooks/helius`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-helius-secret": secret
    },
    body: JSON.stringify(payload)
  });
}

async function main() {
  console.log("# PROMPT 3.1 — Helius Webhook Diagnostic\n");
  console.log(`_Generated: ${new Date().toISOString()}_\n`);

  // ── 1. Endpoint location ──
  console.log("## 1. Backend webhook handler\n");
  console.log("- **File:** `backend/src/routes/heliusWebhook.js`");
  console.log("- **Processor:** `backend/src/services/heliusWebhookProcessor.js`");
  console.log("- **Mount:** `app.use('/api/v1/webhooks', heliusWebhookRouter)` in `server.js`");
  console.log("- **Path:** `POST /api/v1/webhooks/helius`");
  console.log("- **Health:** `GET /api/v1/webhooks/helius/health`");
  console.log("- **Auth:** `HELIUS_WEBHOOK_SECRET` via header `x-helius-secret` OR `Authorization: Bearer <secret>`");
  console.log("- **NOT** HMAC signature — shared secret only (Helius must be configured with matching auth header if supported)");
  console.log("- **Rate limit:** 120 req/min (`express-rate-limit`)");
  console.log("- **Body limit:** 512 KB");
  console.log("- **Guards:** entropyGuard (shape + low-entropy rejection), tx dedupe Redis");
  console.log("- **Queue:** optional BullMQ via `FF_WEBHOOK_WORKER`");
  console.log("- **DB writes:** `convergenceService.trackSmartBuyAndDetect` → `smart_wallet_signals`; signal engine → `signal_performance`\n");

  // ── 2. Env vars ──
  console.log("## 2. Environment variables (presence only)\n");
  const envVars = [
    "HELIUS_KEY",
    "HELIUS_API_KEY",
    "HELIUS_WEBHOOK_SECRET",
    "HELIUS_WEBHOOK_ID",
    "HELIUS_WEBHOOK_EXCLUDE",
    "HELIUS_RATE_LIMIT_RPS",
    "HELIUS_CREDITS_EXHAUSTED",
    "BACKEND_URL",
    "FF_WEBHOOK_WORKER",
    "BULLMQ_REDIS_URL",
    "REDIS_URL",
    "AUTO_DISCOVERY_ENABLED",
    "AUTO_DISCOVERY_PROMOTION_ENABLED",
    "SMART_WORKERS_ENABLED"
  ];
  for (const k of envVars) {
    console.log(`- ${k}: ${envPresent(k) ? "✓ set" : "✗ missing"}`);
  }
  console.log("");

  // ── 3. Live health endpoints ──
  console.log("## 3. Live backend probes\n");
  const [whHealth, health, ingestion] = await Promise.all([
    fetchJson(`${BASE_URL}/api/v1/webhooks/helius/health`),
    fetchJson(`${BASE_URL}/health`),
    fetchJson(`${BASE_URL}/health/ingestion`)
  ]);
  console.log(`### GET /api/v1/webhooks/helius/health → ${whHealth.status}`);
  console.log("```json");
  console.log(JSON.stringify(whHealth.json, null, 2));
  console.log("```\n");

  if (health.ok) {
    console.log("### GET /health (auto-discovery excerpt)");
    const ad = await fetchJson(`${BASE_URL}/api/v1/ops/auto-discovery/status`).catch?.(() => null);
    // ops route may need auth — try public health only
    console.log(`- lastSmartWalletCronRun: ${health.json?.lastSmartWalletCronRun || "—"}`);
    console.log(`- heliusWebhookConfigured: ${health.json?.heliusWebhookConfigured}`);
    console.log(`- smartWorkersEnabled: ${health.json?.smartWorkersEnabled}`);
  }

  console.log(`### GET /health/ingestion → ${ingestion.status}`);
  console.log(`- status: ${ingestion.json?.status}`);
  console.log(`- lastEventAgeMs: ${ingestion.json?.lastEventAgeMs}`);
  console.log(`- totalRawReceived: ${ingestion.json?.totalRawReceived}`);
  console.log(`- sources: ${JSON.stringify(ingestion.json?.sources || {})}\n`);

  // ── 4. Helius API webhooks ──
  console.log("## 4. Helius dashboard (API list webhooks)\n");
  const apiKey = String(process.env.HELIUS_KEY || process.env.HELIUS_API_KEY || "").trim();
  if (!apiKey) {
    console.log("_HELIUS_KEY not set locally — cannot query Helius API. Check Railway env._\n");
  } else {
    const hw = await listHeliusWebhooks(apiKey);
    console.log(`### GET /v0/webhooks → HTTP ${hw.status}`);
    if (hw.ok && Array.isArray(hw.json)) {
      if (!hw.json.length) {
        console.log("\n**⚠ NO WEBHOOKS REGISTERED IN HELIUS ACCOUNT — Route A likely.**\n");
      }
      for (const w of hw.json) {
        console.log("\n| Field | Value |");
        console.log("|-------|-------|");
        console.log(`| webhookID | ${w.webhookID || w.id || "—"} |`);
        console.log(`| webhookURL | ${maskUrl(w.webhookURL || w.webhookUrl)} |`);
        console.log(`| webhookType | ${w.webhookType || w.type || "—"} |`);
        console.log(`| transactionTypes | ${JSON.stringify(w.transactionTypes || w.txnStatus || "—")} |`);
        const addrs = w.accountAddresses || w.addresses || [];
        console.log(`| accountAddresses | ${addrs.length} accounts |`);
        if (addrs.length <= 5) console.log(`| (sample) | ${addrs.join(", ") || "—"} |`);
        else console.log(`| (sample) | ${addrs.slice(0, 3).join(", ")}… +${addrs.length - 3} more |`);
      }
      const expected = `${BASE_URL}/api/v1/webhooks/helius`;
      const matching = hw.json.filter((w) => {
        const u = String(w.webhookURL || w.webhookUrl || "");
        return u.includes("sentinel-ledger") || u.includes("railway.app");
      });
      console.log(`\n- Expected prod URL: \`${expected}\``);
      console.log(`- Webhooks pointing to Railway/sentinel: **${matching.length}**`);
      if (matching.length === 0 && hw.json.length > 0) {
        console.log("\n**⚠ Webhooks exist but NONE point to current Railway URL — Route A (update URL).**\n");
      }
    } else {
      console.log("```json");
      console.log(JSON.stringify(hw.json || hw.error, null, 2));
      console.log("```\n");
    }
  }

  // ── 5. DB signal counts ──
  console.log("## 5. smart_wallet_signals (Postgres)\n");
  const dbUrl = String(tryResolvePostgresUrlFromSupabaseEnv(process.env) || "").trim();
  if (!dbUrl) {
    console.log("_No DATABASE_URL — skip DB stats._\n");
  } else {
    const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();
    try {
      const stats = await pgStats(client);
      console.log(`- Total rows: **${stats.total}**`);
      console.log(`- Last 1h: **${stats.last_1h}**`);
      console.log(`- Last 24h: **${stats.last_24h}**`);
      console.log(`- Last created_at: **${stats.last_at}**`);
      if (stats.last_at) {
        const ageH = ((Date.now() - Date.parse(stats.last_at)) / 3_600_000).toFixed(1);
        console.log(`- Age: **${ageH}h ago**`);
      }

      const { rows: adRows } = await client.query(
        "SELECT COUNT(*)::int AS n, MAX(created_at) AS last_at FROM auto_discovered_wallets"
      );
      console.log(`\n- auto_discovered_wallets total: **${adRows[0]?.n}**`);
      console.log(`- auto_discovered_wallets last_at: **${adRows[0]?.last_at || "—"}**`);

      const { rows: walletRow } = await client.query(
        "SELECT wallet_address FROM smart_wallets ORDER BY smart_score DESC NULLS LAST LIMIT 1"
      );
      const testWallet = walletRow[0]?.wallet_address;

      if (!SKIP_POST && envPresent("HELIUS_WEBHOOK_SECRET") && testWallet) {
        console.log("\n## 6. Synthetic POST test\n");
        const before = await pgStats(client);
        const post = await syntheticPost(process.env.HELIUS_WEBHOOK_SECRET, testWallet);
        await new Promise((r) => setTimeout(r, 2000));
        const after = await pgStats(client);

        console.log(`### POST /api/v1/webhooks/helius → HTTP ${post.status}`);
        console.log("```json");
        console.log(JSON.stringify(post.json, null, 2));
        console.log("```");
        console.log(`- smart_wallet_signals before: ${before.total} (last_1h=${before.last_1h})`);
        console.log(`- smart_wallet_signals after:  ${after.total} (last_1h=${after.last_1h})`);
        console.log(`- New row written: **${after.total > before.total ? "YES ✓" : "NO ✗"}**`);
        if (post.status === 401) console.log("\n**⚠ 401 unauthorized — secret mismatch between Railway and test env.**");
        if (post.status === 503) console.log("\n**⚠ 503 — HELIUS_WEBHOOK_SECRET missing on server.**");
      } else {
        console.log("\n## 6. Synthetic POST test\n_skipped (missing secret, wallet, or --skip-post)_\n");
      }
    } finally {
      await client.end();
    }
  }

  console.log("\n## 7. Railway logs note\n");
  console.log(
    "> Cannot query Railway logs from this script. Manual check: Railway → backend service → Logs → filter `POST /api/v1/webhooks/helius` last 72h. Zero hits = Helius not delivering (Route A). 401/500 hits = Route B/C.\n"
  );

  console.log("---\n_End of PROMPT 3.1 diagnostic._\n");
}

main().catch((e) => {
  console.error(e?.stack || e?.message || e);
  process.exit(1);
});
