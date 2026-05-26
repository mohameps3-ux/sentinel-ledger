"use strict";

const axios = require("axios");
const { heliusApiKey } = require("./heliusWebhookApi");
const { recordHeliusEnhancedCall } = require("./heliusEnhancedTelemetry");

const ENHANCED_BATCH_SIZE = 100;
const ENHANCED_POST_BASE = "https://api.helius.xyz/v0";
const ENHANCED_ADDRESS_BASE = "https://api-mainnet.helius-rpc.com/v0";
const REQUEST_TIMEOUT_MS = 10_000;
const RETRY_BACKOFF_MS = 1_000;
const MAX_CONCURRENT_BATCHES = 2;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function createConcurrencyLimit(max) {
  let active = 0;
  const queue = [];

  const pump = () => {
    while (active < max && queue.length) {
      active += 1;
      const { fn, resolve, reject } = queue.shift();
      Promise.resolve()
        .then(fn)
        .then((value) => {
          active -= 1;
          resolve(value);
          pump();
        })
        .catch((error) => {
          active -= 1;
          reject(error);
          pump();
        });
    }
  };

  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      pump();
    });
}

const limitBatch = createConcurrencyLimit(MAX_CONCURRENT_BATCHES);

async function requestEnhanced(method, url, payload) {
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const started = Date.now();
    try {
      const config = { timeout: REQUEST_TIMEOUT_MS, validateStatus: () => true };
      const response =
        method === "GET"
          ? await axios.get(url, config)
          : await axios.post(url, payload, config);
      const latencyMs = Date.now() - started;
      const { data, status } = response;
      if (status === 200) {
        return { ok: true, data, latencyMs };
      }
      lastError = `http_${status}`;
      if ((status === 429 || status >= 500) && attempt === 0) {
        await sleep(RETRY_BACKOFF_MS);
        continue;
      }
      return { ok: false, data, status, latencyMs, error: lastError };
    } catch (error) {
      lastError = error?.message || "request_failed";
      if (attempt === 0) {
        await sleep(RETRY_BACKOFF_MS);
        continue;
      }
      return { ok: false, latencyMs: Date.now() - started, error: lastError };
    }
  }
  return { ok: false, error: lastError || "request_failed" };
}

/**
 * POST /v0/transactions — parsed enhanced txs for explicit signatures (max 100/batch).
 * @param {string[]} signatures
 * @returns {Promise<any[]>}
 */
async function fetchHeliusEnhancedTransactions(signatures) {
  const key = heliusApiKey();
  if (!key || !Array.isArray(signatures) || !signatures.length) return [];

  const unique = [...new Set(signatures.map((s) => String(s || "").trim()).filter(Boolean))];
  if (!unique.length) return [];

  const batches = chunk(unique, ENHANCED_BATCH_SIZE);
  const batchResults = await Promise.all(
    batches.map((batch) =>
      limitBatch(async () => {
        const url = `${ENHANCED_POST_BASE}/transactions?api-key=${encodeURIComponent(key)}`;
        const result = await requestEnhanced("POST", url, { transactions: batch });
        if (result.ok && Array.isArray(result.data)) {
          recordHeliusEnhancedCall({ latencyMs: result.latencyMs });
          return result.data.filter(Boolean);
        }
        recordHeliusEnhancedCall({
          latencyMs: result.latencyMs,
          error: result.error || `http_${result.status || "unknown"}`
        });
        return [];
      })
    )
  );

  return batchResults.flat();
}

/**
 * GET /v0/addresses/{address}/transactions — wallet history already parsed by Helius.
 * @param {string} walletAddress
 * @param {number} limit
 * @returns {Promise<any[]>}
 */
async function fetchHeliusEnhancedByAddress(walletAddress, limit = 80) {
  const key = heliusApiKey();
  if (!key || !walletAddress) return [];

  const capped = Math.max(1, Math.min(200, Number(limit) || 80));
  const url = `${ENHANCED_ADDRESS_BASE}/addresses/${encodeURIComponent(
    walletAddress
  )}/transactions?api-key=${encodeURIComponent(key)}&limit=${capped}`;

  const result = await requestEnhanced("GET", url);
  if (result.ok && Array.isArray(result.data)) {
    recordHeliusEnhancedCall({ latencyMs: result.latencyMs });
    return result.data.filter(Boolean);
  }
  recordHeliusEnhancedCall({
    latencyMs: result.latencyMs,
    error: result.error || `http_${result.status || "unknown"}`
  });
  return [];
}

module.exports = {
  fetchHeliusEnhancedTransactions,
  fetchHeliusEnhancedByAddress,
  ENHANCED_BATCH_SIZE
};
