"use strict";

/** Process-local Helius webhook telemetry for /health/ingestion. */

let lastReceivedAt = null;
let lastSignalsWritten = 0;
let lastWalletsInPayload = 0;
let lastError = null;
let count24h = 0;
let count24hWindowStart = Date.now();

function roll24hWindow() {
  const now = Date.now();
  if (now - count24hWindowStart >= 24 * 60 * 60 * 1000) {
    count24h = 0;
    count24hWindowStart = now;
  }
}

function recordHeliusWebhookReceipt(meta = {}) {
  roll24hWindow();
  lastReceivedAt = Date.now();
  count24h += 1;
  lastWalletsInPayload = Number(meta.walletsInPayload || meta.events || 0);
  lastSignalsWritten = Number(meta.signalsWritten || 0);
  lastError = meta.error ? String(meta.error).slice(0, 240) : null;
}

function getHeliusWebhookTelemetry() {
  roll24hWindow();
  const now = Date.now();
  return {
    helius_webhook_last_received_at: lastReceivedAt ? new Date(lastReceivedAt).toISOString() : null,
    helius_webhook_last_received_age_ms: lastReceivedAt ? now - lastReceivedAt : null,
    helius_webhook_24h_count: count24h,
    helius_webhook_last_signals_written: lastSignalsWritten,
    helius_webhook_last_wallets_in_payload: lastWalletsInPayload,
    helius_webhook_last_error: lastError
  };
}

function _resetHeliusWebhookTelemetry() {
  lastReceivedAt = null;
  lastSignalsWritten = 0;
  lastWalletsInPayload = 0;
  lastError = null;
  count24h = 0;
  count24hWindowStart = Date.now();
}

module.exports = {
  recordHeliusWebhookReceipt,
  getHeliusWebhookTelemetry,
  _resetHeliusWebhookTelemetry
};
