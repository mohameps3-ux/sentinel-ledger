const { getSolanaJsonRpcUrlList, jsonRpcPost } = require("../lib/solanaJsonRpc");

async function fetchWalletTransactions(walletAddress, limit = 100) {
  if (!walletAddress) return [];
  const urls = getSolanaJsonRpcUrlList();
  if (!urls.length) return [];

  const cappedLimit = Math.max(1, Math.min(Number(limit) || 100, 200));
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
  if (!signatures.length || !endpointUsed) return [];

  const txBody = {
    jsonrpc: "2.0",
    id: "smart-wallet-transactions",
    method: "getParsedTransactions",
    params: [signatures, { maxSupportedTransactionVersion: 0, commitment: "finalized" }]
  };
  try {
    const txJson = await jsonRpcPost(endpointUsed, txBody, { timeout: 20_000, retries: 3 });
    const rows = Array.isArray(txJson?.result) ? txJson.result : [];
    return rows.filter(Boolean).slice(0, cappedLimit);
  } catch (_) {
    for (const endpoint of urls) {
      if (endpoint === endpointUsed) continue;
      try {
        const txJson = await jsonRpcPost(endpoint, txBody, { timeout: 20_000, retries: 2 });
        const rows = Array.isArray(txJson?.result) ? txJson.result : [];
        return rows.filter(Boolean).slice(0, cappedLimit);
      } catch {
        /* continue */
      }
    }
  }
  return [];
}

module.exports = { fetchWalletTransactions };
