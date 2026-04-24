import Link from "next/link";
import { useRouter } from "next/router";
import { useMemo, useState, useEffect } from "react";
import { getNextSuggestedStep } from "../../lib/nextSuggestedStep";
import { useLocale } from "../../contexts/LocaleContext";

function placeKeyForPath(pathname) {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/token/")) return "token";
  if (pathname.startsWith("/wallet/")) return "wallet";
  if (pathname === "/scanner") return "scanner";
  if (pathname === "/smart-money") return "smartMoney";
  if (pathname === "/results") return "results";
  if (pathname === "/compare") return "compare";
  if (pathname === "/watchlist") return "watchlist";
  if (pathname === "/portfolio") return "portfolio";
  if (pathname === "/alerts") return "alerts";
  if (pathname === "/pricing") return "pricing";
  if (pathname === "/graveyard") return "graveyard";
  if (pathname === "/wallet-stalker") return "stalker";
  if (pathname === "/ops") return "ops";
  if (
    pathname === "/contact" ||
    pathname === "/legal" ||
    pathname === "/privacy" ||
    pathname === "/terms"
  ) {
    return "legal";
  }
  return "unknown";
}

const FOMO_KEYS = ["wayfinding.fomo.0", "wayfinding.fomo.1", "wayfinding.fomo.2", "wayfinding.fomo.3"];

export function GlobalWayfinding() {
  const { pathname: pathRaw } = useRouter();
  const pathname = pathRaw || "/";
  const { locale, t } = useLocale();
  const htmlLang = locale === "zh" ? "zh-Hans" : locale;

  const placeKey = useMemo(() => placeKeyForPath(pathname), [pathname]);
  const placeTitle = t(`wayfinding.places.${placeKey}.title`);
  const placeDetail = t(`wayfinding.places.${placeKey}.detail`);

  const nextStep = useMemo(() => getNextSuggestedStep(pathname, locale), [pathname, locale]);

  const fomoLines = useMemo(
    () => FOMO_KEYS.map((k) => t(k)).filter((s) => typeof s === "string" && s.length > 0),
    [t, locale]
  );
  const [fomoIdx, setFomoIdx] = useState(0);

  useEffect(() => {
    setFomoIdx(0);
  }, [locale]);

  useEffect(() => {
    if (!fomoLines.length) return undefined;
    const id = setInterval(() => {
      setFomoIdx((i) => (i + 1) % fomoLines.length);
    }, 14000);
    return () => clearInterval(id);
  }, [fomoLines.length]);

  const links = useMemo(
    () => [
      { href: "/", labelKey: "home", descKey: "homeDesc" },
      { href: "/scanner", labelKey: "scanner", descKey: "scannerDesc" },
      { href: "/smart-money", labelKey: "smartMoney", descKey: "smartMoneyDesc" },
      { href: "/watchlist", labelKey: "watchlist", descKey: "watchlistDesc" },
      { href: "/alerts", labelKey: "alerts", descKey: "alertsDesc" },
      { href: "/pricing", labelKey: "pricing", descKey: "pricingDesc" }
    ],
    []
  );

  return (
    <div
      className="border-b border-white/[0.08] bg-[#0c0c10]/95 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      data-sentinel-wayfinding="1"
      lang={htmlLang}
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-5 py-2 sm:py-2.5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
          <div className="min-w-0 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--sl-fg-soft)] shrink-0">
              {t("wayfinding.youAreHere")}
            </span>
            <span className="text-sm font-semibold text-white tracking-tight">{placeTitle}</span>
            <span className="text-[var(--sl-fg-soft)] hidden sm:inline opacity-80" aria-hidden>
              ·
            </span>
            <span className="text-xs text-[var(--sl-fg-muted)] max-w-xl leading-snug">{placeDetail}</span>
          </div>
          {fomoLines.length ? (
            <p
              className="text-[11px] sm:text-xs text-amber-200/85 leading-snug max-w-md lg:text-right sl-live-pulse lg:shrink-0"
              aria-live="polite"
            >
              <span className="font-semibold text-amber-100/95">{t("wayfinding.stayInFlow")} </span>
              {fomoLines[fomoIdx]}
            </p>
          ) : null}
        </div>
        {nextStep ? (
          <p
            className="mt-2 text-[11px] sm:text-xs text-[var(--sl-fg-muted)] border-l-2 border-[var(--sl-border-strong)] pl-2.5 leading-relaxed max-w-3xl"
            role="note"
          >
            <span className="font-semibold text-[var(--sl-fg)]">{t("wayfinding.nextStep")} </span>
            {nextStep}
          </p>
        ) : null}
        <nav
          className="mt-1.5 flex flex-wrap gap-y-1 gap-x-0.5 text-[10px] sm:text-[11px]"
          aria-label={t("wayfinding.jumpAria")}
        >
          <span className="text-[var(--sl-fg-soft)] font-medium uppercase tracking-wide w-full sm:w-auto sm:mr-1 sm:pr-2 shrink-0">
            {t("wayfinding.goTo")}
          </span>
          {links.map(({ href, labelKey, descKey }) => {
            const active = pathname === href || (href !== "/" && pathname.startsWith(href));
            const label = t(`wayfinding.links.${labelKey}`);
            const desc = t(`wayfinding.links.${descKey}`);
            return (
              <Link
                key={href}
                href={href}
                title={desc}
                aria-current={active ? "page" : undefined}
                className={`sl-wayfinding-link inline-flex items-center rounded-md px-2 py-1 border transition-colors duration-150 ${
                  active
                    ? "border-white/25 bg-white/[0.08] text-white font-semibold"
                    : "border-transparent text-[var(--sl-fg-muted)] hover:text-white hover:bg-white/[0.05] hover:border-white/10"
                }`}
              >
                <span>{label}</span>
                <span className="hidden md:inline text-[var(--sl-fg-soft)] font-normal ml-1.5">({desc})</span>
              </Link>
            );
          })}
          <Link
            href="/compare"
            aria-current={pathname === "/compare" ? "page" : undefined}
            className={`sl-wayfinding-link inline-flex items-center rounded-md px-2 py-1 border transition-colors duration-150 ${
              pathname === "/compare"
                ? "border-white/25 bg-white/[0.08] text-white font-semibold"
                : "border-transparent text-[var(--sl-fg-muted)] hover:text-white hover:bg-white/[0.05] hover:border-white/10"
            }`}
            title={t("wayfinding.links.compareTitle")}
          >
            {t("wayfinding.links.compare")}
          </Link>
          <Link
            href="/portfolio"
            aria-current={pathname === "/portfolio" ? "page" : undefined}
            className={`sl-wayfinding-link inline-flex items-center rounded-md px-2 py-1 border transition-colors duration-150 ${
              pathname === "/portfolio"
                ? "border-white/25 bg-white/[0.08] text-white font-semibold"
                : "border-transparent text-[var(--sl-fg-muted)] hover:text-white hover:bg-white/[0.05] hover:border-white/10"
            }`}
            title={t("wayfinding.links.portfolioTitle")}
          >
            {t("wayfinding.links.portfolio")}
          </Link>
        </nav>
      </div>
    </div>
  );
}
