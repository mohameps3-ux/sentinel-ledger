const { cleanToken, extractTokenMention } = require("./utils");

function detectIntent(query) {
  const text = String(query || "").trim();
  const lower = text.toLowerCase();
  if (!text) return { intent: "UNKNOWN", entities: {} };

  const commandMatch = text.match(/^\/(price|signal|wallet|swap)\b\s*(.*)$/i);
  if (commandMatch) {
    const cmd = commandMatch[1].toLowerCase();
    const rest = commandMatch[2] || "";
    if (cmd === "price") return { intent: "GET_PRICE", entities: { token: cleanToken(rest.split(/\s+/)[0]) } };
    if (cmd === "signal") return { intent: "GET_SIGNAL", entities: { token: cleanToken(rest.split(/\s+/)[0]) } };
    if (cmd === "wallet") return { intent: "GET_WALLET", entities: { wallet: rest.trim() } };
    if (cmd === "swap") {
      const m = rest.match(/([0-9]*\.?[0-9]+)\s+([A-Za-z0-9$#@]+)\s+([A-Za-z0-9$#@]+)/i);
      if (m) {
        return {
          intent: "GET_SWAP_QUOTE",
          entities: { amount: Number(m[1]), inToken: cleanToken(m[2]), outToken: cleanToken(m[3]) }
        };
      }
    }
  }

  const swapRe =
    /(?:swap|quote|cambiar|intercambiar|cu[aá]nto)\s+([0-9]*\.?[0-9]+)\s+([A-Za-z0-9$#@]+)(?:\s+(?:to|for|a|por)\s+([A-Za-z0-9$#@]+))?/i;
  const swapMatch = text.match(swapRe);
  if (swapMatch) {
    return {
      intent: "GET_SWAP_QUOTE",
      entities: {
        amount: Number(swapMatch[1]),
        inToken: cleanToken(swapMatch[2]),
        outToken: cleanToken(swapMatch[3] || "USDC")
      }
    };
  }

  const walletDirect = text.match(/\b(?:wallet|cartera)\s+([1-9A-HJ-NP-Za-km-z]{32,44})\b/i);
  if (walletDirect) return { intent: "GET_WALLET", entities: { wallet: walletDirect[1] } };

  if (/(analy[sz]e wallet|what is this wallet buying|cartera|analiza(r)? wallet|wallet buying)/i.test(lower)) {
    const anyWallet = text.match(/([1-9A-HJ-NP-Za-km-z]{32,44})/);
    if (anyWallet) return { intent: "GET_WALLET", entities: { wallet: anyWallet[1] } };
  }

  if (/(signal|señal|senal|should i buy|buy|comprar|accumulate|watch|too late|entry|entrada)/i.test(lower)) {
    return { intent: "GET_SIGNAL", entities: { token: extractTokenMention(text) } };
  }

  if (/(price|precio|how much|cu[aá]nto|cotiza|valor|worth)/i.test(lower)) {
    return { intent: "GET_PRICE", entities: { token: extractTokenMention(text) } };
  }

  return { intent: "UNKNOWN", entities: {} };
}

module.exports = {
  detectIntent
};

