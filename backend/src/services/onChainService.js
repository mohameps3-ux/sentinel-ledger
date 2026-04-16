const axios = require("axios");
const { clusterApiUrl } = require("@solana/web3.js");

function getRpcUrls() {
  const urls = [];
  if (process.env.HELIUS_KEY) {
    urls.push(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_KEY}`);
  }
  urls.push(clusterApiUrl("mainnet-beta"));
  return [...new Set(urls)];
}

async function rpcPost(url, payload) {
  const { data } = await axios.post(url, payload, { timeout: 8000 });
  if (data?.error) throw new Error(data.error.message || "rpc_error");
  return data;
}

async function getTokenSecurity(mintAddress) {
  for (const rpcUrl of getRpcUrls()) {
    try {
      const data = await rpcPost(rpcUrl, {
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

async function getHolderConcentration(mintAddress) {
  for (const rpcUrl of getRpcUrls()) {
    try {
      const holdersResponse = await rpcPost(rpcUrl, {
        jsonrpc: "2.0",
        id: "holders-check",
        method: "getTokenLargestAccounts",
        params: [mintAddress]
      });
      const topAccounts = holdersResponse.result?.value || [];
      const top10TotalUi = topAccounts
        .slice(0, 10)
        .reduce((acc, curr) => acc + Number(curr.uiAmount || 0), 0);

      const supplyResponse = await rpcPost(rpcUrl, {
        jsonrpc: "2.0",
        id: "supply-check",
        method: "getTokenSupply",
        params: [mintAddress]
      });

      const supply = Number(supplyResponse.result?.value?.uiAmount || 0);
      if (supply <= 0 && topAccounts.length === 0) continue;
      const top10Percentage = supply > 0 ? (top10TotalUi / supply) * 100 : 0;

      // Approximate holder count from largest accounts returned by RPC call.
      const totalHolders = topAccounts.length;

      return { top10Percentage: Math.min(top10Percentage, 100), totalHolders };
    } catch (error) {
      console.error(`Holders RPC error (${rpcUrl}):`, error.message);
    }
  }
  return { top10Percentage: 0, totalHolders: 0 };
}

/**
 * Largest SPL token accounts for a mint, resolved to owner wallets with % of supply.
 */
async function getLargestTokenAccountOwners(mintAddress, limit = 18) {
  for (const rpcUrl of getRpcUrls()) {
    try {
      const holdersResponse = await rpcPost(rpcUrl, {
        jsonrpc: "2.0",
        id: "largest-accounts",
        method: "getTokenLargestAccounts",
        params: [mintAddress]
      });
      const topAccounts = holdersResponse.result?.value || [];
      const sliced = topAccounts.slice(0, limit);

      const supplyResponse = await rpcPost(rpcUrl, {
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
        const multi = await rpcPost(rpcUrl, {
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

