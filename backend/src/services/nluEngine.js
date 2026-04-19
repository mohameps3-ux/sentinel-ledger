const axios = require("axios");
const { getSupabase } = require("../lib/supabase");
const { getMarketData } = require("./marketData");
const { getLatestSignalsFeedCached } = require("./homeTerminalApi");
const { getAnalysis } = require("./riskEngine");
const { computeTerminalSignal } = require("../lib/tokenTerminalSignal");

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const BTC_MINT = "9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E";

const TOKEN_ALIASES = {
  SOL: SOL_MINT,
  WSOL: SOL_MINT,
  USDC: USDC_MINT,
  BTC: BTC_MINT,
  WBTC: BTC_MINT
};

const TTL_BY_INTENT_MS = {
  GET_PRICE: 30_000,
  GET_SIGNAL: 60_000,
  GET_WALLET: 60_000,
  GET_SWAP_QUOTE: 10_000
};

const microCache = new Map();

function now() {
  return Date.now();
}

function getCached(key) {
  const row = microCache.get(key);
  if (!row) return null;
  if (row.expiresAt <= now()) {
    microCache.delete(key);
    return null;
  }
  return row.value;
}

function setCached(key, value, ttlMs) {
  microCache.set(key, { value, expiresAt: now() + ttlMs });
}

function cleanToken(raw) {
  const t = String(raw || "")
    .trim()
    .replace(/^[@#$]/, "")
    .toUpperCase();
  return t;
}

function isLikelyMint(s) {
  return typeof s === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s.trim());
}

function detectIntent(query) {
  const text = String(query || "").trim();
  const lower = text.toLowerCase();
  if (!text) return { intent: "UNKNOWN", entities: {} };

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
  if (walletDirect) {
    return { intent: "GET_WALLET", entities: { wallet: walletDirect[1] } };
  }

  if (/(analy[sz]e wallet|what is this wallet buying|cartera|analiza(r)? wallet|wallet buying)/i.test(lower)) {
    const anyWallet = text.match(/([1-9A-HJ-NP-Za-km-z]{32,44})/);
    if (anyWallet) return { intent: "GET_WALLET", entities: { wallet: anyWallet[1] } };
  }

  if (
    /(signal|señal|senal|should i buy|buy|comprar|accumulate|watch|too late|entry|entrada)/i.test(lower)
  ) {
    const token = extractTokenMention(text);
    return { intent: "GET_SIGNAL", entities: { token } };
  }

  if (/(price|precio|how much|cu[aá]nto|cotiza|valor|worth)/i.test(lower)) {
    const token = extractTokenMention(text);
    return { intent: "GET_PRICE", entities: { token } };
  }

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

  return { intent: "UNKNOWN", entities: {} };
}

function extractTokenMention(text) {
  const maybeMint = text.match(/([1-9A-HJ-NP-Za-km-z]{32,44})/);
  if (maybeMint) return maybeMint[1];
  const maybeSymbol = text.match(/\b(?:of|de|on|en|for|sobre)\s+([A-Za-z0-9$#@]{2,10})\b/i);
  if (maybeSymbol) return cleanToken(maybeSymbol[1]);
  const fallback = text.match(/\b([A-Za-z]{2,10})\b$/);
  return fallback ? cleanToken(fallback[1]) : null;
}

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
  } catch {
    return null;
  }
}

function asPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0.0%";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function normalizeAction(action) {
  const a = String(action || "").toUpperCase();
  if (a.includes("ENTER") || a.includes("PREPARE")) return "ACCUMULATE";
  if (a.includes("STAY OUT") || a.includes("TOO_LATE")) return "TOO LATE";
  return "WATCH";
}

async function handleGetPrice(entities) {
  const mint = await resolveTokenToMint(entities?.token);
  if (!mint) return fail("Could not resolve token.");
  const md = await getMarketData(mint);
  if (!md) return fail("Price data unavailable.");
  const symbol = md.symbol || cleanToken(entities?.token) || "TOKEN";
  return ok("GET_PRICE", {
    mint,
    symbol,
    priceUsd: Number(md.price || 0),
    change24h: Number(md.priceChange24h || 0),
    volume24h: Number(md.volume24h || 0),
    liquidity: Number(md.liquidity || 0)
  });
}

async function handleGetSignal(entities) {
  const supabase = getSupabase();
  const mint = await resolveTokenToMint(entities?.token);
  if (!mint) return fail("Could not resolve token.");
  const feed = await getLatestSignalsFeedCached(supabase, 50, "balanced");
  const rows = Array.isArray(feed?.data) ? feed.data : [];
  const found = rows.find((r) => String(r.tokenAddress || "") === mint);
  if (found) {
    return ok("GET_SIGNAL", {
      mint,
      symbol: String(found.token || "").replace("$", "") || cleanToken(entities?.token) || "TOKEN",
      signalStrength: Number(found.sentinelScore || 0),
      suggestedAction: normalizeAction(found.decision),
      confidence: Number(found.sentinelScore || 0)
    });
  }

  const md = await getMarketData(mint);
  if (!md) return fail("Signal data unavailable.");
  const analysis = await getAnalysis(mint, md);
  const terminal = computeTerminalSignal(analysis, md);
  return ok("GET_SIGNAL", {
    mint,
    symbol: md.symbol || cleanToken(entities?.token) || "TOKEN",
    signalStrength: Number(terminal.signalStrength || 0),
    suggestedAction: normalizeAction(terminal.suggestedAction),
    confidence: Number(analysis?.confidence || 0)
  });
}

async function handleGetWallet(entities) {
  const wallet = String(entities?.wallet || "").trim();
  if (!isLikelyMint(wallet)) return fail("Provide a valid Solana wallet address.");
  const supabase = getSupabase();

  const { data: row, error } = await supabase
    .from("smart_wallets")
    .select("*")
    .eq("wallet_address", wallet)
    .maybeSingle();
  if (error) return fail("Wallet lookup failed.");
  if (!row) return fail("Wallet not found in smart_wallets.");

  const { data: activity } = await supabase
    .from("smart_wallet_signals")
    .select("token_address,last_action,confidence,created_at,result_pct")
    .eq("wallet_address", wallet)
    .order("created_at", { ascending: false })
    .limit(5);

  const winRate = Number(row.win_rate || 0);
  const pnl30d = Number(row.pnl_30d || 0);
  const avgPos = Number(row.avg_position_size || 0);
  const roi30d = avgPos > 0 ? (pnl30d / avgPos) * 100 : 0;
  const riskProfile = winRate >= 85 ? "LOW-RISK ALPHA" : winRate >= 72 ? "BALANCED" : "SPECULATIVE";

  return ok("GET_WALLET", {
    wallet,
    winRate,
    roi30d,
    pnl30d,
    totalTrades: Number(row.total_trades || 0),
    recentHits: Number(row.recent_hits || 0),
    riskProfile,
    recentTrades: (activity || []).map((a) => ({
      token: a.token_address,
      side: a.last_action,
      confidence: Number(a.confidence || 0),
      resultPct: a.result_pct != null ? Number(a.result_pct) : null,
      at: a.created_at
    }))
  });
}

async function handleGetSwapQuote(entities) {
  const amount = Number(entities?.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) return fail("Amount must be greater than 0.");
  const inMint = await resolveTokenToMint(entities?.inToken);
  const outMint = await resolveTokenToMint(entities?.outToken || "USDC");
  if (!inMint || !outMint) return fail("Could not resolve swap tokens.");

  const inAmountRaw =
    inMint === SOL_MINT
      ? Math.round(amount * 1_000_000_000)
      : Math.round(amount * 1_000_000);

  try {
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
    return ok("GET_SWAP_QUOTE", {
      inputMint: inMint,
      outputMint: outMint,
      inputAmount: amount,
      outputAmount: outAmount,
      priceImpactPct: Number(data?.priceImpactPct || 0),
      routeCount: Array.isArray(data?.routePlan) ? data.routePlan.length : 0
    });
  } catch {
    return fail("Swap quote unavailable.");
  }
}

function ok(intent, data) {
  return { ok: true, intent, data };
}

function fail(message) {
  return { ok: false, error: message };
}

function cacheKey(intent, entities) {
  return `nlu:${intent}:${JSON.stringify(entities || {})}`;
}

async function executeIntent(intent, entities = {}) {
  const ttlMs = TTL_BY_INTENT_MS[intent] || 30_000;
  const key = cacheKey(intent, entities);
  const hit = getCached(key);
  if (hit) return { ...hit, meta: { ...(hit.meta || {}), cache: "memory" } };

  let result;
  if (intent === "GET_PRICE") result = await handleGetPrice(entities);
  else if (intent === "GET_SIGNAL") result = await handleGetSignal(entities);
  else if (intent === "GET_WALLET") result = await handleGetWallet(entities);
  else if (intent === "GET_SWAP_QUOTE") result = await handleGetSwapQuote(entities);
  else {
    result = {
      ok: false,
      intent: "UNKNOWN",
      error:
        "I didn't understand that. Try: price of SOL, signal on WIF, analyze wallet [address], swap 1 SOL to USDC."
    };
  }

  const out = { ...result, meta: { cache: "miss", ttlMs } };
  if (result?.ok) setCached(key, out, ttlMs);
  return out;
}

function formatNluResponse(result) {
  if (!result?.ok) {
    return (
      result?.error ||
      "I didn't understand that. Try: price of SOL, signal on WIF, analyze wallet [address], swap 1 SOL to USDC."
    );
  }
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
      `🔁 Swap quote`,
      `Input: ${d.inputAmount}`,
      `Expected out: ${Number(d.outputAmount || 0).toLocaleString("en-US", { maximumFractionDigits: 6 })}`,
      `Price impact: ${Number(d.priceImpactPct || 0).toFixed(3)}%`
    ].join("\n");
  }
  return "Done.";
}

module.exports = {
  detectIntent,
  executeIntent,
  formatNluResponse
};

