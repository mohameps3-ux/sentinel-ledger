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

const proButtonClass =
  "!inline-flex !h-7 !min-h-0 !items-center !justify-center !rounded-[2px] !border !border-violet-500/40 !bg-violet-500/10 !px-2.5 !py-0 !font-mono !text-2xs !font-semibold !uppercase !tracking-[0.1em] !text-violet-100 hover:!bg-violet-500/20 hover:!border-violet-400/50 !shadow-none !transition-colors";

export function NavProAccess({ className = "" }) {
  const { t } = useLocale();
  const { isPro, isLoading } = useAccessTier();
  const subscription = useSubscriptionStatus();

  if (isLoading) return null;

  if (isPro) {
    return (
      <span
        className={`inline-flex h-7 max-w-full items-center rounded-[2px] border border-emerald-500/35 bg-emerald-500/10 px-2.5 font-mono text-2xs font-semibold uppercase tracking-[0.08em] text-emerald-200 ${className}`}
        data-testid="nav-pro-badge"
      >
        PRO · {proRemainingLabel(subscription, t)}
      </span>
    );
  }

  return (
    <ProPurchaseButton className={`${proButtonClass} ${className}`} data-testid="nav-pro-cta">
      {t("nav.proCta")}
    </ProPurchaseButton>
  );
}
