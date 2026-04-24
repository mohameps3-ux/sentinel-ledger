"use client";

import { useLocale } from "../../contexts/LocaleContext";

export function FinancialDisclaimer({ className = "" }) {
  const { t } = useLocale();
  return (
    <div
      className={`text-xs text-[var(--sl-fg-soft)] text-center leading-relaxed max-w-4xl mx-auto px-4 ${className}`.trim()}
    >
      <p>{t("footer.disclaimer")}</p>
    </div>
  );
}
