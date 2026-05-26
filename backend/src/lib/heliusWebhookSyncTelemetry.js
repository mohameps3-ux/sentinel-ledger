"use strict";

/** Process-local Helius webhook account sync telemetry for /health/ingestion. */

let lastRunAt = null;
let lastAddressCount = 0;
let lastError = null;
let lastWebhookId = null;

function recordHeliusSyncSuccess(meta = {}) {
  lastRunAt = Date.now();
  lastAddressCount = Number(meta.addressCount) || 0;
  lastError = null;
  lastWebhookId = meta.webhookId != null ? String(meta.webhookId) : lastWebhookId;
}

function recordHeliusSyncError(err) {
  lastRunAt = Date.now();
  lastError = err?.message ? String(err.message).slice(0, 240) : String(err || "sync_failed").slice(0, 240);
}

function getHeliusWebhookSyncTelemetry() {
  return {
    helius_sync_last_run_at: lastRunAt ? new Date(lastRunAt).toISOString() : null,
    helius_sync_last_address_count: lastAddressCount,
    helius_sync_last_error: lastError,
    helius_sync_last_webhook_id: lastWebhookId
  };
}

function _resetHeliusWebhookSyncTelemetry() {
  lastRunAt = null;
  lastAddressCount = 0;
  lastError = null;
  lastWebhookId = null;
}

module.exports = {
  recordHeliusSyncSuccess,
  recordHeliusSyncError,
  getHeliusWebhookSyncTelemetry,
  _resetHeliusWebhookSyncTelemetry
};
