"use strict";

const { getSolanaJsonRpcUrlList, jsonRpcPost } = require("../lib/solanaJsonRpc");
const { markTransactionProcessed, releaseTransactionClaim } = require("../lib/dedupe");
const { getCachedTransaction, setCachedTransaction } = require("../lib/txCache");
const { heliusApiKey } = require("../lib/heliusWebhookApi");
const {
  fetchHeliusEnhancedTransactions,
  fetchHeliusEnhancedByAddress
} = require("../lib/heliusEnhanced");

function deltaFetchingEnabled() {
  return String(process.env.FF_DELTA_FETCHING || "true").trim().toLowerCase() !== "false";
}

// Doubled defaults: 5 -> 10 sigs per delta poll, 100 -> 200 sigs on bootstrap.
// User directive: "doubla Helius" for fresher tracking without bumping other
// subscriptions. Override via env if the running plan is constrained.
function fetchTxLimit() {
  const n = Number(process.env.FETCH_TX_LIMIT ?? 10);
  if (!Number.isFinite(n) || n < 1) return 10;
  return Math.min(50, Math.floor(n));
}

function bootstrapSignatureLimit() {
  const n = Number(process.env.FETCH_WALLET_BOOTSTRAP_SIG_LIMIT ?? 200);
  if (!Number.isFinite(n) || n < 1) return 200;
  return Math.min(400, Math.floor(n));
}

function normalizeOpts(limitOrOpts) {
  if (typeof limitOrOpts === "object" && limitOrOpts !== null && !Array.isArray(limitOrOpts)) {
    return {
      limit: limitOrOpts.limit,
      untilSignature: limitOrOpts.untilSignature || null,
      skipGlobalDedupe: Boolean(limitOrOpts.skipGlobalDedupe)
    };
  }
  return {
    limit: limitOrOpts,
    untilSignature: null,
    skipGlobalDedupe: false
  };
}

async function fetchParsedBatch(endpoint, signatures) {
  if (!signatures.length) return [];
  if (heliusApiKey()) {
    return fetchHeliusEnhancedTransactions(signatures);
  }
  const txBody = {
    jsonrpc: "2.0",
    id: "smart-wallet-transactions",
    method: "getParsedTransactions",
    params: [signatures, { maxSupportedTransactionVersion: 0, commitment: "finalized" }]
  };
  const txJson = await jsonRpcPost(endpoint, txBody, { timeout: 20_000, retries: 3 });
  const rows = Array.isArray(txJson?.result) ? txJson.result : [];
  return rows;
}

/**
 * @param {string} walletAddress
 * @param {number|{limit?:number,untilSignature?:string|null,skipGlobalDedupe?:boolean}} limitOrOpts
 * @returns {Promise<{ transactions: any[], deltaStats: null | { newSignatures: number, cacheHits: number, rpcParsed: number, headSignature?: string | null }, pollOk?: boolean }>}
 */
async function fetchWalletTransactions(walletAddress, limitOrOpts = 100) {
  if (!walletAddress) return { transactions: [], deltaStats: null, pollOk: false };
  const urls = getSolanaJsonRpcUrlList();
  if (!urls.length) return { transactions: [], deltaStats: null, pollOk: false };

  const opts = normalizeOpts(limitOrOpts);
  const untilSig = opts.untilSignature && String(opts.untilSignature).trim() ? String(opts.untilSignature).trim() : null;

  const useDelta = deltaFetchingEnabled() && opts.skipGlobalDedupe === true;

  // Enrichment bootstrap: one Helius Enhanced address call (skip sig list + batch).
  if (useDelta && !untilSig && heliusApiKey()) {
    const cappedLimit = Math.max(1, Math.min(Number(opts.limit) || bootstrapSignatureLimit(), 200));
    const transactions = await fetchHeliusEnhancedByAddress(walletAddress, cappedLimit);
    return {
      transactions: transactions.slice(0, cappedLimit),
      deltaStats: {
        newSignatures: transactions.length,
        cacheHits: 0,
        rpcParsed: transactions.length,
        headSignature: transactions[0]?.signature || null
      },
      pollOk: true
    };
  }

  if (!useDelta) {
    const cappedLimit = Math.max(1, Math.min(Number(opts.limit) || 100, 200));
    const sigBody = {
      jsonrpc: "2.0",
      id: "smart-wallet-signatures",
      method: "getSignaturesForAddress",
      params: [walletAddress, { limit: cappedLimit, commitment: "finalized" }]
    };

    let signatures = [];
    let endpointUsed = null;
    for (const endpoint of urls) {
      try {
        const sigJson = await jsonRpcPost(endpoint, sigBody, { timeout: 12_000, retries: 3 });
        signatures = (sigJson?.result || []).map((s) => s.signature).filter(Boolean);
        if (signatures.length || sigJson?.result) {
          endpointUsed = endpoint;
          break;
        }
      } catch (_) {
        /* try next RPC */
      }
    }
    if (!signatures.length || !endpointUsed) {
      return { transactions: [], deltaStats: null, pollOk: false };
    }

    const claimedSigs = [];
    const freshSignatures = [];
    for (const s of signatures) {
      if (opts.skipGlobalDedupe) {
        freshSignatures.push(s);
        continue;
      }
      const ok = await markTransactionProcessed(s);
      if (ok) {
        freshSignatures.push(s);
        claimedSigs.push(s);
      }
    }
    if (!freshSignatures.length) return { transactions: [], deltaStats: null, pollOk: true };

    const releaseAll = async () => {
      for (const s of claimedSigs) await releaseTransactionClaim(s);
    };

    try {
      const rows = await fetchParsedBatch(endpointUsed, freshSignatures);
      const out = rows.filter(Boolean).slice(0, cappedLimit);
      return { transactions: out, deltaStats: null, pollOk: true };
    } catch (_) {
      for (const endpoint of urls) {
        if (endpoint === endpointUsed) continue;
        try {
          const rows = await fetchParsedBatch(endpoint, freshSignatures);
          const out = rows.filter(Boolean).slice(0, cappedLimit);
          return { transactions: out, deltaStats: null, pollOk: true };
        } catch {
          /* continue */
        }
      }
      await releaseAll();
    }
    return { transactions: [], deltaStats: null, pollOk: true };
  }

  const sigPageLimit = untilSig ? fetchTxLimit() : bootstrapSignatureLimit();
  const sigParams = {
    limit: sigPageLimit,
    commitment: "finalized"
  };
  if (untilSig) {
    sigParams.until = untilSig;
  }

  const sigBody = {
    jsonrpc: "2.0",
    id: "smart-wallet-signatures-delta",
    method: "getSignaturesForAddress",
    params: [walletAddress, sigParams]
  };

  let signatures = [];
  let endpointUsed = null;
  for (const endpoint of urls) {
    try {
      const sigJson = await jsonRpcPost(endpoint, sigBody, { timeout: 12_000, retries: 3 });
      signatures = (sigJson?.result || []).map((s) => s.signature).filter(Boolean);
      if (signatures.length || sigJson?.result !== undefined) {
        endpointUsed = endpoint;
        break;
      }
    } catch (_) {
      /* try next RPC */
    }
  }

  if (!signatures.length || !endpointUsed) {
    return {
      transactions: [],
      deltaStats: { newSignatures: 0, cacheHits: 0, rpcParsed: 0, headSignature: null },
      pollOk: false
    };
  }

  let cacheHits = 0;
  const ordered = signatures;
  const slots = new Array(ordered.length);
  const cacheResults = await Promise.all(ordered.map((sig) => getCachedTransaction(sig)));
  const missing = [];

  for (let i = 0; i < ordered.length; i += 1) {
    const cached = cacheResults[i];
    if (cached) {
      slots[i] = cached;
      cacheHits += 1;
    } else {
      missing.push({ index: i, sig: ordered[i] });
    }
  }

  let rpcParsed = 0;
  if (missing.length) {
    const sigList = missing.map((m) => m.sig);
    let rows = [];
    try {
      rows = await fetchParsedBatch(endpointUsed, sigList);
    } catch (_) {
      for (const endpoint of urls) {
        if (endpoint === endpointUsed) continue;
        try {
          rows = await fetchParsedBatch(endpoint, sigList);
          break;
        } catch {
          /* continue */
        }
      }
    }

    for (let j = 0; j < missing.length; j += 1) {
      const { index, sig } = missing[j];
      const row = Array.isArray(rows) ? rows[j] : null;
      if (row && typeof row === "object") {
        slots[index] = row;
        rpcParsed += 1;
        await setCachedTransaction(sig, row);
      }
    }
  }

  const transactions = slots.filter(Boolean);
  return {
    transactions,
    deltaStats: {
      newSignatures: ordered.length,
      cacheHits,
      rpcParsed,
      headSignature: ordered.length ? ordered[0] : null
    },
    pollOk: true
  };
}

module.exports = { fetchWalletTransactions, deltaFetchingEnabled, fetchTxLimit };
