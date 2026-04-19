import { getPublicApiUrl } from "../publicRuntime";

export async function fetchWalletSummary(walletAddress) {
  const w = String(walletAddress || "").trim();
  if (!w) throw new Error("wallet_required");
  const res = await fetch(`${getPublicApiUrl()}/api/v1/wallets/${encodeURIComponent(w)}/summary`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || "wallet_summary_failed");
  return body;
}

