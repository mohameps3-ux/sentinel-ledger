"use client";

import { useLocale } from "../../contexts/LocaleContext";
import { useAccessTier } from "../../hooks/useAccessTier";
import { useSubscriptionStatus } from "../../hooks/useSubscriptionStatus";
import { ProPurchaseButton } from "../subscription/ProPurchaseButton";

function proRemainingLabel(subscription, t) {
  const days = subscription.daysLeft;
  const hours = subscription.hoursLeft;
  if (days != null && days > 0) {
    return t("nav.proRemainingDays", { days });
  }
  if (hours != null && hours > 0) {
    return t("nav.proRemainingHours", { hours });
  }
  return t("nav.proActive");
}

/**
 * Bright sapphire upgrade CTA. Includes the diamond shine on hover so it
 * matches the rest of the institutional UI.
 */
const proButtonClass =
  "!inline-flex !h-8 !min-h-0 !items-center !justify-center !gap-1.5 !rounded-lg !border !border-[rgba(96,165,250,0.55)] !bg-gradient-to-br !from-[rgba(37,99,235,0.22)] !to-[rgba(37,99,235,0.08)] !px-3 !py-0 !font-mono !text-[10.5px] !font-bold !uppercase !tracking-[0.16em] !text-[var(--sl-diamond)] hover:!border-[rgba(147,197,253,0.85)] hover:!from-[rgba(37,99,235,0.32)] hover:!to-[rgba(37,99,235,0.14)] !shadow-[0_0_0_1px_rgba(96,165,250,0.18)_inset,0_8px_22px_-8px_rgba(37,99,235,0.55)] hover:!shadow-[0_0_0_1px_rgba(147,197,253,0.4)_inset,0_12px_30px_-8px_rgba(37,99,235,0.7)] !transition-all sl-shine-edge";

/**
 * All badges share the sapphire identity — no red, no green. We just brighten the
 * glow as expiry approaches so users notice without it looking like an error.
 */
function badgeIntensity(subscription) {
  const days = Number(subscription?.daysLeft ?? NaN);
  if (Number.isFinite(days)) {
    if (days <= 1) return "max";
    if (days <= 3) return "mid";
  }
  return "calm";
}

export function NavProAccess({ className = "" }) {
  const { t } = useLocale();
  const { isPro, isLoading } = useAccessTier();
  const subscription = useSubscriptionStatus();

  if (isLoading) return null;

  if (isPro) {
    const intensity = badgeIntensity(subscription);
    // Always sapphire — intensity only scales the glow / saturation
    const toneStyle =
      intensity === "max"
        ? "border-[rgba(147,197,253,0.85)] bg-gradient-to-br from-[rgba(37,99,235,0.22)] to-[rgba(29,78,216,0.10)] text-[var(--sl-diamond-bright)] shadow-[0_0_0_1px_rgba(147,197,253,0.4)_inset,0_10px_28px_-6px_rgba(37,99,235,0.7),0_0_24px_-4px_rgba(96,165,250,0.5)]"
        : intensity === "mid"
          ? "border-[rgba(96,165,250,0.6)] bg-gradient-to-br from-[rgba(37,99,235,0.16)] to-[rgba(29,78,216,0.06)] text-[var(--sl-diamond)] shadow-[0_0_0_1px_rgba(96,165,250,0.3)_inset,0_8px_22px_-8px_rgba(37,99,235,0.6),0_0_18px_-6px_rgba(96,165,250,0.4)]"
          : "border-[rgba(96,165,250,0.45)] bg-[rgba(37,99,235,0.08)] text-[var(--sl-diamond)] shadow-[0_0_0_1px_rgba(96,165,250,0.18)_inset,0_8px_22px_-8px_rgba(37,99,235,0.45)]";
    return (
      <span
        className={`sl-shine-edge inline-flex h-8 max-w-full items-center gap-2 rounded-lg border px-3 font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] transition-all ${toneStyle} ${className}`}
        data-testid="nav-pro-badge"
        title={`Sentinel PRO · ${proRemainingLabel(subscription, t)}`}
      >
        <span className="sl-live-dot" style={{ width: "6px", height: "6px" }} />
        <span>PRO</span>
        <span className="text-[10px] opacity-70">·</span>
        <span className="sl-num text-[10.5px] font-bold">{proRemainingLabel(subscription, t)}</span>
      </span>
    );
  }

  return (
    <ProPurchaseButton className={`${proButtonClass} ${className}`} data-testid="nav-pro-cta">
      <span className="sl-live-dot" style={{ width: "5px", height: "5px" }} />
      {t("nav.proCta")}
    </ProPurchaseButton>
  );
}
