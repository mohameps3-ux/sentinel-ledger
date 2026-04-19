const { getSupabase } = require("../../../lib/supabase");
const { getMarketData } = require("../../marketData");
const { getAnalysis } = require("../../riskEngine");
const { getLatestSignalsFeedCached } = require("../../homeTerminalApi");
const { computeTerminalSignal } = require("../../../lib/tokenTerminalSignal");
const { cleanToken, normalizeAction } = require("../utils");
const { resolveTokenToMint } = require("../resolver");

async function handleGetSignal(entities) {
  try {
    const mint = await resolveTokenToMint(entities?.token);
    if (!mint) return { ok: false, error: "Could not resolve token." };

    let rows = [];
    try {
      const supabase = getSupabase();
      const feed = await getLatestSignalsFeedCached(supabase, 50, "balanced");
      rows = Array.isArray(feed?.data) ? feed.data : [];
    } catch (error) {
      console.warn("[nlu] signals cache feed unavailable:", error.message);
    }

    const found = rows.find((r) => String(r.tokenAddress || "") === mint);
    if (found) {
      return {
        ok: true,
        intent: "GET_SIGNAL",
        data: {
          mint,
          symbol: String(found.token || "").replace("$", "") || cleanToken(entities?.token) || "TOKEN",
          signalStrength: Number(found.sentinelScore || 0),
          suggestedAction: normalizeAction(found.decision),
          confidence: Number(found.sentinelScore || 0)
        }
      };
    }

    const md = await getMarketData(mint);
    if (!md) return { ok: false, error: "Signal data unavailable." };
    const analysis = await getAnalysis(mint, md);
    const terminal = computeTerminalSignal(analysis, md);

    return {
      ok: true,
      intent: "GET_SIGNAL",
      data: {
        mint,
        symbol: md.symbol || cleanToken(entities?.token) || "TOKEN",
        signalStrength: Number(terminal.signalStrength || 0),
        suggestedAction: normalizeAction(terminal.suggestedAction),
        confidence: Number(analysis?.confidence || 0)
      }
    };
  } catch (error) {
    console.error("[nlu] handleGetSignal failed:", error.message);
    return { ok: false, error: "Signal data unavailable." };
  }
}

module.exports = {
  handleGetSignal
};

