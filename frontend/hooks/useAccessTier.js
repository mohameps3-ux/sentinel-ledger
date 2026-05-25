import { useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useSubscriptionStatus } from "./useSubscriptionStatus";
import { useProStatus } from "./useProStatus";

/**
 * Central freemium tier for Sentinel UI gates.
 *
 * Two sources of truth, OR'd together so a single user can't be PRO in /alerts
 * and FREE on the home grid at the same time:
 *   1. wallet-attached USDC subscription (`useSubscriptionStatus` via /api/v1/subscription/status)
 *   2. JWT-attached server status   (`useProStatus`        via /api/v1/user/status)
 *
 * Defaults to `free` whenever neither source can confirm PRO yet.
 */
export function useAccessTier() {
  const { connected } = useWallet();
  const walletSub = useSubscriptionStatus();
  const jwtStatus = useProStatus();

  const walletConnected = Boolean(connected);
  const walletProActive = Boolean(walletSub.active);
  const jwtProActive = Boolean(jwtStatus.data?.hasProAccess);

  // Loading means *both* sources are still resolving; once one confirms, we're done.
  const isLoading =
    !walletProActive && !jwtProActive && (Boolean(walletSub.isLoading) || Boolean(jwtStatus.isLoading));

  const tier = useMemo(() => {
    if (walletProActive || jwtProActive) return "pro";
    return "free";
  }, [walletProActive, jwtProActive]);

  const isPro = tier === "pro";
  const isFree = tier === "free";

  return {
    tier,
    isPro,
    isFree,
    walletConnected,
    isLoading,
    /** Why we're PRO (useful for debugging / future telemetry). */
    proSource: walletProActive ? "wallet" : jwtProActive ? "jwt" : null
  };
}
