const { FALLBACK_MESSAGE } = require("../constants");
const { handleGetPrice } = require("./price");
const { handleGetSignal } = require("./signal");
const { handleGetWallet } = require("./wallet");
const { handleGetSwapQuote } = require("./swap");

async function runIntentHandler(intent, entities) {
  if (intent === "GET_PRICE") return handleGetPrice(entities);
  if (intent === "GET_SIGNAL") return handleGetSignal(entities);
  if (intent === "GET_WALLET") return handleGetWallet(entities);
  if (intent === "GET_SWAP_QUOTE") return handleGetSwapQuote(entities);
  return { ok: false, intent: "UNKNOWN", error: FALLBACK_MESSAGE };
}

module.exports = {
  runIntentHandler
};

