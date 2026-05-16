import { useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useSubscriptionStatus } from "./useSubscriptionStatus";

/**
 * Central freemium tier for Sentinel UI gates.
 * Defaults to `free` whenever subscription status is unknown or loading.
 */
export function useAccessTier() {
  const { connected } = useWallet();
  const subscription = useSubscriptionStatus();

  const walletConnected = Boolean(connected);
  const isLoading = Boolean(subscription.isLoading);

  const tier = useMemo(() => {
    if (isLoading) return "free";
    if (walletConnected && subscription.active) return "pro";
    return "free";
  }, [isLoading, walletConnected, subscription.active]);

  const isPro = tier === "pro";
  const isFree = tier === "free";

  return {
    tier,
    isPro,
    isFree,
    walletConnected,
    isLoading
  };
}
