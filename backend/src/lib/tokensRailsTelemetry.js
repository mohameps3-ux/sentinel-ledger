"use strict";

/** Process-local telemetry for GET /api/v1/tokens/rails (surfaced on /health/ingestion). */

const MAX_SAMPLES = 200;
const latenciesMs = [];
let requestCount24h = 0;
let windowStart = Date.now();
let lastHotCount = 0;
let lastLiveCount = 0;
let lastVelocityCount = 0;
let lastError = null;

function roll24h() {
  const now = Date.now();
  if (now - windowStart >= 24 * 60 * 60 * 1000) {
    requestCount24h = 0;
    windowStart = now;
  }
}

function recordRailsRequest(meta = {}) {
  roll24h();
  requestCount24h += 1;
  const ms = Number(meta.durationMs);
  if (Number.isFinite(ms) && ms >= 0) {
    latenciesMs.push(ms);
    if (latenciesMs.length > MAX_SAMPLES) latenciesMs.shift();
  }
  if (meta.hotCount != null) lastHotCount = Number(meta.hotCount) || 0;
  if (meta.liveCount != null) lastLiveCount = Number(meta.liveCount) || 0;
  if (meta.velocityCount != null) lastVelocityCount = Number(meta.velocityCount) || 0;
  lastError = meta.error ? String(meta.error).slice(0, 240) : null;
}

function p95FromSamples(samples) {
  if (!samples.length) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[Math.max(0, idx)];
}

function getTokensRailsTelemetry() {
  roll24h();
  return {
    rails_endpoint_last_p95_ms: p95FromSamples(latenciesMs),
    rails_endpoint_24h_requests: requestCount24h,
    rails_hot_count: lastHotCount,
    rails_live_count: lastLiveCount,
    rails_velocity_count: lastVelocityCount,
    rails_endpoint_last_error: lastError
  };
}

function _resetTokensRailsTelemetry() {
  latenciesMs.length = 0;
  requestCount24h = 0;
  windowStart = Date.now();
  lastHotCount = 0;
  lastLiveCount = 0;
  lastVelocityCount = 0;
  lastError = null;
}

module.exports = {
  recordRailsRequest,
  getTokensRailsTelemetry,
  _resetTokensRailsTelemetry
};
