import { clusterApiUrl } from "@solana/web3.js";

/**
 * NEXT_PUBLIC_* is inlined at build time. If Vercel envs are missing, fetch URLs become "undefined/..." and the app looks "dead" (only error text).
 * Production fallback = canonical Railway API from README.
 */
const DEFAULT_PROD_API =
  "https://sentinel-ledger-backend-production.up.railway.app";
const DEFAULT_DEV_WS = "ws://localhost:3001";

function trimTrailingSlash(s) {
  return s.replace(/\/+$/, "");
}

function isBrowserSameOrigin(url) {
  if (typeof window === "undefined" || !url) return false;
  try {
    const target = new URL(url, window.location.href);
    const current = new URL(window.location.href);
    const sameOrigin = target.origin === current.origin;
    const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1"]);
    const sameLoopbackPort =
      loopbackHosts.has(target.hostname) &&
      loopbackHosts.has(current.hostname) &&
      String(target.port || "80") === String(current.port || "80") &&
      target.protocol.replace(/^ws/, "http") === current.protocol.replace(/^ws/, "http");
    return sameOrigin || sameLoopbackPort;
  } catch {
    return false;
  }
}

export function getPublicApiUrl() {
  const raw = process.env.NEXT_PUBLIC_API_URL;
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (trimmed && !isBrowserSameOrigin(trimmed)) return trimTrailingSlash(trimmed);
  if (process.env.NODE_ENV === "production") return DEFAULT_PROD_API;
  // Development default: same-origin relative URLs go through Next rewrites.
  // This prevents the browser from calling the Next app itself as if it were the API.
  return "";
}

export function getPublicWsUrl() {
  const raw = process.env.NEXT_PUBLIC_WS_URL;
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (trimmed && !isBrowserSameOrigin(trimmed.replace(/^ws/, "http"))) return trimTrailingSlash(trimmed);
  const api = getPublicApiUrl();
  if (api.startsWith("https://")) return api.replace(/^https:\/\//, "wss://");
  if (api.startsWith("http://")) return api.replace(/^http:\/\//, "ws://");
  return process.env.NODE_ENV === "production" ? DEFAULT_PROD_API.replace(/^https:\/\//, "wss://") : DEFAULT_DEV_WS;
}

/** Public X/Twitter profile — must include handle path (not bare https://x.com). */
export function getPublicXProfileUrl() {
  const raw = String(process.env.NEXT_PUBLIC_X_URL || process.env.NEXT_PUBLIC_TWITTER_URL || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (host !== "x.com" && host !== "twitter.com") return "";
    const path = u.pathname.replace(/\/+$/, "");
    if (!path || path === "/") return "";
    return u.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}
  const raw = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (trimmed) return trimTrailingSlash(trimmed);
  return clusterApiUrl("mainnet-beta");
}
