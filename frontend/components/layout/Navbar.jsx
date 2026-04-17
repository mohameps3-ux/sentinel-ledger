import Link from "next/link";
import { WalletButton } from "./WalletButton";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { Search, Sparkles, X } from "lucide-react";
import toast from "react-hot-toast";

export function Navbar() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const inputRef = useRef(null);

  const onSearch = (e) => {
    e.preventDefault();
    const value = query.trim();
    if (value.length < 32) {
      toast.error("Enter a valid token mint address.");
      return;
    }
    router.push(`/token/${value}`);
    setQuery("");
    setMobileSearchOpen(false);
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const isHome = router.pathname === "/";

  return (
    <nav
      translate="no"
      className="fixed top-0 left-0 right-0 z-[100] w-full max-w-[100vw] bg-[#0B0E11]/95 backdrop-blur-xl border-b border-[#2a2f36]"
    >
      <div className="max-w-[1400px] mx-auto px-3 sm:px-4 md:px-6 min-w-0">
        {/* Three columns: brand | search (grows) | actions — avoids wallet overlapping the input */}
        <div className="flex flex-nowrap items-center justify-between md:justify-start w-full min-w-0 min-h-[56px] md:min-h-[72px] py-2 md:py-2.5 gap-2 sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-3 shrink-0 min-w-0">
            <Link
              href="/"
              className="flex items-center gap-1.5 sm:gap-2 min-w-0 max-w-[min(200px,46vw)] md:max-w-[min(280px,36vw)] text-sm sm:text-base md:text-xl font-black bg-gradient-to-r from-purple-500 to-blue-400 bg-clip-text text-transparent"
            >
              <Sparkles size={17} className="text-purple-400 shrink-0 sm:w-[18px] sm:h-[18px]" />
              <span className="truncate min-w-0 text-left leading-tight">
                <span className="md:hidden">Sentinel</span>
                <span className="hidden md:inline">SENTINEL LEDGER</span>
              </span>
            </Link>
            {!isHome ? (
              <button
                type="button"
                onClick={() => router.push("/")}
                className="hidden sm:inline-flex text-xs md:text-sm text-gray-400 hover:text-white transition shrink-0 touch-manipulation"
              >
                New search
              </button>
            ) : null}
          </div>

          <div className="hidden md:flex flex-1 min-w-0 justify-center px-2">
            <form onSubmit={onSearch} className="w-full max-w-xl relative flex items-center min-w-0">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none z-10" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Solana mint address…"
                autoComplete="off"
                spellCheck={false}
                className="sl-input w-full h-11 pl-11 pr-[7.5rem] text-sm placeholder:text-gray-500 min-w-0"
              />
              <button type="submit" className="btn-pro btn-pro-sm absolute right-1.5 top-1/2 -translate-y-1/2 shrink-0">
                Analyze
              </button>
            </form>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 md:shrink min-w-0 justify-end md:ml-auto">
            <button
              type="button"
              onClick={() => setMobileSearchOpen((v) => !v)}
              className="md:hidden h-10 w-10 shrink-0 rounded-xl border border-[#2a2f36] text-gray-300 inline-flex items-center justify-center touch-manipulation z-[1]"
              aria-label="Open search"
            >
              {mobileSearchOpen ? <X size={18} /> : <Search size={18} />}
            </button>
            <Link href="/terms" className="text-sm text-gray-400 hover:text-white transition hidden lg:block shrink-0">
              Terms
            </Link>
            <Link href="/privacy" className="text-sm text-gray-400 hover:text-white transition hidden lg:block shrink-0">
              Privacy
            </Link>
            <Link href="/compare" className="text-sm text-gray-400 hover:text-white transition hidden lg:block shrink-0">
              Compare
            </Link>
            <Link href="/ops" className="text-sm text-gray-400 hover:text-white transition hidden lg:block shrink-0">
              Ops
            </Link>
            <WalletButton />
          </div>
        </div>

        {mobileSearchOpen && (
          <div className="md:hidden pb-3 pt-2 border-t border-[#2a2f36]">
            <form onSubmit={onSearch} className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Solana mint address…"
                autoComplete="off"
                spellCheck={false}
                className="sl-input w-full h-11 pl-10 pr-[4.75rem] text-sm placeholder:text-gray-500"
              />
              <button
                type="submit"
                className="btn-pro btn-pro-sm absolute right-1.5 top-1/2 -translate-y-1/2 !py-2 !px-3 touch-manipulation shrink-0"
              >
                Go
              </button>
            </form>
          </div>
        )}
      </div>
    </nav>
  );
}
