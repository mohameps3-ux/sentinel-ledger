/**
 * Read-only smoke checks after Railway deploy + Supabase migration.
 * - Never prints OMNI_BOT_OPS_KEY or any secret (only HTTP status + safe JSON keys).
 * - Loads backend/.env when present (do not commit .env).
 *
 * Env:
 *   SMOKE_API_BASE_URL   — default http://127.0.0.1:3000 (use https://… for prod)
 *   SMOKE_STRICT_HEALTH  — if "true", require GET /health === 200 (prod hard gate)
 *   SMOKE_REQUIRE_HTTPS   — if "true", fail when base URL is http:// and host is not localhost/127.0.0.1/::1
 *   SMOKE_REQUIRE_OPS_KEY — if "true", fail when OMNI_BOT_OPS_KEY is missing (CI / prod gate)
 *   OMNI_BOT_OPS_KEY      — required for outcomes check: GET …/wallet-coordination/outcomes; fails if degraded (012/013/Supabase)
 *
 * Usage:
 *   node backend/scripts/smokePostDeployReadiness.js
 *   SMOKE_API_BASE_URL=https://api.example.com SMOKE_STRICT_HEALTH=true node backend/scripts/smokePostDeployReadiness.js
 */
"use strict";

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const base = String(process.env.SMOKE_API_BASE_URL || process.env.PUBLIC_API_URL || "http://127.0.0.1:3000").replace(
  /\/$/,
  ""
);
const strictHealth = String(process.env.SMOKE_STRICT_HEALTH || "").toLowerCase() === "true";
const requireHttps = String(process.env.SMOKE_REQUIRE_HTTPS || "").toLowerCase() === "true";
const requireOpsKey = String(process.env.SMOKE_REQUIRE_OPS_KEY || "").toLowerCase() === "true";
const opsKey = String(process.env.OMNI_BOT_OPS_KEY || "").trim();

const TIMEOUT_MS = 12_000;

async function fetchJson(url, init = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { _parseError: true, _snippet: text.slice(0, 120) };
    }
    return { res, json };
  } finally {
    clearTimeout(t);
  }
}

function fail(msg) {
  console.error("[smoke] FAIL:", msg);
  process.exit(1);
}

function warn(msg) {
  console.warn("[smoke] WARN:", msg);
}

function assertHttpsIfRequired() {
  let u;
  try {
    u = new URL(base);
  } catch {
    fail("SMOKE_API_BASE_URL is not a valid URL");
  }
  if (!requireHttps) return;
  const host = (u.hostname || "").toLowerCase();
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (u.protocol === "http:" && !local) {
    fail("SMOKE_REQUIRE_HTTPS: use https:// for non-local SMOKE_API_BASE_URL");
  }
}

async function main() {
  assertHttpsIfRequired();
  if (requireOpsKey && !opsKey) {
    fail("SMOKE_REQUIRE_OPS_KEY=true but OMNI_BOT_OPS_KEY is empty — set in backend/.env or CI secrets (never commit)");
  }
  console.log("[smoke] base:", base);
  if (strictHealth) console.log("[smoke] SMOKE_STRICT_HEALTH=true (GET /health must be 200)");
  if (requireHttps) console.log("[smoke] SMOKE_REQUIRE_HTTPS=true (non-loopback must use https://)");

  const live = await fetchJson(`${base}/health/live`);
  if (live.res.status !== 200) fail(`/health/live status ${live.res.status}`);
  if (!live.json || live.json.ok !== true) fail("/health/live body.ok !== true");

  const health = await fetchJson(`${base}/health`);
  if (strictHealth && health.res.status !== 200) {
    fail(`/health expected 200 (SMOKE_STRICT_HEALTH), got ${health.res.status}`);
  }
  if (!health.json || typeof health.json.coordinationOutcomes !== "object") {
    fail("/health missing coordinationOutcomes object (backend too old?)");
  }
  if (health.res.status === 503) {
    warn(`/health returned 503 (missingCriticalSecrets: ${JSON.stringify(health.json.missingCriticalSecrets || [])})`);
  }

  if (opsKey) {
    const out = await fetchJson(`${base}/api/v1/ops/wallet-coordination/outcomes?limit=3`, {
      headers: { "x-ops-key": opsKey }
    });
    if (out.res.status === 401) fail("/ops/wallet-coordination/outcomes unauthorized (wrong x-ops-key?)");
    if (out.res.status === 503 && out.json?.error === "ops_key_not_configured") {
      warn("server reports ops_key_not_configured (OMNI_BOT_OPS_KEY unset on host)");
    } else if (out.res.status !== 200) {
      fail(`/ops/wallet-coordination/outcomes status ${out.res.status}`);
    }
    if (!out.json || out.json.ok !== true) fail("outcomes body.ok !== true");
    if (out.json.degraded) {
      fail(
        `outcomes degraded=true (${out.json.reason || "unknown"}) — check migrations 012/013 on the Supabase project backing this API`
      );
    }
    console.log("[smoke] outcomes: ok, rows:", Array.isArray(out.json.data) ? out.json.data.length : "?");
  } else {
    warn("OMNI_BOT_OPS_KEY unset — skipping ops outcomes (use SMOKE_REQUIRE_OPS_KEY=true in CI to enforce)");
  }

  console.log("[smoke] OK: live + health contract; ops outcomes verified when OMNI_BOT_OPS_KEY is set.");
}

main().catch((e) => fail(e?.message || String(e)));
