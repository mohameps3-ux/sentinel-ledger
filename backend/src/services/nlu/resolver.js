const axios = require("axios");
const { TOKEN_ALIASES } = require("./constants");
const { cleanToken, isLikelyMint } = require("./utils");

async function resolveTokenToMint(tokenRaw) {
  const token = String(tokenRaw || "").trim();
  if (!token) return null;
  if (isLikelyMint(token)) return token;

  const symbol = cleanToken(token);
  if (TOKEN_ALIASES[symbol]) return TOKEN_ALIASES[symbol];

  try {
    const { data } = await axios.get("https://api.dexscreener.com/latest/dex/search", {
      timeout: 5000,
      params: { q: symbol }
    });
    const pairs = Array.isArray(data?.pairs) ? data.pairs : [];
    const hit = pairs
      .filter((p) => String(p?.chainId || "").toLowerCase() === "solana")
      .sort((a, b) => (Number(b?.liquidity?.usd) || 0) - (Number(a?.liquidity?.usd) || 0))
      .find((p) => String(p?.baseToken?.symbol || "").toUpperCase() === symbol);
    return hit?.baseToken?.address || null;
  } catch (error) {
    console.warn("[nlu] resolveTokenToMint dexscreener error:", error.message);
    return null;
  }
}

module.exports = {
  resolveTokenToMint
};

