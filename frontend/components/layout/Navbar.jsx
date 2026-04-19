import Link from "next/link";
import { WalletButton } from "./WalletButton";
import { useRouter } from "next/router";
import { SearchBar } from "./SearchBar";
import { HealthBar } from "./HealthBar";
import { useEffect, useState } from "react";
import { Menu, X, Shield } from "lucide-react";

function navLinkClass(active) {
  const base =
    "whitespace-nowrap text-[11px] sm:text-xs transition-colors rounded-md px-1.5 py-1 shrink-0 border border-transparent";
  return active
    ? `${base} text-white font-semibold bg-white/[0.08] border-white/15`
    : `${base} text-gray-400 hover:text-white hover:bg-white/[0.04]`;
}

export function Navbar() {
  const router = useRouter();
  const isHome = router.pathname === "/";
  const p = router.pathname || "";
  const [menuOpen, setMenuOpen] = useState(false);
  const [stalkerUnread, setStalkerUnread] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const refresh = () => setStalkerUnread(Number(localStorage.getItem("walletStalkerUnread") || 0));
    refresh();
    window.addEventListener("wallet-stalker-update", refresh);
    return () => window.removeEventListener("wallet-stalker-update", refresh);
  }, []);

  const desktopLinks = (
    <>
      <div className="shrink-0 pr-1 border-r border-white/[0.08] mr-1 hidden md:flex items-center">
        <HealthBar />
      </div>
      <Link href="/" aria-current={p === "/" ? "page" : undefined} className={navLinkClass(p === "/")}>
        Dashboard
      </Link>
      <Link href="/results" aria-current={p === "/results" ? "page" : undefined} className={navLinkClass(p === "/results")}>
        Results
      </Link>
      <Link href="/scanner" aria-current={p === "/scanner" ? "page" : undefined} className={navLinkClass(p === "/scanner")}>
        Scanner
      </Link>
      <Link
        href="/smart-money"
        aria-current={p === "/smart-money" ? "page" : undefined}
        className={navLinkClass(p === "/smart-money")}
      >
        Smart Money
      </Link>
      <Link href="/alerts" aria-current={p === "/alerts" ? "page" : undefined} className={navLinkClass(p === "/alerts")}>
        Alerts
      </Link>
      <Link href="/pricing" aria-current={p === "/pricing" ? "page" : undefined} className={`${navLinkClass(p === "/pricing")} inline-flex items-center gap-1`}>
        Pricing
        <span className="text-[8px] font-bold uppercase tracking-wider text-gray-500 border border-white/12 rounded px-0.5 leading-none py-0.5">
          Pro
        </span>
      </Link>
      <Link href="/graveyard" aria-current={p === "/graveyard" ? "page" : undefined} className={navLinkClass(p === "/graveyard")}>
        Graveyard
      </Link>
      <Link
        href="/wallet-stalker"
        className={`${navLinkClass(false)} inline-flex items-center gap-1`}
        onClick={() => {
          if (typeof window !== "undefined") {
            localStorage.setItem("walletStalkerUnread", "0");
            setStalkerUnread(0);
          }
        }}
      >
        Stalker
        {stalkerUnread > 0 ? (
          <span className="inline-flex min-w-[16px] h-[16px] rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-[9px] items-center justify-center px-0.5">
            {Math.min(stalkerUnread, 99)}
          </span>
        ) : null}
      </Link>
      <Link href="/compare" aria-current={p === "/compare" ? "page" : undefined} className={navLinkClass(p === "/compare")}>
        Compare
      </Link>
      <Link href="/watchlist" aria-current={p === "/watchlist" ? "page" : undefined} className={navLinkClass(p === "/watchlist")}>
        Watchlist
      </Link>
      <Link href="/portfolio" aria-current={p === "/portfolio" ? "page" : undefined} className={navLinkClass(p === "/portfolio")}>
        Portfolio
      </Link>
      {!isHome ? (
        <button
          type="button"
          onClick={() => router.push("/")}
          className="whitespace-nowrap text-[11px] sm:text-xs text-gray-500 hover:text-white px-1.5 py-1 rounded-md hover:bg-white/[0.04] shrink-0"
        >
          New search
        </button>
      ) : null}
    </>
  );

  return (
    <nav className="fixed top-0 w-full z-50 bg-[#070709]/92 backdrop-blur-xl border-b border-white/[0.07] shadow-[0_4px_24px_rgba(0,0,0,0.35)]">
      <div className="max-w-7xl mx-auto px-3 sm:px-5">
        <div className="flex items-center gap-2 h-12 sm:h-[3.25rem] min-h-12">
          <Link
            href="/"
            className="flex items-center gap-1.5 sm:gap-2 shrink-0 min-w-0 group rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-[#070709]"
          >
            <span className="h-8 w-8 rounded-md border border-white/12 bg-white/[0.04] flex items-center justify-center transition-colors group-hover:bg-white/[0.07] shrink-0">
              <Shield className="text-gray-100" size={17} aria-hidden />
            </span>
            <span className="text-[15px] sm:text-base font-bold tracking-tight text-white truncate max-w-[9rem] min-[400px]:max-w-[11rem] sm:max-w-none">
              Sentinel Ledger
            </span>
          </Link>

          <div className="sm:hidden ml-auto flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Toggle menu"
              className="h-8 w-8 rounded-md border border-white/10 bg-white/5 text-gray-200 inline-flex items-center justify-center"
            >
              {menuOpen ? <X size={15} /> : <Menu size={15} />}
            </button>
            {isHome ? <WalletButton /> : null}
          </div>

          <div className="hidden sm:flex flex-1 min-w-0 items-center gap-1.5 h-full pl-1 overflow-hidden">
            <div className="flex flex-1 min-w-0 overflow-x-auto overflow-y-hidden items-center gap-x-1.5 py-1 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.15)_transparent]">
              {desktopLinks}
            </div>
          </div>

          <div className="hidden sm:flex shrink-0 items-center pl-0.5">
            <WalletButton />
          </div>
        </div>

        {!isHome ? (
          <div className="border-t border-white/[0.08] py-1.5 sm:py-2 bg-[#070709]/98 backdrop-blur-md relative z-[70]">
            <div className="flex flex-row items-center gap-2">
              <div className="min-w-0 flex-1">
                <SearchBar compact />
              </div>
              <div className="shrink-0 sm:hidden flex items-center">
                <WalletButton />
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {menuOpen ? (
        <div className="sm:hidden border-t border-white/[0.06] bg-[#070709]/98 backdrop-blur-xl mx-0 shadow-lg max-h-[min(70vh,28rem)] overflow-y-auto">
          <div className="px-3 py-3 flex flex-col gap-0.5">
            <div className="pb-2 mb-2 border-b border-white/[0.06]">
              <HealthBar />
            </div>
            <Link href="/" onClick={() => setMenuOpen(false)} className="text-sm text-gray-200 py-2 rounded-lg px-2 hover:bg-white/[0.04]">
              Dashboard
            </Link>
            <Link href="/results" onClick={() => setMenuOpen(false)} className="text-sm text-gray-300 py-2 rounded-lg px-2 hover:bg-white/[0.04]">
              Results
            </Link>
            <Link href="/scanner" onClick={() => setMenuOpen(false)} className="text-sm text-gray-300 py-2 rounded-lg px-2 hover:bg-white/[0.04]">
              Scanner
            </Link>
            <Link href="/smart-money" onClick={() => setMenuOpen(false)} className="text-sm text-gray-300 py-2 rounded-lg px-2 hover:bg-white/[0.04]">
              Smart Money
            </Link>
            <Link href="/compare" onClick={() => setMenuOpen(false)} className="text-sm text-gray-300 py-2 rounded-lg px-2 hover:bg-white/[0.04]">
              Compare
            </Link>
            <Link href="/watchlist" onClick={() => setMenuOpen(false)} className="text-sm text-gray-300 py-2 rounded-lg px-2 hover:bg-white/[0.04]">
              Watchlist
            </Link>
            <Link href="/portfolio" onClick={() => setMenuOpen(false)} className="text-sm text-gray-300 py-2 rounded-lg px-2 hover:bg-white/[0.04]">
              Portfolio
            </Link>
            <Link href="/alerts" onClick={() => setMenuOpen(false)} className="text-sm text-gray-200 py-2 rounded-lg px-2 hover:bg-white/[0.04]">
              Alerts
            </Link>
            <Link href="/pricing" onClick={() => setMenuOpen(false)} className="text-sm text-gray-200 py-2 rounded-lg px-2 hover:bg-white/[0.04] inline-flex items-center gap-2">
              Pricing
              <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500 border border-white/15 rounded px-1">Pro</span>
            </Link>
            <Link href="/graveyard" onClick={() => setMenuOpen(false)} className="text-sm text-gray-300 py-2 rounded-lg px-2 hover:bg-white/[0.04]">
              Graveyard
            </Link>
            <Link href="/wallet-stalker" onClick={() => setMenuOpen(false)} className="text-sm text-gray-300 py-2 rounded-lg px-2 hover:bg-white/[0.04]">
              Wallet Stalker
            </Link>
            {!isHome ? (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  router.push("/");
                }}
                className="text-sm text-left text-gray-300 hover:text-white py-2 px-2 rounded-lg hover:bg-white/[0.04]"
              >
                New search
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </nav>
  );
}
