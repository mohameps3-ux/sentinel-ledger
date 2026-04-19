const { getMarketData } = require("../../marketData");
const { cleanToken } = require("../utils");
const { resolveTokenToMint } = require("../resolver");

async function handleGetPrice(entities) {
  try {
    const mint = await resolveTokenToMint(entities?.token);
    if (!mint) return { ok: false, error: "Could not resolve token." };

    const md = await getMarketData(mint);
    if (!md) return { ok: false, error: "Price data unavailable." };

    return {
      ok: true,
      intent: "GET_PRICE",
      data: {
        mint,
        symbol: md.symbol || cleanToken(entities?.token) || "TOKEN",
        priceUsd: Number(md.price || 0),
        change24h: Number(md.priceChange24h || 0),
        volume24h: Number(md.volume24h || 0),
        liquidity: Number(md.liquidity || 0)
      }
    };
  } catch (error) {
    console.error("[nlu] handleGetPrice failed:", error.message);
    return { ok: false, error: "Price data unavailable." };
  }
}

module.exports = {
  handleGetPrice
};

