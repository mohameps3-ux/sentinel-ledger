import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";

const PRIMARY = [
  { href: "/", label: "Home", desc: "Feed + scan" },
  { href: "/scanner", label: "Scanner", desc: "Mint lookup" },
  { href: "/smart-money", label: "Smart money", desc: "Wallets + edge" },
  { href: "/watchlist", label: "Watchlist", desc: "Your tokens" },
  { href: "/alerts", label: "Alerts", desc: "Telegram / PRO" },
  { href: "/pricing", label: "Pricing", desc: "Plans" }
];

const FOMO_LINES = [
  "The live strip above keeps moving — refresh or you only see a snapshot.",
  "Next wallet cluster pass may surface a new ENTER before you come back.",
  "If you leave now, you miss the countdown on open entry windows.",
  "Smart-money ranks reorder as 24h PnL updates — stale view = stale decisions."
];

function placeForPath(pathname) {
  if (pathname === "/") return { title: "Home", detail: "Decision feed, scan, NLU bar" };
  if (pathname.startsWith("/token/")) return { title: "Token", detail: "Single-mint terminal" };
  if (pathname.startsWith("/wallet/")) return { title: "Wallet profile", detail: "Summary + narrative" };
  if (pathname === "/scanner") return { title: "Scanner", detail: "Paste a mint to open token" };
  if (pathname === "/smart-money") return { title: "Smart money", detail: "Leaderboard + wallet links" };
  if (pathname === "/results") return { title: "Results", detail: "Saved outcomes" };
  if (pathname === "/compare") return { title: "Compare", detail: "Two tokens side by side" };
  if (pathname === "/watchlist") return { title: "Watchlist", detail: "Tokens you track" };
  if (pathname === "/portfolio") return { title: "Portfolio", detail: "Watchlist markets" };
  if (pathname === "/alerts") return { title: "Alerts", detail: "Notifications setup" };
  if (pathname === "/pricing") return { title: "Pricing", detail: "Upgrade path" };
  if (pathname === "/graveyard") return { title: "Graveyard", detail: "Dead / rugged archive" };
  if (pathname === "/wallet-stalker") return { title: "Wallet stalker", detail: "Follow wallets" };
  if (pathname === "/ops") return { title: "Ops", detail: "Status + tools" };
  if (pathname === "/contact" || pathname === "/legal" || pathname === "/privacy" || pathname === "/terms") {
    return { title: "Legal / contact", detail: "Policies + support" };
  }
  return { title: "Sentinel", detail: "Use the links below to switch screen" };
}

export function GlobalWayfinding() {
  const router = useRouter();
  const pathname = router.pathname || "/";
  const place = useMemo(() => placeForPath(pathname), [pathname]);
  const [fomoIdx, setFomoIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setFomoIdx((i) => (i + 1) % FOMO_LINES.length);
    }, 14000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="border-b border-white/[0.08] bg-[#0c0c10]/95 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      data-sentinel-wayfinding="1"
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-5 py-2 sm:py-2.5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
          <div className="min-w-0 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500 shrink-0">
              You are here
            </span>
            <span className="text-sm font-semibold text-white tracking-tight">{place.title}</span>
            <span className="text-gray-600 hidden sm:inline" aria-hidden>
              ·
            </span>
            <span className="text-xs text-gray-400 max-w-xl leading-snug">{place.detail}</span>
          </div>
          <p
            className="text-[11px] sm:text-xs text-amber-200/85 leading-snug max-w-md lg:text-right sl-live-pulse lg:shrink-0"
            aria-live="polite"
          >
            <span className="font-semibold text-amber-100/95">Stay in flow: </span>
            {FOMO_LINES[fomoIdx]}
          </p>
        </div>
        <nav className="mt-1.5 flex flex-wrap gap-y-1 gap-x-0.5 text-[10px] sm:text-[11px]" aria-label="Jump to any tool">
          <span className="text-gray-500 font-medium uppercase tracking-wide w-full sm:w-auto sm:mr-1 sm:pr-2 shrink-0">
            Go to
          </span>
          {PRIMARY.map(({ href, label, desc }) => {
            const active = pathname === href || (href !== "/" && pathname.startsWith(href));
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
            title="Side-by-side tokens"
          >
            Compare
          </Link>
          <Link
            href="/portfolio"
            aria-current={pathname === "/portfolio" ? "page" : undefined}
            className={`sl-wayfinding-link inline-flex items-center rounded-md px-2 py-1 border transition-colors duration-150 ${
              pathname === "/portfolio"
                ? "border-white/25 bg-white/[0.08] text-white font-semibold"
                : "border-transparent text-gray-300 hover:text-white hover:bg-white/[0.05] hover:border-white/10"
            }`}
            title="Markets for watchlist"
          >
            Portfolio
          </Link>
        </nav>
      </div>
    </div>
  );
}
