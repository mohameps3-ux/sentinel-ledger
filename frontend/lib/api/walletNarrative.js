import { getPublicApiUrl } from "../publicRuntime";

export async function fetchWalletNarrative(walletAddress, lang = "es") {
  const w = String(walletAddress || "").trim();
  if (!w) throw new Error("wallet_required");
  const q = new URLSearchParams({ lang: String(lang || "es") });
  const res = await fetch(`${getPublicApiUrl()}/api/v1/wallets/${encodeURIComponent(w)}/narrative?${q.toString()}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error || "wallet_narrative_failed");
  }
  return body;
}

