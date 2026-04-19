function cleanToken(raw) {
  return String(raw || "")
    .trim()
    .replace(/^[@#$]/, "")
    .toUpperCase();
}

function isLikelyMint(value) {
  return typeof value === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.trim());
}

function extractTokenMention(text) {
  const maybeMint = String(text || "").match(/([1-9A-HJ-NP-Za-km-z]{32,44})/);
  if (maybeMint) return maybeMint[1];

  const maybeSymbol = String(text || "").match(/\b(?:of|de|on|en|for|sobre)\s+([A-Za-z0-9$#@]{2,10})\b/i);
  if (maybeSymbol) return cleanToken(maybeSymbol[1]);

  const fallback = String(text || "").match(/\b([A-Za-z]{2,10})\b$/);
  return fallback ? cleanToken(fallback[1]) : null;
}

function asPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0.0%";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function normalizeAction(action) {
  const value = String(action || "").toUpperCase();
  if (value.includes("ENTER") || value.includes("PREPARE")) return "ACCUMULATE";
  if (value.includes("STAY OUT") || value.includes("TOO_LATE")) return "TOO LATE";
  return "WATCH";
}

module.exports = {
  cleanToken,
  isLikelyMint,
  extractTokenMention,
  asPct,
  normalizeAction
};

