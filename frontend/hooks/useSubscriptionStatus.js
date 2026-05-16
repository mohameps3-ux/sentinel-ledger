import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { getPublicApiUrl } from "../lib/publicRuntime";

function computeTimeLeft(expiresAt) {
  if (!expiresAt) {
    return { daysLeft: null, hoursLeft: null };
  }
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) {
    return { daysLeft: 0, hoursLeft: 0 };
  }
  return {
    daysLeft: Math.floor(ms / 86400000),
    hoursLeft: Math.floor((ms % 86400000) / 3600000)
  };
}

async function fetchSubscriptionStatus(walletAddress) {
  const url = `${getPublicApiUrl()}/api/v1/subscription/status?wallet=${encodeURIComponent(walletAddress)}`;
  const res = await fetch(url, { credentials: "omit" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String(json?.error || `subscription_status_${res.status}`));
  }
  return json;
}

/**
 * Polls whether the connected wallet has an active crypto subscription.
 * Query runs only when a wallet is connected (see `enabled`).
 */
export function useSubscriptionStatus() {
  const { publicKey, connected } = useWallet();
  const walletAddress = connected && publicKey ? publicKey.toBase58() : null;

  const query = useQuery({
    queryKey: ["subscription-status", walletAddress],
    queryFn: () => fetchSubscriptionStatus(walletAddress),
    enabled: Boolean(walletAddress),
    refetchInterval: 60000,
    staleTime: 30_000,
    retry: 1
  });

  const data = query.data;
  const active = Boolean(data?.active);
  const plan = typeof data?.plan === "string" ? data.plan : null;
  const expiresAt = data?.expires_at ?? null;
  const { daysLeft, hoursLeft } = computeTimeLeft(expiresAt);

  return {
    active,
    plan,
    expiresAt,
    daysLeft,
    hoursLeft,
    isLoading: query.isPending,
    error: query.error ?? null
  };
}
