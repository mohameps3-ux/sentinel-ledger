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

/** Tone the badge by urgency: red < 2d, amber < 5d, sapphire otherwise. */
function badgeToneByRemaining(subscription) {
  const days = Number(subscription?.daysLeft ?? NaN);
  if (Number.isFinite(days)) {
    if (days <= 1) return "warn";
    if (days <= 3) return "soft";
  }
  return "ok";
}

export function NavProAccess({ className = "" }) {
  const { t } = useLocale();
  const { isPro, isLoading } = useAccessTier();
  const subscription = useSubscriptionStatus();

  if (isLoading) return null;

  if (isPro) {
    const tone = badgeToneByRemaining(subscription);
    const toneStyle =
      tone === "warn"
        ? "border-rose-500/45 bg-rose-500/10 text-rose-200 shadow-[0_0_0_1px_rgba(244,63,94,0.2)_inset,0_8px_22px_-8px_rgba(244,63,94,0.45)]"
        : tone === "soft"
          ? "border-amber-500/45 bg-amber-500/10 text-amber-200 shadow-[0_0_0_1px_rgba(245,158,11,0.2)_inset,0_8px_22px_-8px_rgba(245,158,11,0.45)]"
          : "border-[rgba(96,165,250,0.5)] bg-[rgba(37,99,235,0.10)] text-[var(--sl-diamond)] shadow-[0_0_0_1px_rgba(96,165,250,0.2)_inset,0_8px_22px_-8px_rgba(37,99,235,0.55)]";
    const dotClass = tone === "warn" ? "sl-live-dot sl-live-dot--loss" : tone === "soft" ? "sl-live-dot" : "sl-live-dot";
    return (
      <span
        className={`sl-shine-edge inline-flex h-8 max-w-full items-center gap-2 rounded-lg border px-3 font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] transition-all ${toneStyle} ${className}`}
        data-testid="nav-pro-badge"
        title={`Sentinel PRO · ${proRemainingLabel(subscription, t)}`}
      >
        <span className={dotClass} style={{ width: "6px", height: "6px" }} />
        <span>PRO</span>
        <span className="text-[10px] opacity-80">·</span>
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
