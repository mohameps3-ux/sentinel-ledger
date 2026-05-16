import { useAccessTier } from "../../hooks/useAccessTier";

/**
 * Renders `children` only for active PRO subscribers; otherwise shows `fallback`.
 *
 * @example
 * <ProGate fallback={<LockedPlaceholder />}>
 *   <RealTimeSignals />
 * </ProGate>
 */
export function ProGate({ children, fallback = null }) {
  const { isPro, isLoading, walletConnected } = useAccessTier();

  if (isPro) {
    return children;
  }

  // Wallet connected but subscription still resolving: show real content dimmed so
  // returning PRO users avoid a locked-state flash. No wallet → never preview PRO UI.
  if (isLoading && walletConnected) {
    return (
      <div aria-busy="true" className="opacity-80 transition-opacity duration-200">
        {children}
      </div>
    );
  }

  return fallback;
}
