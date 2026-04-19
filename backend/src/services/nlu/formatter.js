const { FALLBACK_MESSAGE } = require("./constants");
const { asPct } = require("./utils");

function formatNluResponse(result) {
  if (!result?.ok) return result?.error || FALLBACK_MESSAGE;

  if (result.intent === "GET_PRICE") {
    const d = result.data;
    return [
      `💲 ${d.symbol} price`,
      `Price: $${Number(d.priceUsd || 0).toLocaleString("en-US", { maximumFractionDigits: 8 })}`,
      `24h: ${asPct(d.change24h)}`,
      `Volume: $${Number(d.volume24h || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
    ].join("\n");
  }

  if (result.intent === "GET_SIGNAL") {
    const d = result.data;
    return [
      `📡 Signal for ${d.symbol}`,
      `Strength: ${Math.round(Number(d.signalStrength || 0))}/100`,
      `Action: ${d.suggestedAction}`,
      `Confidence: ${Math.round(Number(d.confidence || 0))}%`
    ].join("\n");
  }

  if (result.intent === "GET_WALLET") {
    const d = result.data;
    return [
      `👛 Wallet ${d.wallet.slice(0, 4)}…${d.wallet.slice(-4)}`,
      `Win rate: ${Number(d.winRate || 0).toFixed(1)}%`,
      `30d ROI: ${asPct(d.roi30d)}`,
      `Trades: ${d.totalTrades || 0} · Hits: ${d.recentHits || 0}`,
      `Risk: ${d.riskProfile}`
    ].join("\n");
  }

  if (result.intent === "GET_SWAP_QUOTE") {
    const d = result.data;
    return [
      "🔁 Swap quote",
      `Input: ${d.inputAmount}`,
      `Expected out: ${Number(d.outputAmount || 0).toLocaleString("en-US", { maximumFractionDigits: 6 })}`,
      `Price impact: ${Number(d.priceImpactPct || 0).toFixed(3)}%`
    ].join("\n");
  }

  return "Done.";
}

module.exports = {
  formatNluResponse
};

