import Link from "next/link";
import { WalletButton } from "./WalletButton";
import { useRouter } from "next/router";
import { SearchBar } from "./SearchBar";
import { HealthBar } from "./HealthBar";
import { useEffect, useState } from "react";
import { Menu, X, Shield } from "lucide-react";

export function Navbar() {
  const router = useRouter();
  const isHome = router.pathname === "/";
  const [menuOpen, setMenuOpen] = useState(false);
  const [stalkerUnread, setStalkerUnread] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const refresh = () => setStalkerUnread(Number(localStorage.getItem("walletStalkerUnread") || 0));
    refresh();
    window.addEventListener("wallet-stalker-update", refresh);
    return () => window.removeEventListener("wallet-stalker-update", refresh);
  }, []);

  return (
    <nav className="fixed top-0 w-full z-50 bg-[#070709]/88 backdrop-blur-xl border-b border-white/[0.07] shadow-[0_8px_32px_rgba(0,0,0,0.35)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2 shrink-0 group rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#070709]">
          <span className="h-9 w-9 rounded-lg border border-white/15 bg-white/[0.04] flex items-center justify-center transition-colors group-hover:bg-white/[0.07] group-hover:border-white/25">
            <Shield className="text-gray-100" size={20} aria-hidden />
          </span>
          <span className="text-lg sm:text-xl font-bold tracking-tight text-white">
            Sentinel Ledger
          </span>
        </Link>

        <div className="sm:hidden ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Toggle menu"
            className="h-9 w-9 rounded-lg border border-white/10 bg-white/5 text-gray-200 inline-flex items-center justify-center"
          >
            {menuOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
          <WalletButton />
        </div>

        <div className="hidden sm:flex items-center gap-3 ml-auto min-w-0 flex-wrap justify-end">
          <HealthBar />
          <Link
            href="/"
            aria-current={router.pathname === "/" ? "page" : undefined}
            className={`text-sm transition-colors ${router.pathname === "/" ? "text-white font-semibold underline decoration-white/40 underline-offset-4" : "text-gray-300 hover:text-white"}`}
          >
            Dashboard
          </Link>
          <Link
            href="/results"
            aria-current={router.pathname === "/results" ? "page" : undefined}
            className={`text-sm transition-colors ${router.pathname === "/results" ? "text-white font-semibold underline decoration-white/40 underline-offset-4" : "text-gray-300 hover:text-white"}`}
          >
            Results
          </Link>
          <Link
            href="/scanner"
            aria-current={router.pathname === "/scanner" ? "page" : undefined}
            className={`text-sm transition-colors ${router.pathname === "/scanner" ? "text-white font-semibold underline decoration-white/40 underline-offset-4" : "text-gray-300 hover:text-white"}`}
          >
            Scanner
          </Link>
          <Link
            href="/smart-money"
            aria-current={router.pathname === "/smart-money" ? "page" : undefined}
            className={`text-sm transition-colors ${router.pathname === "/smart-money" ? "text-white font-semibold underline decoration-white/40 underline-offset-4" : "text-gray-300 hover:text-white"}`}
          >
            Smart Money
          </Link>
          <Link
            href="/alerts"
            aria-current={router.pathname === "/alerts" ? "page" : undefined}
            className={`text-sm transition-colors ${router.pathname === "/alerts" ? "text-white font-semibold underline decoration-white/40 underline-offset-4" : "text-gray-300 hover:text-white"}`}
          >
            Alerts
          </Link>
          <Link
            href="/pricing"
            aria-current={router.pathname === "/pricing" ? "page" : undefined}
            className={`text-sm transition-colors inline-flex items-center gap-1 ${router.pathname === "/pricing" ? "text-white font-semibold underline decoration-white/40 underline-offset-4" : "text-gray-300 hover:text-white"}`}
          >
            Pricing
            <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500 border border-white/15 rounded px-1 py-px">
              Pro
            </span>
          </Link>
          <Link
            href="/graveyard"
            aria-current={router.pathname === "/graveyard" ? "page" : undefined}
            className={`text-sm transition-colors ${router.pathname === "/graveyard" ? "text-white font-semibold underline decoration-white/40 underline-offset-4" : "text-gray-300 hover:text-white"}`}
          >
            Graveyard
          </Link>
          <Link
            href="/wallet-stalker"
            className="text-sm text-gray-300 hover:text-white inline-flex items-center gap-1.5"
            onClick={() => {
              if (typeof window !== "undefined") {
                localStorage.setItem("walletStalkerUnread", "0");
                setStalkerUnread(0);
              }
            }}
          >
            Wallet Stalker
            {stalkerUnread > 0 ? (
              <span className="inline-flex min-w-[18px] h-[18px] rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-[10px] items-center justify-center px-1">
                {Math.min(stalkerUnread, 99)}
              </span>
            ) : null}
          </Link>
          <Link
            href="/compare"
            aria-current={router.pathname === "/compare" ? "page" : undefined}
            className={`text-sm transition-colors ${router.pathname === "/compare" ? "text-white font-semibold underline decoration-white/40 underline-offset-4" : "text-gray-300 hover:text-white"}`}
          >
            Compare
          </Link>
          <Link
            href="/watchlist"
            aria-current={router.pathname === "/watchlist" ? "page" : undefined}
            className={`text-sm transition-colors ${router.pathname === "/watchlist" ? "text-white font-semibold underline decoration-white/40 underline-offset-4" : "text-gray-300 hover:text-white"}`}
          >
            Watchlist
          </Link>
          <Link
            href="/portfolio"
            aria-current={router.pathname === "/portfolio" ? "page" : undefined}
            className={`text-sm transition-colors ${router.pathname === "/portfolio" ? "text-white font-semibold underline decoration-white/40 underline-offset-4" : "text-gray-300 hover:text-white"}`}
          >
            Portfolio
          </Link>
          {!isHome && (
            <button
              type="button"
              onClick={() => router.push("/")}
              className="text-sm text-gray-400 hover:text-white transition-transform hover:scale-105"
            >
              New Search
            </button>
          )}
          <WalletButton />
        </div>
      </div>
      {menuOpen ? (
        <div className="sm:hidden border-t border-white/[0.06] bg-[#070709]/95 backdrop-blur-xl rounded-b-2xl mx-1 shadow-lg">
          <div className="px-4 py-4 flex flex-col gap-1">
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
                className="text-sm text-left text-gray-300 hover:text-white"
              >
                New Search
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {!isHome && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-2">
          <SearchBar />
        </div>
      )}
    </nav>
  );
}
