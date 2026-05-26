"use strict";

/** Process-local Helius Enhanced Transactions API telemetry for /health/ingestion. */

let windowStart = Date.now();
let calls24h = 0;
let errors24h = 0;
let latencySumMs = 0;
let latencySamples = 0;
let lastError = null;

function roll24hWindow() {
  const now = Date.now();
  if (now - windowStart >= 24 * 60 * 60 * 1000) {
    windowStart = now;
    calls24h = 0;
    errors24h = 0;
    latencySumMs = 0;
    latencySamples = 0;
  }
}

function recordHeliusEnhancedCall(meta = {}) {
  roll24hWindow();
  calls24h += 1;
  const ms = Number(meta.latencyMs);
  if (Number.isFinite(ms) && ms >= 0) {
    latencySumMs += ms;
    latencySamples += 1;
  }
  if (meta.error) {
    errors24h += 1;
    lastError = String(meta.error).slice(0, 240);
  }
}

function getHeliusEnhancedTelemetry() {
  roll24hWindow();
  return {
    helius_enhanced_24h_calls: calls24h,
    helius_enhanced_24h_errors: errors24h,
    helius_enhanced_avg_latency_ms:
      latencySamples > 0 ? Math.round(latencySumMs / latencySamples) : null,
    helius_enhanced_last_error: lastError
  };
}

function _resetHeliusEnhancedTelemetry() {
  windowStart = Date.now();
  calls24h = 0;
  errors24h = 0;
  latencySumMs = 0;
  latencySamples = 0;
  lastError = null;
}

module.exports = {
  recordHeliusEnhancedCall,
  getHeliusEnhancedTelemetry,
  _resetHeliusEnhancedTelemetry
};
