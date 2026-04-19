const axios = require("axios");
const { SOL_MINT } = require("../constants");
const { resolveTokenToMint } = require("../resolver");

async function handleGetSwapQuote(entities) {
  const amount = Number(entities?.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Amount must be greater than 0." };

  try {
    const inMint = await resolveTokenToMint(entities?.inToken);
    const outMint = await resolveTokenToMint(entities?.outToken || "USDC");
    if (!inMint || !outMint) return { ok: false, error: "Could not resolve swap tokens." };

    const inAmountRaw = inMint === SOL_MINT ? Math.round(amount * 1_000_000_000) : Math.round(amount * 1_000_000);
    const { data } = await axios.get("https://quote-api.jup.ag/v6/quote", {
      timeout: 6000,
      params: {
        inputMint: inMint,
        outputMint: outMint,
        amount: inAmountRaw,
        slippageBps: 50
      }
    });
    const outDecimals = outMint === SOL_MINT ? 9 : 6;
    const outAmount = Number(data?.outAmount || 0) / 10 ** outDecimals;

    return {
      ok: true,
      intent: "GET_SWAP_QUOTE",
      data: {
        inputMint: inMint,
        outputMint: outMint,
        inputAmount: amount,
        outputAmount: outAmount,
        priceImpactPct: Number(data?.priceImpactPct || 0),
        routeCount: Array.isArray(data?.routePlan) ? data.routePlan.length : 0
      }
    };
  } catch (error) {
    console.error("[nlu] handleGetSwapQuote failed:", error.message);
    return { ok: false, error: "Swap quote unavailable." };
  }
}

module.exports = {
  handleGetSwapQuote
};

