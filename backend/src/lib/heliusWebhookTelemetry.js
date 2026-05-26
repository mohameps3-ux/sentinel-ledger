"use strict";

/** Process-local Helius webhook telemetry for /health/ingestion. */

let lastReceivedAt = null;
let lastSignalsWritten = 0;
let lastWalletsInPayload = 0;
let lastError = null;
let count24h = 0;
let count24hWindowStart = Date.now();

let walletTokensWrites24h = 0;
let walletTokensInsertsNew24h = 0;
let walletTokensConflicts24h = 0;
let walletTokensErrors24h = 0;
let walletTokensTimeouts24h = 0;
let walletTokensLastWriteAt = null;
let walletTokensLastError = null;
let walletTokensLastErrorCode = null;

function roll24hWindow() {
  const now = Date.now();
  if (now - count24hWindowStart >= 24 * 60 * 60 * 1000) {
    count24h = 0;
    count24hWindowStart = now;
    walletTokensWrites24h = 0;
    walletTokensInsertsNew24h = 0;
    walletTokensConflicts24h = 0;
    walletTokensErrors24h = 0;
    walletTokensTimeouts24h = 0;
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

function walletTokensWrittenInc() {
  roll24hWindow();
  walletTokensWrites24h += 1;
  walletTokensLastWriteAt = Date.now();
}

function walletTokensInsertNewInc() {
  roll24hWindow();
  walletTokensInsertsNew24h += 1;
}

function walletTokensConflictInc() {
  roll24hWindow();
  walletTokensConflicts24h += 1;
}

function isStatementTimeout(code, message) {
  if (code === "57014") return true;
  const m = String(message || "").toLowerCase();
  return m.includes("statement timeout") || m.includes("canceling statement");
}

function walletTokensErrorInc(meta = {}) {
  roll24hWindow();
  walletTokensErrors24h += 1;
  const code = meta.code != null ? String(meta.code) : null;
  const message = meta.message ? String(meta.message).slice(0, 200) : null;
  walletTokensLastErrorCode = code;
  walletTokensLastError = message;
  if (isStatementTimeout(code, message)) {
    walletTokensTimeouts24h += 1;
  }
}

function walletTokensTimeoutInc() {
  roll24hWindow();
  walletTokensTimeouts24h += 1;
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
    helius_webhook_last_error: lastError,
    wallet_tokens_24h_writes: walletTokensWrites24h,
    wallet_tokens_24h_inserts_new: walletTokensInsertsNew24h,
    wallet_tokens_24h_conflicts: walletTokensConflicts24h,
    wallet_tokens_24h_errors: walletTokensErrors24h,
    wallet_tokens_24h_timeouts: walletTokensTimeouts24h,
    wallet_tokens_last_write_at: walletTokensLastWriteAt
      ? new Date(walletTokensLastWriteAt).toISOString()
      : null,
    wallet_tokens_last_error: walletTokensLastError,
    wallet_tokens_last_error_code: walletTokensLastErrorCode
  };
}

function _resetHeliusWebhookTelemetry() {
  lastReceivedAt = null;
  lastSignalsWritten = 0;
  lastWalletsInPayload = 0;
  lastError = null;
  count24h = 0;
  count24hWindowStart = Date.now();
  walletTokensWrites24h = 0;
  walletTokensInsertsNew24h = 0;
  walletTokensConflicts24h = 0;
  walletTokensErrors24h = 0;
  walletTokensTimeouts24h = 0;
  walletTokensLastWriteAt = null;
  walletTokensLastError = null;
  walletTokensLastErrorCode = null;
}

module.exports = {
  recordHeliusWebhookReceipt,
  getHeliusWebhookTelemetry,
  walletTokensWrittenInc,
  walletTokensInsertNewInc,
  walletTokensConflictInc,
  walletTokensErrorInc,
  walletTokensTimeoutInc,
  _resetHeliusWebhookTelemetry
};
