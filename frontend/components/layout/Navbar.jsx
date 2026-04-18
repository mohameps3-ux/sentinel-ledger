import Link from "next/link";
import { WalletButton } from "./WalletButton";
import { useRouter } from "next/router";
import { SearchBar } from "./SearchBar";
import { HealthBar } from "./HealthBar";
import { useState } from "react";
import { Menu, X, Shield } from "lucide-react";

export function Navbar() {
  const router = useRouter();
  const isHome = router.pathname === "/";
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="fixed top-0 w-full z-50 bg-[#0B0B0E]/90 backdrop-blur-md border-b border-white/[0.06]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2 shrink-0 group">
          <span className="h-9 w-9 rounded-lg bg-emerald-500/15 border border-emerald-500/35 flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.25)] group-hover:shadow-[0_0_28px_rgba(16,185,129,0.45)] transition-shadow">
            <Shield className="text-emerald-400" size={20} aria-hidden />
          </span>
          <span className="text-lg sm:text-xl font-black tracking-tight bg-gradient-to-r from-emerald-300 via-white to-cyan-300 bg-clip-text text-transparent">
            SENTINEL LEDGER
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

        <div className="hidden sm:flex items-center gap-4 ml-auto min-w-0">
          <HealthBar />
          <Link href="/" className="text-sm text-gray-200 hover:text-white">
            Dashboard
          </Link>
          <Link href="/results" className="text-sm text-gray-300 hover:text-white">
            Results
          </Link>
          <Link href="/scanner" className="text-sm text-gray-300 hover:text-white">
            Scanner
          </Link>
          <Link href="/smart-money" className="text-sm text-gray-300 hover:text-white">
            Smart Money
          </Link>
          <Link href="/alerts" className="text-sm text-cyan-300 hover:text-cyan-200">
            Alerts
          </Link>
          <Link href="/pricing" className="text-sm text-purple-300 hover:text-purple-200">
            Pricing
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
        <div className="sm:hidden border-t border-white/[0.06] bg-[#0B0B0E]/98 backdrop-blur-md">
          <div className="px-4 py-3 flex flex-col gap-3">
            <Link href="/" onClick={() => setMenuOpen(false)} className="text-sm text-gray-200">
              Dashboard
            </Link>
            <Link href="/results" onClick={() => setMenuOpen(false)} className="text-sm text-gray-300">
              Results
            </Link>
            <Link href="/scanner" onClick={() => setMenuOpen(false)} className="text-sm text-gray-300">
              Scanner
            </Link>
            <Link href="/smart-money" onClick={() => setMenuOpen(false)} className="text-sm text-gray-300">
              Smart Money
            </Link>
            <Link href="/alerts" onClick={() => setMenuOpen(false)} className="text-sm text-cyan-300">
              Alerts
            </Link>
            <Link href="/pricing" onClick={() => setMenuOpen(false)} className="text-sm text-purple-300">
              Pricing
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
