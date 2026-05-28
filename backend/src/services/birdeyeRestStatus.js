"use strict";

const CU_OPEN_MS = Math.max(
  60_000,
  Number(process.env.BIRDEYE_REST_CU_OPEN_MS || process.env.MARKETDATA_BIRDEYE_CB_OPEN_MS || 1_800_000)
);

/** @type {{ forceOpen: ((reason: string, opts?: object) => void)|null, isOpen: (() => boolean)|null }} */
const breakerHooks = { forceOpen: null, isOpen: null };

/** @type {{ status: string, reason: string|null, lastAt: number|null, lastSource: string|null, lastStatus: number|null }} */
let restState = {
  status: "operational",
  reason: null,
  lastAt: null,
  lastSource: null,
  lastStatus: null
};

function registerBirdeyeBreakerHooks(hooks) {
  if (typeof hooks?.forceOpen === "function") breakerHooks.forceOpen = hooks.forceOpen;
  if (typeof hooks?.isOpen === "function") breakerHooks.isOpen = hooks.isOpen;
}

function isCuExhausted(status, message) {
  const code = Number(status);
  const msg = String(message || "").toLowerCase();
  if (code === 429) return true;
  if (code === 400 && (msg.includes("compute units") || msg.includes("usage limit exceeded"))) return true;
  return false;
}

function birdeyeResponseMessage(body) {
  if (!body || typeof body !== "object") return "";
  return String(body.message || body.error || body.msg || "");
}

/**
 * Inspect a Birdeye REST response; record CU exhaustion and force-open breaker when applicable.
 * @returns {{ exhausted: boolean, message: string, status: number }}
 */
function inspectBirdeyeRestResponse(status, body, source) {
  const httpStatus = Number(status) || 0;
  const message = birdeyeResponseMessage(body);
  const exhausted = isCuExhausted(httpStatus, message);
  if (exhausted) {
    recordBirdeyeRestFailure({ status: httpStatus, message, source });
  }
  return { exhausted, message, status: httpStatus };
}

function recordBirdeyeRestFailure({ status, message, source }) {
  const msg = String(message || `http_${status || "unknown"}`).slice(0, 240);
  restState = {
    status: "exhausted",
    reason: msg,
    lastAt: Date.now(),
    lastSource: String(source || "unknown").slice(0, 64),
    lastStatus: Number(status) || null
  };
  console.warn(`[birdeye-rest] CU/rate limit (${restState.lastSource}):`, status, msg);
  if (breakerHooks.forceOpen) {
    breakerHooks.forceOpen(msg, { openMs: CU_OPEN_MS });
  }
}

function isBirdeyeRestBlocked() {
  if (restState.status === "exhausted") return true;
  if (breakerHooks.isOpen && breakerHooks.isOpen()) return true;
  return false;
}

function getBirdeyeRestHealth() {
  const breakerOpen = breakerHooks.isOpen ? breakerHooks.isOpen() : false;
  let status = restState.status;
  if (status === "operational" && breakerOpen) {
    status = "degraded";
  }
  return {
    status,
    reason: restState.reason,
    lastAt: restState.lastAt,
    lastSource: restState.lastSource,
    lastStatus: restState.lastStatus,
    circuitOpen: breakerOpen,
    cuOpenMs: CU_OPEN_MS
  };
}

function assertBirdeyeRestOk(status, body, source) {
  const inspected = inspectBirdeyeRestResponse(status, body, source);
  if (inspected.exhausted || inspected.status === 429) {
    const err = new Error(inspected.message || "birdeye_rest_rate_limited");
    err.status = inspected.status;
    err.code = "BIRDEYE_REST_EXHAUSTED";
    throw err;
  }
  if (inspected.status !== 200 || body?.success !== true) {
    const err = new Error(inspected.message || `birdeye_rest_status_${inspected.status || "unknown"}`);
    err.status = inspected.status;
    throw err;
  }
}

module.exports = {
  registerBirdeyeBreakerHooks,
  isCuExhausted,
  inspectBirdeyeRestResponse,
  recordBirdeyeRestFailure,
  isBirdeyeRestBlocked,
  getBirdeyeRestHealth,
  assertBirdeyeRestOk,
  birdeyeResponseMessage
};
