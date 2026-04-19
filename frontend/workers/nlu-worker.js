import { get, set } from "idb-keyval";

const TTL_BY_INTENT_MS = {
  GET_PRICE: 30_000,
  GET_SIGNAL: 60_000,
  GET_WALLET: 60_000,
  GET_SWAP_QUOTE: 10_000
};

const microcache = new Map();
const FALLBACK_MESSAGE =
  "I didn't understand that. Try: price of SOL, signal on WIF, analyze wallet [address], swap 1 SOL to USDC";

function cacheKey(intent, entities, query) {
  return `nlu:${intent || "UNKNOWN"}:${JSON.stringify(entities || {})}:${String(query || "").toLowerCase().trim()}`;
}

function getMemory(key) {
  const row = microcache.get(key);
  if (!row) return null;
  if (row.expiresAt <= Date.now()) {
    microcache.delete(key);
    return null;
  }
  return row.value;
}

function setMemory(key, value, ttlMs) {
  microcache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

async function getIdb(key) {
  const row = await get(key);
  if (!row || typeof row !== "object") return null;
  if (Number(row.expiresAt || 0) <= Date.now()) return null;
  return row.value || null;
}

async function setIdb(key, value, ttlMs) {
  await set(key, { value, expiresAt: Date.now() + ttlMs });
}

function cleanToken(raw) {
  return String(raw || "")
    .trim()
    .replace(/^[@#$]/, "")
    .toUpperCase();
}

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
          entities: {
            amount: Number(m[1]),
            inToken: cleanToken(m[2]),
            outToken: cleanToken(m[3])
          }
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

  const walletMatch = text.match(/\b(?:wallet|cartera)\s+([1-9A-HJ-NP-Za-km-z]{32,44})\b/i);
  if (walletMatch) {
    return { intent: "GET_WALLET", entities: { wallet: walletMatch[1] } };
  }

  if (
    /(signal|señal|senal|should i buy|comprar|entry|entrada|accumulate|watch|too late)/i.test(lower)
  ) {
    const t = extractTokenMention(text);
    return { intent: "GET_SIGNAL", entities: { token: t } };
  }

  if (/(price|precio|how much|cu[aá]nto|cotiza|valor|worth)/i.test(lower)) {
    const t = extractTokenMention(text);
    return { intent: "GET_PRICE", entities: { token: t } };
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

async function queryBackend(apiBaseUrl, query, intent, entities) {
  const res = await fetch(`${apiBaseUrl}/api/v1/nlu/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, intent, entities })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      intent: intent || "UNKNOWN",
      error: json?.error || FALLBACK_MESSAGE
    };
  }
  return json;
}

self.onmessage = async (event) => {
  const payload = event?.data || {};
  const { query, apiBaseUrl } = payload;
  const text = String(query || "").trim();
  if (!text) {
    self.postMessage({ ok: false, error: FALLBACK_MESSAGE, intent: "UNKNOWN" });
    return;
  }

  const parsed = detectIntent(text);
  const ttlMs = TTL_BY_INTENT_MS[parsed.intent] || 30_000;
  const key = cacheKey(parsed.intent, parsed.entities, text);

  const hitMem = getMemory(key);
  if (hitMem) {
    self.postMessage({ ...hitMem, meta: { ...(hitMem.meta || {}), cacheLayer: "memory" } });
    return;
  }

  try {
    const hitDb = await getIdb(key);
    if (hitDb) {
      setMemory(key, hitDb, ttlMs);
      self.postMessage({ ...hitDb, meta: { ...(hitDb.meta || {}), cacheLayer: "indexeddb" } });
      return;
    }
  } catch {
    // ignore idb errors
  }

  const response = await queryBackend(apiBaseUrl, text, parsed.intent, parsed.entities);
  const normalized = response?.ok
    ? response
    : { ok: false, intent: parsed.intent, error: response?.error || FALLBACK_MESSAGE };

  if (normalized.ok) {
    setMemory(key, normalized, ttlMs);
    try {
      await setIdb(key, normalized, ttlMs);
    } catch {
      // ignore idb write errors
    }
  }

  self.postMessage(normalized);
};

