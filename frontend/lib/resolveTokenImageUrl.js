"use strict";

/**
 * Resolve a public HTTP(S) image URL for a token row (signals, hot, war, etc.).
 */
function resolveTokenImageUrl(tok) {
  if (!tok || typeof tok !== "object") return null;
  const u =
    tok.imageUrl ??
    tok.image ??
    tok.logoURI ??
    tok.logoUri ??
    tok.icon ??
    tok.tokenImage ??
    tok.market?.imageUrl ??
    tok.market?.image ??
    tok.market?.logoURI ??
    tok.market?.logoUri ??
    tok.market?.icon ??
    tok.token?.logoURI ??
    tok.token?.image ??
    tok.token?.imageUrl ??
    tok._api?.logoURI ??
    tok._api?.imageUrl ??
    tok._api?.image ??
    null;
  if (typeof u !== "string") return null;
  const s = u.trim();
  if (!s.startsWith("https://") && !s.startsWith("http://")) return null;
  return s;
}

module.exports = { resolveTokenImageUrl };