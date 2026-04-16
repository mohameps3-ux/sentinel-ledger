import { clusterApiUrl } from "@solana/web3.js";

/**
 * NEXT_PUBLIC_* is inlined at build time. If Vercel envs are missing, fetch URLs become "undefined/..." and the app looks "dead" (only error text).
 * Production fallback = canonical Railway API from README.
 */
const DEFAULT_PROD_API =
  "https://sentinel-ledger-backend-production.up.railway.app";

function trimTrailingSlash(s) {
  return s.replace(/\/+$/, "");
}

export function getPublicApiUrl() {
  const raw = process.env.NEXT_PUBLIC_API_URL;
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (trimmed) return trimTrailingSlash(trimmed);
  if (process.env.NODE_ENV === "production") return DEFAULT_PROD_API;
  return "http://localhost:3000";
}

export function getPublicWsUrl() {
  const raw = process.env.NEXT_PUBLIC_WS_URL;
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (trimmed) return trimTrailingSlash(trimmed);
  const api = getPublicApiUrl();
  if (api.startsWith("https://")) return api.replace(/^https:\/\//, "wss://");
  if (api.startsWith("http://")) return api.replace(/^http:\/\//, "ws://");
  return "ws://localhost:3000";
}

/** Solana RPC for wallet + ConnectionProvider (optional dedicated RPC, no API key in client). */
export function getPublicSolanaRpcUrl() {
  const raw = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (trimmed) return trimTrailingSlash(trimmed);
  return clusterApiUrl("mainnet-beta");
}
