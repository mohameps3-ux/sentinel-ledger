"use client";

import Link from "next/link";
import { useLocale } from "../../contexts/LocaleContext";
import { FinancialDisclaimer } from "./FinancialDisclaimer";

const FOOTER_GROUPS = [
  {
    titleKey: "footer.col.trading",
    items: [
      { href: "/scanner", labelKey: "footer.link.scanner" },
      { href: "/alerts", labelKey: "footer.link.alerts" },
      { href: "/smart-money", labelKey: "footer.link.smart" },
      { href: "/watchlist", labelKey: "footer.link.watch" }
    ]
  },
  {
    titleKey: "footer.col.intelligence",
    items: [
      { href: "/graveyard", labelKey: "nav.grave" },
      { href: "/wallet-stalker", labelKey: "nav.stalker" },
      { href: "/compare", labelKey: "footer.link.compare" },
      { href: "/portfolio", labelKey: "footer.link.port" },
      { href: "/results", labelKey: "footer.link.results" }
    ]
  },
  {
    titleKey: "footer.col.account",
    items: [
      { href: "/pricing", labelKey: "footer.link.pricing" },
      { href: "/ops", labelKey: "footer.link.ops" },
      { href: "/contact", labelKey: "footer.link.contact" }
    ]
  },
  {
    titleKey: "footer.col.legal",
    items: [
      { href: "/terms", labelKey: "footer.link.terms" },
      { href: "/privacy", labelKey: "footer.link.privacy" },
      { href: "/legal", labelKey: "footer.link.legal" }
    ]
  }
];

const SOCIAL_LINKS = [
  { href: "https://x.com", labelKey: "footer.link.twitter" },
  { href: "https://github.com/mohameps3-ux/sentinel-ledger", labelKey: "footer.link.github" }
];

export function SiteFooter() {
  const { t } = useLocale();
  const year = new Date().getFullYear();
  const linkBase =
    "block py-1 text-[12px] text-[var(--sl-fg-muted)] hover:text-[var(--sl-fg)] transition-colors duration-150 font-mono tracking-tight";
  const titleBase =
    "text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--sl-fg-soft)] mb-3";

  return (
    <footer className="sl-app-footer border-t border-[var(--sl-border-strong)] bg-[var(--sl-footer-bg)] backdrop-blur-md mt-16 safe-bottom-pad">
      <div className="sl-container sl-container-wide py-12">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_repeat(4,1fr)] lg:gap-8">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="sl-footer-pulse" aria-hidden />
              <p className="text-sm font-bold tracking-[0.16em] uppercase text-[var(--sl-fg)]">
                {t("footer.brand")}
              </p>
            </div>
            <p className="text-[12px] text-[var(--sl-fg-soft)] max-w-xs leading-relaxed">
              {t("footer.tagline")}
            </p>
            <div className="pt-2">
              <p className={titleBase}>{t("footer.col.connect")}</p>
              <div className="flex flex-wrap gap-2">
                {SOCIAL_LINKS.map((s) => (
                  <a
                    key={s.labelKey}
                    href={s.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center px-2.5 py-1 border border-white/[0.08] bg-white/[0.02] text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--sl-fg-muted)] hover:border-white/20 hover:text-[var(--sl-fg)] transition"
                  >
                    {t(s.labelKey)}
                  </a>
                ))}
              </div>
            </div>
          </div>

          {FOOTER_GROUPS.map((group) => (
            <nav key={group.titleKey} aria-label={t(group.titleKey)}>
              <p className={titleBase}>{t(group.titleKey)}</p>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className={linkBase}>
                      {t(item.labelKey)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>

      <div className="border-t border-[var(--sl-border)] py-6 bg-[rgba(4,5,8,0.55)]">
        <FinancialDisclaimer />
        <div className="sl-container sl-container-wide mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[10px] uppercase tracking-[0.18em] text-[var(--sl-fg-soft)] font-mono">
          <span>© {year} Sentinel Ledger</span>
          <span>Solana intelligence terminal · v1.0 BETA</span>
        </div>
      </div>

      <style jsx>{`
        .sl-footer-pulse {
          display: inline-block;
          width: 8px;
          height: 8px;
          background: #10b981;
          border-radius: 999px;
          box-shadow: 0 0 10px rgba(16, 185, 129, 0.7);
          animation: sl-footer-pulse 2.4s ease-in-out infinite;
        }
        @keyframes sl-footer-pulse {
          0%,
          100% {
            opacity: 0.55;
            transform: scale(0.9);
          }
          50% {
            opacity: 1;
            transform: scale(1.15);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .sl-footer-pulse {
            animation: none;
          }
        }
      `}</style>
    </footer>
  );
}
