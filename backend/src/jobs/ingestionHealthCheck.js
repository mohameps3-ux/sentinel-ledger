"use strict";

const crypto = require("crypto");
const { getSupabase } = require("../lib/supabase");
const { getOpsPostgresPool } = require("../lib/opsPostgresPool");

const { getHeliusWebhookTelemetry } = require("../lib/heliusWebhookTelemetry");
const { getHeliusWebhookSyncTelemetry } = require("../lib/heliusWebhookSyncTelemetry");
const { getAutoDiscoveryPromotionTelemetry } = require("../lib/autoDiscoveryTelemetry");
const { STALE_ALERT_MS: HELIUS_SYNC_STALE_MS } = require("./heliusWebhookSyncCron");

const AUTO_DISCOVERY_DEAD_ALERT_MS = Math.max(
  60 * 60 * 1000,
  Number(process.env.AUTO_DISCOVERY_DEAD_ALERT_MS || 72 * 60 * 60 * 1000)
);
const AUTO_DISCOVERY_DEAD_ALERT_ENABLED =
  String(process.env.AUTO_DISCOVERY_DEAD_ALERT_ENABLED || "false").toLowerCase() === "true";

const TICK_MS = Math.max(5 * 60 * 1000, Number(process.env.INGESTION_HEALTH_CHECK_MS || 60 * 60 * 1000));
const HELIUS_SILENT_MINUTES = Math.max(30, Number(process.env.INGESTION_HELIUS_SILENT_MINUTES || 120));
const DISCOVERY_STALL_HOURS = Math.max(1, Number(process.env.INGESTION_DISCOVERY_STALL_HOURS || 6));
const WALLET_TOKENS_ERROR_ALERT_THRESHOLD = Math.max(
  1,
  Number(process.env.INGESTION_WALLET_TOKENS_ERROR_ALERT_THRESHOLD || 100)
);
const WALLET_TOKENS_STALE_MS = Math.max(
  60 * 60 * 1000,
  Number(process.env.INGESTION_WALLET_TOKENS_STALE_MS || 2 * 60 * 60 * 1000)
);

let intervalRef = null;
let lastHeliusAlertAt = 0;
let lastDiscoveryAlertAt = 0;
let lastWalletTokensAlertAt = 0;
let lastHeliusSyncAlertAt = 0;
let lastAutoDiscoveryDeadAlertAt = 0;

function sortedStringify(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(sortedStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => JSON.stringify(k) + ":" + sortedStringify(value[k])).join(",")}}`;
}

function signInboundAlert(secret, body) {
  const source = String(body?.source || "");
  const severity = String(body?.severity || "");
  const event = String(body?.event || "");
  const metadata = body?.metadata && typeof body.metadata === "object" ? body.metadata : {};
  const payload = `${source}|${severity}|${event}|${sortedStringify(metadata)}`;
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

async function postOpsAlert(event, metadata, severity = "warning") {
  const secret = String(process.env.OPS_ALERT_INBOUND_SECRET || process.env.OMNI_BOT_OPS_KEY || "").trim();
  const base = String(process.env.BACKEND_URL || "http://127.0.0.1:3001").replace(/\/+$/, "");
  if (!secret) {
    console.warn("[ingestion-health] skip alert (no OPS_ALERT_INBOUND_SECRET):", event, metadata);
    return { ok: false, reason: "no_secret" };
  }
  const body = {
    source: "ingestion_health_check",
    severity,
    event,
    metadata
  };
  body.signature = `sha256=${signInboundAlert(secret, body)}`;
  try {
    const res = await fetch(`${base}/api/v1/ops/alerts/inbound`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-ops-key": secret },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000)
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, reason: e?.message || String(e) };
  }
}

async function insertOpsAlertDirect(event, metadata, severity = "warning") {
  try {
    const pool = getOpsPostgresPool();
    if (!pool) return false;
    await pool.query(
      `INSERT INTO public.ops_alerts (source, severity, event, metadata, action_taken)
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
      ["ingestion_health_check", severity, event, JSON.stringify(metadata || {}), "logged"]
    );
    return true;
  } catch {
    return false;
  }
}

async function queryLastSignalAgeMinutes() {
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("smart_wallet_signals")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data?.created_at) return null;
    return Math.max(0, (Date.now() - Date.parse(data.created_at)) / 60_000);
  } catch {
    return null;
  }
}

async function queryDiscoveryAgeHours() {
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("auto_discovered_wallets")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return null;
    if (!data?.created_at) return Infinity;
    return Math.max(0, (Date.now() - Date.parse(data.created_at)) / 3_600_000);
  } catch {
    return null;
  }
}

async function runIngestionHealthCheckTick() {
  const now = Date.now();
  const signalAgeMin = await queryLastSignalAgeMinutes();
  if (signalAgeMin != null && signalAgeMin >= HELIUS_SILENT_MINUTES && now - lastHeliusAlertAt > TICK_MS) {
    lastHeliusAlertAt = now;
    const metadata = { last_seen_minutes_ago: Math.round(signalAgeMin), threshold_minutes: HELIUS_SILENT_MINUTES };
    await insertOpsAlertDirect("helius_webhook_silent", metadata);
    await postOpsAlert("helius_webhook_silent", metadata);
    console.warn("[ingestion-health] helius_webhook_silent", metadata);
  }

  const discoveryAgeH = await queryDiscoveryAgeHours();
  if (
    discoveryAgeH != null &&
    discoveryAgeH >= DISCOVERY_STALL_HOURS &&
    now - lastDiscoveryAlertAt > TICK_MS
  ) {
    lastDiscoveryAlertAt = now;
    const metadata = {
      last_seen_hours_ago: discoveryAgeH === Infinity ? null : Number(discoveryAgeH.toFixed(2)),
      threshold_hours: DISCOVERY_STALL_HOURS,
      note: discoveryAgeH === Infinity ? "no rows ever" : undefined
    };
    await insertOpsAlertDirect("auto_discovery_stalled", metadata);
    await postOpsAlert("auto_discovery_stalled", metadata);
    console.warn("[ingestion-health] auto_discovery_stalled", metadata);
  }

  const wt = getHeliusWebhookTelemetry();
  const wtErrors = Number(wt.wallet_tokens_24h_errors) || 0;
  const wtLastWriteIso = wt.wallet_tokens_last_write_at;
  const wtLastWriteMs = wtLastWriteIso ? Date.parse(wtLastWriteIso) : NaN;
  const wtStale =
    !Number.isFinite(wtLastWriteMs) || Date.now() - wtLastWriteMs > WALLET_TOKENS_STALE_MS;
  if (
    (wtErrors > WALLET_TOKENS_ERROR_ALERT_THRESHOLD || wtStale) &&
    now - lastWalletTokensAlertAt > TICK_MS
  ) {
    lastWalletTokensAlertAt = now;
    const metadata = {
      wallet_tokens_24h_errors: wtErrors,
      wallet_tokens_24h_timeouts: Number(wt.wallet_tokens_24h_timeouts) || 0,
      wallet_tokens_24h_writes: Number(wt.wallet_tokens_24h_writes) || 0,
      wallet_tokens_last_write_at: wtLastWriteIso,
      wallet_tokens_last_error: wt.wallet_tokens_last_error,
      wallet_tokens_last_error_code: wt.wallet_tokens_last_error_code,
      stale_threshold_ms: WALLET_TOKENS_STALE_MS,
      error_threshold: WALLET_TOKENS_ERROR_ALERT_THRESHOLD
    };
    await insertOpsAlertDirect("wallet_tokens_silent_failures", metadata);
    await postOpsAlert("wallet_tokens_silent_failures", metadata);
    console.warn("[ingestion-health] wallet_tokens_silent_failures", metadata);
  }

  const hs = getHeliusWebhookSyncTelemetry();
  const hsLastRunIso = hs.helius_sync_last_run_at;
  const hsLastRunMs = hsLastRunIso ? Date.parse(hsLastRunIso) : NaN;
  const hsStale = !Number.isFinite(hsLastRunMs) || Date.now() - hsLastRunMs > HELIUS_SYNC_STALE_MS;
  if (hsStale && now - lastHeliusSyncAlertAt > TICK_MS) {
    lastHeliusSyncAlertAt = now;
    const metadata = {
      helius_sync_last_run_at: hsLastRunIso,
      helius_sync_last_address_count: Number(hs.helius_sync_last_address_count) || 0,
      helius_sync_last_error: hs.helius_sync_last_error,
      stale_threshold_ms: HELIUS_SYNC_STALE_MS
    };
    await insertOpsAlertDirect("helius_sync_stale", metadata);
    await postOpsAlert("helius_sync_stale", metadata);
    console.warn("[ingestion-health] helius_sync_stale", metadata);
  }

  if (AUTO_DISCOVERY_DEAD_ALERT_ENABLED) {
    const ad = getAutoDiscoveryPromotionTelemetry();
    const lastPromoIso = ad.auto_discovery_last_promotion_at;
    const lastPromoMs = lastPromoIso ? Date.parse(lastPromoIso) : NaN;
    const promoStale =
      !Number.isFinite(lastPromoMs) || Date.now() - lastPromoMs > AUTO_DISCOVERY_DEAD_ALERT_MS;
    if (promoStale && now - lastAutoDiscoveryDeadAlertAt > TICK_MS) {
      lastAutoDiscoveryDeadAlertAt = now;
      const metadata = {
        auto_discovery_last_promotion_at: lastPromoIso,
        auto_discovery_24h_promoted: Number(ad.auto_discovery_24h_promoted) || 0,
        auto_discovery_24h_rejection_reasons: ad.auto_discovery_24h_rejection_reasons,
        stale_threshold_ms: AUTO_DISCOVERY_DEAD_ALERT_MS
      };
      await insertOpsAlertDirect("auto_discovery_dead", metadata);
      await postOpsAlert("auto_discovery_dead", metadata);
      console.warn("[ingestion-health] auto_discovery_dead", metadata);
    }
  }

  return {
    signalAgeMin,
    discoveryAgeH,
    walletTokensErrors24h: wtErrors,
    walletTokensStale: wtStale,
    heliusSyncStale: hsStale
  };
}

function startIngestionHealthCheckCron() {
  if (intervalRef) return;
  if (String(process.env.INGESTION_HEALTH_CHECK_ENABLED || "true").toLowerCase() === "false") {
    console.log("[ingestion-health] cron disabled");
    return;
  }
  runIngestionHealthCheckTick().catch((e) =>
    console.warn("[ingestion-health] initial tick:", e?.message || e)
  );
  intervalRef = setInterval(() => {
    runIngestionHealthCheckTick().catch((e) =>
      console.warn("[ingestion-health] tick:", e?.message || e)
    );
  }, TICK_MS);
  if (typeof intervalRef.unref === "function") intervalRef.unref();
}

function getIngestionHealthCheckStatus() {
  return {
    enabled: String(process.env.INGESTION_HEALTH_CHECK_ENABLED || "true").toLowerCase() !== "false",
    tickMs: TICK_MS,
    heliusSilentMinutes: HELIUS_SILENT_MINUTES,
    discoveryStallHours: DISCOVERY_STALL_HOURS,
    walletTokensErrorAlertThreshold: WALLET_TOKENS_ERROR_ALERT_THRESHOLD,
    walletTokensStaleMs: WALLET_TOKENS_STALE_MS,
    heliusSyncStaleMs: HELIUS_SYNC_STALE_MS,
    autoDiscoveryDeadAlertEnabled: AUTO_DISCOVERY_DEAD_ALERT_ENABLED,
    autoDiscoveryDeadAlertMs: AUTO_DISCOVERY_DEAD_ALERT_MS
  };
}

module.exports = {
  startIngestionHealthCheckCron,
  runIngestionHealthCheckTick,
  getIngestionHealthCheckStatus
};
