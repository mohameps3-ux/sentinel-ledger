"use client";

import Link from "next/link";
import { useLocale } from "../../contexts/LocaleContext";
import { FinancialDisclaimer } from "./FinancialDisclaimer";

const FOOTER_LINKS = [
  { href: "/results", key: "results" },
  { href: "/scanner", key: "scanner" },
  { href: "/smart-money", key: "smart" },
  { href: "/compare", key: "compare" },
  { href: "/watchlist", key: "watch" },
  { href: "/portfolio", key: "port" },
  { href: "/alerts", key: "alerts" },
  { href: "/pricing", key: "pricing" },
  { href: "/ops", key: "ops" },
  { href: "/terms", key: "terms" },
  { href: "/privacy", key: "privacy" },
  { href: "/legal", key: "legal" },
  { href: "/contact", key: "contact" },
  { href: "https://x.com", key: "twitter", external: true },
  { href: "https://github.com/mohameps3-ux/sentinel-ledger", key: "github", external: true }
];

export function SiteFooter() {
  const { t } = useLocale();

  return (
    <footer className="sl-app-footer border-t border-[var(--sl-border-strong)] bg-[var(--sl-footer-bg)] backdrop-blur-md mt-16 safe-bottom-pad">
      <div className="sl-container sl-container-wide py-10 sl-body text-[var(--sl-fg-muted)]">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6 mb-6">
          <div>
            <p className="text-sm font-semibold text-[var(--sl-fg)] tracking-tight">{t("footer.brand")}</p>
            <p className="text-xs text-[var(--sl-fg-soft)] mt-1 max-w-xs leading-relaxed">{t("footer.tagline")}</p>
          </div>
          <div className="sl-footer-grid text-sm">
            {FOOTER_LINKS.map((item) => {
              const label = t(`footer.link.${item.key}`);
              const cls =
                "sl-footer-link block py-2.5 sm:py-1 text-[var(--sl-fg-muted)] hover:text-[var(--sl-fg)] transition-colors duration-150 rounded-md hover:bg-white/[0.04]";
              if (item.external) {
                return (
                  <a key={item.key} href={item.href} target="_blank" rel="noreferrer" className={cls}>
                    {label}
                  </a>
                );
              }
              return (
                <Link key={item.key} href={item.href} className={cls}>
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
      <div className="border-t border-[var(--sl-border)] py-6 bg-[rgba(4,5,8,0.55)]">
        <FinancialDisclaimer />
      </div>
    </footer>
  );
}
