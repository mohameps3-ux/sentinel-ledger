const axios = require("axios");

const HELIUS_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_KEY}`;

async function getTokenSecurity(mintAddress) {
  try {
    const { data } = await axios.post(HELIUS_URL, {
      jsonrpc: "2.0",
      id: "security-check",
      method: "getAccountInfo",
      params: [mintAddress, { encoding: "jsonParsed" }]
    });
    const parsedData = data.result?.value?.data?.parsed?.info;
    if (!parsedData) return { mintEnabled: false, freezeEnabled: false };
    return {
      mintEnabled:
        parsedData.mintAuthority !== null &&
        parsedData.mintAuthority !== undefined,
      freezeEnabled:
        parsedData.freezeAuthority !== null &&
        parsedData.freezeAuthority !== undefined
    };
  } catch (error) {
    console.error("Error fetching token security:", error.message);
    return { mintEnabled: false, freezeEnabled: false };
  }
}

async function getHolderConcentration(mintAddress) {
  try {
    const { data: holdersResponse } = await axios.post(HELIUS_URL, {
      jsonrpc: "2.0",
      id: "holders-check",
      method: "getTokenLargestAccounts",
      params: [mintAddress]
    });
    const topAccounts = holdersResponse.result?.value || [];
    const top10TotalUi = topAccounts
      .slice(0, 10)
      .reduce((acc, curr) => acc + Number(curr.uiAmount || 0), 0);

    const { data: supplyResponse } = await axios.post(HELIUS_URL, {
      jsonrpc: "2.0",
      id: "supply-check",
      method: "getTokenSupply",
      params: [mintAddress]
    });

    const supply = Number(supplyResponse.result?.value?.uiAmount || 0);
    const top10Percentage = supply > 0 ? (top10TotalUi / supply) * 100 : 0;

    // Approximate holder count from largest accounts returned by RPC call.
    const totalHolders = topAccounts.length;

    return { top10Percentage: Math.min(top10Percentage, 100), totalHolders };
  } catch (error) {
    console.error("Error fetching holder concentration:", error.message);
    return { top10Percentage: 0, totalHolders: 0 };
  }
}

module.exports = { getTokenSecurity, getHolderConcentration };

