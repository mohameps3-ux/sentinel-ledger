import { getPublicApiUrl } from "../publicRuntime";

export async function fetchWalletBehaviorSummary(walletAddress) {
  const w = String(walletAddress || "").trim();
  if (!w) throw new Error("wallet_required");
  const res = await fetch(`${getPublicApiUrl()}/api/v1/wallets/${encodeURIComponent(w)}/behavior`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || "wallet_behavior_failed");
  return body;
}

export async function fetchWalletBehaviorTokens(walletAddress, limit = 20) {
  const w = String(walletAddress || "").trim();
  if (!w) throw new Error("wallet_required");
  const lim = Math.min(100, Math.max(1, Number(limit) || 20));
  const res = await fetch(
    `${getPublicApiUrl()}/api/v1/wallets/${encodeURIComponent(w)}/behavior/tokens?limit=${encodeURIComponent(lim)}`
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || "wallet_behavior_tokens_failed");
  return body;
}

