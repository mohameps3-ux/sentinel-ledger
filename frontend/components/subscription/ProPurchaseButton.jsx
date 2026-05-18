"use client";

import { useSubscriptionModal } from "../../contexts/SubscriptionModalContext";

/**
 * Opens the global USDC SubscriptionModal. Drop-in replacement for upgrade Links.
 */
export function ProPurchaseButton({ onClick, className, style, children, type = "button", ...rest }) {
  const { openSubscriptionModal } = useSubscriptionModal();

  return (
    <button
      type={type}
      onClick={(e) => {
        onClick?.(e);
        openSubscriptionModal();
      }}
      className={className}
      style={style}
      {...rest}
    >
      {children}
    </button>
  );
}
