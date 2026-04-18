const axios = require("axios");
const { getSolanaJsonRpcUrlList, jsonRpcPost } = require("../lib/solanaJsonRpc");

async function getTokenSecurity(mintAddress) {
  for (const rpcUrl of getSolanaJsonRpcUrlList()) {
    try {
      const data = await jsonRpcPost(rpcUrl, {
        jsonrpc: "2.0",
        id: "security-check",
        method: "getAccountInfo",
        params: [mintAddress, { encoding: "jsonParsed" }]
      });
      const parsedData = data.result?.value?.data?.parsed?.info;
      if (!parsedData) continue;
      return {
        mintEnabled:
          parsedData.mintAuthority !== null &&
          parsedData.mintAuthority !== undefined,
        freezeEnabled:
          parsedData.freezeAuthority !== null &&
          parsedData.freezeAuthority !== undefined
      };
    } catch (error) {
      console.error(`Token security RPC error (${rpcUrl}):`, error.message);
    }
  }
  return { mintEnabled: false, freezeEnabled: false };
}

async function fetchBirdeyeHolderCount(mintAddress) {
  const key = process.env.BIRDEYE_API_KEY;
  if (!key || !mintAddress) return null;
  try {
    const { data } = await axios.get("https://public-api.birdeye.so/defi/token_overview", {
      params: { address: mintAddress },
      headers: { "X-API-KEY": key, "x-chain": "solana", accept: "application/json" },
      timeout: 6000
    });
    const raw =
      data?.data?.holder ??
      data?.data?.holders ??
      data?.data?.uniqueWallet24h ??
      data?.data?.numberMarkets;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  } catch (e) {
    console.warn("Birdeye holder count:", e.message);
    return null;
  }
}

async function getHolderConcentration(mintAddress) {
  const birdeyeHolders = await fetchBirdeyeHolderCount(mintAddress);

  for (const rpcUrl of getSolanaJsonRpcUrlList()) {
    try {
      const holdersResponse = await jsonRpcPost(rpcUrl, {
        jsonrpc: "2.0",
        id: "holders-check",
        method: "getTokenLargestAccounts",
        params: [mintAddress]
      });
      const topAccounts = holdersResponse.result?.value || [];
      const top10TotalUi = topAccounts
        .slice(0, 10)
        .reduce((acc, curr) => acc + Number(curr.uiAmount || 0), 0);

      const supplyResponse = await jsonRpcPost(rpcUrl, {
        jsonrpc: "2.0",
        id: "supply-check",
        method: "getTokenSupply",
        params: [mintAddress]
      });

      const supply = Number(supplyResponse.result?.value?.uiAmount || 0);
      if (supply <= 0 && topAccounts.length === 0) continue;
      const top10Percentage = supply > 0 ? (top10TotalUi / supply) * 100 : 0;

      const totalHolders = birdeyeHolders != null ? birdeyeHolders : 0;
      const holderCountSource = birdeyeHolders != null ? "birdeye" : null;
      const largestAccountsSampled = topAccounts.length;

      return {
        top10Percentage: Math.min(top10Percentage, 100),
        totalHolders,
        holderCountSource,
        largestAccountsSampled
      };
    } catch (error) {
      console.error(`Holders RPC error (${rpcUrl}):`, error.message);
    }
  }
  return {
    top10Percentage: 0,
    totalHolders: birdeyeHolders || 0,
    holderCountSource: birdeyeHolders != null ? "birdeye" : null,
    largestAccountsSampled: 0
  };
}

/**
 * Largest SPL token accounts for a mint, resolved to owner wallets with % of supply.
 */
async function getLargestTokenAccountOwners(mintAddress, limit = 18) {
  for (const rpcUrl of getSolanaJsonRpcUrlList()) {
    try {
      const holdersResponse = await jsonRpcPost(rpcUrl, {
        jsonrpc: "2.0",
        id: "largest-accounts",
        method: "getTokenLargestAccounts",
        params: [mintAddress]
      });
      const topAccounts = holdersResponse.result?.value || [];
      const sliced = topAccounts.slice(0, limit);

      const supplyResponse = await jsonRpcPost(rpcUrl, {
        jsonrpc: "2.0",
        id: "supply",
        method: "getTokenSupply",
        params: [mintAddress]
      });
      const supply = Number(supplyResponse.result?.value?.uiAmount || 0);

      const owners = [];
      const chunkSize = 10;
      for (let i = 0; i < sliced.length; i += chunkSize) {
        const chunk = sliced.slice(i, i + chunkSize);
        const keys = chunk.map((c) => c.address);
        const multi = await jsonRpcPost(rpcUrl, {
          jsonrpc: "2.0",
          id: "multi-parsed",
          method: "getMultipleAccounts",
          params: [keys, { encoding: "jsonParsed" }]
        });
        const arr = multi.result?.value || [];
        for (let j = 0; j < chunk.length; j++) {
          const row = chunk[j];
          const acc = arr[j];
          if (!acc) continue;
          const uiAmount = Number(row.uiAmount || 0);
          const parsed = acc?.data?.parsed?.info;
          const owner = parsed?.owner;
          if (!owner || typeof owner !== "string") continue;
          const pctSupply = supply > 0 ? (uiAmount / supply) * 100 : 0;
          owners.push({
            owner,
            tokenAccount: row.address,
            uiAmount,
            pctSupply
          });
        }
      }
      return { owners, supply };
    } catch (error) {
      console.error(`Largest token owners RPC error (${rpcUrl}):`, error.message);
    }
  }
  return { owners: [], supply: 0 };
}

module.exports = {
  getTokenSecurity,
  getHolderConcentration,
  getLargestTokenAccountOwners
};

