const axios = require("axios");
const { clusterApiUrl } = require("@solana/web3.js");

/**
 * Ordered JSON-RPC HTTP endpoints for Solana mainnet.
 * Put dedicated / paid RPCs first via SOLANA_RPC_URLS (comma) or SOLANA_RPC_URL.
 */
function getSolanaJsonRpcUrlList() {
  const urls = [];
  const extra = process.env.SOLANA_RPC_URLS;
  if (typeof extra === "string" && extra.trim()) {
    for (const part of extra.split(",")) {
      const u = part.trim().replace(/\/+$/, "");
      if (u && !urls.includes(u)) urls.push(u);
    }
  }
  const single = process.env.SOLANA_RPC_URL;
  if (typeof single === "string" && single.trim()) {
    const u = single.trim().replace(/\/+$/, "");
    if (u && !urls.includes(u)) urls.push(u);
  }
  if (process.env.HELIUS_KEY) {
    const h = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_KEY}`;
    if (!urls.includes(h)) urls.push(h);
  }
  const fallback = clusterApiUrl("mainnet-beta");
  if (!urls.includes(fallback)) urls.push(fallback);
  return urls;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRateLimited(status, data) {
  if (status === 429) return true;
  const code = data?.error?.code;
  if (code === -32005 || code === 429) return true;
  const msg = String(data?.error?.message || "").toLowerCase();
  return msg.includes("429") || msg.includes("too many requests") || msg.includes("rate limit");
}

/**
 * POST JSON-RPC body to a single URL with retry/backoff on rate limits.
 */
async function jsonRpcPost(url, body, options = {}) {
  const timeout = Number(options.timeout || 8000);
  const retries = Number(options.retries || 4);
  let lastErr = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const { data, status } = await axios.post(url, body, {
        timeout,
        validateStatus: () => true
      });
      if (isRateLimited(status, data)) {
        lastErr = new Error(`rpc_rate_limited:${status}`);
        await sleep(Math.min(10_000, 350 * 2 ** attempt));
        continue;
      }
      if (data?.error) {
        throw new Error(data.error.message || "rpc_error");
      }
      return data;
    } catch (e) {
      lastErr = e;
      const msg = String(e.message || e);
      if (attempt < retries - 1 && /429|rate|ECONNRESET|ETIMEDOUT|timeout/i.test(msg)) {
        await sleep(Math.min(10_000, 350 * 2 ** attempt));
        continue;
      }
    }
  }
  throw lastErr || new Error("json_rpc_post_failed");
}

module.exports = { getSolanaJsonRpcUrlList, jsonRpcPost };
