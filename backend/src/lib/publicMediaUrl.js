"use strict";

/**
 * Ops broadcast: only https URLs Telegram can fetch; basic SSRF guard (private / loopback).
 * @param {string} raw
 * @returns {string | null} normalized URL or null
 */
function validatePublicHttpsMediaUrl(raw) {
  if (typeof raw !== "string") return null;
  const u = raw.trim();
  if (u.length < 12 || u.length > 2048) return null;
  let parsed;
  try {
    parsed = new URL(u);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".localhost") ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
    host === "[::1]"
  ) {
    return null;
  }
  return u;
}

module.exports = { validatePublicHttpsMediaUrl };
