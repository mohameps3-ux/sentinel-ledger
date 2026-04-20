import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { getNextSuggestedStep } from "../../lib/nextSuggestedStep";
import { useT } from "../../lib/i18n";

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

function normalizeQueryLang(query) {
  const raw = String(query?.lang || "").toLowerCase();
  if (raw === "es" || raw === "en") return raw;
  return null;
}

function detectLang(router) {
  const fromQuery = normalizeQueryLang(router.query);
  if (fromQuery) return fromQuery;
  if (typeof window !== "undefined") {
    const saved = window.localStorage.getItem("sentinel.lang");
    if (saved === "es" || saved === "en") return saved;
    const nav = String(window.navigator?.language || "").toLowerCase();
    if (nav.startsWith("es")) return "es";
  }
  return "en";
}

export function GlobalWayfinding() {
  const router = useRouter();
  const pathname = router.pathname || "/";
  const [lang, setLang] = useState("en");
  const tr = useT(lang);

  useEffect(() => {
    setLang(detectLang(router));
  }, [router.query?.lang, router.pathname]);

  const placeKey = useMemo(() => placeKeyForPath(pathname), [pathname]);
  const placeTitle = tr(`wayfinding.places.${placeKey}.title`);
  const placeDetail = tr(`wayfinding.places.${placeKey}.detail`);

  const nextStep = useMemo(() => getNextSuggestedStep(pathname, lang), [pathname, lang]);

  const fomoLines = useMemo(() => {
    const arr = tr("wayfinding.fomo");
    return Array.isArray(arr) && arr.length ? arr : [];
  }, [tr]);
  const [fomoIdx, setFomoIdx] = useState(0);

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
      lang={lang}
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-5 py-2 sm:py-2.5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
          <div className="min-w-0 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500 shrink-0">
              {tr("wayfinding.youAreHere")}
            </span>
            <span className="text-sm font-semibold text-white tracking-tight">{placeTitle}</span>
            <span className="text-gray-600 hidden sm:inline" aria-hidden>
              ·
            </span>
            <span className="text-xs text-gray-400 max-w-xl leading-snug">{placeDetail}</span>
          </div>
          {fomoLines.length ? (
            <p
              className="text-[11px] sm:text-xs text-amber-200/85 leading-snug max-w-md lg:text-right sl-live-pulse lg:shrink-0"
              aria-live="polite"
            >
              <span className="font-semibold text-amber-100/95">{tr("wayfinding.stayInFlow")} </span>
              {fomoLines[fomoIdx]}
            </p>
          ) : null}
        </div>
        {nextStep ? (
          <p
            className="mt-2 text-[11px] sm:text-xs text-gray-300 border-l-2 border-white/20 pl-2.5 leading-relaxed max-w-3xl"
            role="note"
          >
            <span className="font-semibold text-gray-100">{tr("wayfinding.nextStep")} </span>
            {nextStep}
          </p>
        ) : null}
        <nav
          className="mt-1.5 flex flex-wrap gap-y-1 gap-x-0.5 text-[10px] sm:text-[11px]"
          aria-label={tr("wayfinding.jumpAria")}
        >
          <span className="text-gray-500 font-medium uppercase tracking-wide w-full sm:w-auto sm:mr-1 sm:pr-2 shrink-0">
            {tr("wayfinding.goTo")}
          </span>
          {links.map(({ href, labelKey, descKey }) => {
            const active = pathname === href || (href !== "/" && pathname.startsWith(href));
            const label = tr(`wayfinding.links.${labelKey}`);
            const desc = tr(`wayfinding.links.${descKey}`);
            return (
              <Link
                key={href}
                href={href}
                title={desc}
                aria-current={active ? "page" : undefined}
                className={`sl-wayfinding-link inline-flex items-center rounded-md px-2 py-1 border transition-colors duration-150 ${
                  active
                    ? "border-white/25 bg-white/[0.08] text-white font-semibold"
                    : "border-transparent text-gray-300 hover:text-white hover:bg-white/[0.05] hover:border-white/10"
                }`}
              >
                <span>{label}</span>
                <span className="hidden md:inline text-gray-500 font-normal ml-1.5">({desc})</span>
              </Link>
            );
          })}
          <Link
            href="/compare"
            aria-current={pathname === "/compare" ? "page" : undefined}
            className={`sl-wayfinding-link inline-flex items-center rounded-md px-2 py-1 border transition-colors duration-150 ${
              pathname === "/compare"
                ? "border-white/25 bg-white/[0.08] text-white font-semibold"
                : "border-transparent text-gray-300 hover:text-white hover:bg-white/[0.05] hover:border-white/10"
            }`}
            title={tr("wayfinding.links.compareTitle")}
          >
            {tr("wayfinding.links.compare")}
          </Link>
          <Link
            href="/portfolio"
            aria-current={pathname === "/portfolio" ? "page" : undefined}
            className={`sl-wayfinding-link inline-flex items-center rounded-md px-2 py-1 border transition-colors duration-150 ${
              pathname === "/portfolio"
                ? "border-white/25 bg-white/[0.08] text-white font-semibold"
                : "border-transparent text-gray-300 hover:text-white hover:bg-white/[0.05] hover:border-white/10"
            }`}
            title={tr("wayfinding.links.portfolioTitle")}
          >
            {tr("wayfinding.links.portfolio")}
          </Link>
        </nav>
      </div>
    </div>
  );
}
