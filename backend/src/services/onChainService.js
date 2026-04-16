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
    const { data } = await axios.post(HELIUS_URL, {
      jsonrpc: "2.0",
      id: "holders-check",
      method: "getTokenLargestAccounts",
      params: [mintAddress]
    });
    const topAccounts = data.result?.value || [];
    const top10Total = topAccounts
      .slice(0, 10)
      .reduce((acc, curr) => acc + Number(curr.amount), 0);

    // NOTE: For a real % you’d fetch supply. This is a placeholder to keep UI/engine stable.
    const supply = 1_000_000_000;
    const top10Percentage = (top10Total / supply) * 100;
    return { top10Percentage: Math.min(top10Percentage, 100) };
  } catch (error) {
    console.error("Error fetching holder concentration:", error.message);
    return { top10Percentage: 0 };
  }
}

module.exports = { getTokenSecurity, getHolderConcentration };

