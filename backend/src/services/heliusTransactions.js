const HELIUS_RPC = "https://mainnet.helius-rpc.com/";

async function fetchWalletTransactions(walletAddress, limit = 100) {
  if (!walletAddress) return [];
  const apiKey = process.env.HELIUS_KEY;
  if (!apiKey) return [];

  const endpoint = `${HELIUS_RPC}?api-key=${apiKey}`;
  const cappedLimit = Math.max(1, Math.min(Number(limit) || 100, 200));
  // Helius enhanced endpoint through JSON-RPC is not always available on every plan,
  // so we use getSignaturesForAddress + getParsedTransactions fallback.
  const sigBody = {
    jsonrpc: "2.0",
    id: "smart-wallet-signatures",
    method: "getSignaturesForAddress",
    params: [walletAddress, { limit: cappedLimit, commitment: "finalized" }]
  };

  const sigRes = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sigBody)
  });
  const sigJson = await sigRes.json();
  const signatures = (sigJson?.result || []).map((s) => s.signature).filter(Boolean);
  if (!signatures.length) return [];

  const txBody = {
    jsonrpc: "2.0",
    id: "smart-wallet-transactions",
    method: "getParsedTransactions",
    params: [signatures, { maxSupportedTransactionVersion: 0, commitment: "finalized" }]
  };
  const txRes = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(txBody)
  });
  const txJson = await txRes.json();
  const rows = Array.isArray(txJson?.result) ? txJson.result : [];
  return rows.filter(Boolean).slice(0, cappedLimit);
}

module.exports = { fetchWalletTransactions };

