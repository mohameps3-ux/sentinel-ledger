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

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 w-full max-w-[100vw] bg-[#0B0E11]/95 backdrop-blur-xl border-b border-[#2a2f36]">
      <div className="max-w-[1400px] mx-auto px-3 sm:px-4 md:px-6">
        <div className="flex flex-wrap md:flex-nowrap items-center gap-y-2 gap-x-2 md:gap-4 min-h-[64px] md:h-20 py-2 md:py-0">
          <Link
            href="/"
            className="flex items-center gap-2 min-w-0 shrink-0 max-w-[min(100%,14rem)] sm:max-w-none md:max-w-[280px] text-base sm:text-lg md:text-xl font-black bg-gradient-to-r from-purple-500 to-blue-400 bg-clip-text text-transparent"
          >
            <Sparkles size={18} className="text-purple-400 shrink-0" />
            <span className="truncate leading-tight">
              <span className="md:hidden">Sentinel</span>
              <span className="hidden md:inline">SENTINEL LEDGER</span>
            </span>
          </Link>

          <form onSubmit={onSearch} className="hidden md:flex flex-1 min-w-0 max-w-xl relative items-center">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none z-10" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Solana token mint…"
              className="sl-input w-full h-11 pl-11 pr-[7.5rem] text-sm placeholder:text-gray-500 min-w-0"
            />
            <button type="submit" className="btn-pro btn-pro-sm absolute right-1.5 top-1/2 -translate-y-1/2">
              Analyze
            </button>
          </form>

          <div className="flex items-center gap-2 sm:gap-3 ml-auto shrink-0">
            <button
              type="button"
              onClick={() => setMobileSearchOpen((v) => !v)}
              className="md:hidden h-10 w-10 rounded-xl border border-[#2a2f36] text-gray-300 inline-flex items-center justify-center touch-manipulation"
              aria-label="Open search"
            >
              {mobileSearchOpen ? <X size={18} /> : <Search size={18} />}
            </button>
            <Link href="/terms" className="text-sm text-gray-400 hover:text-white transition hidden lg:block">
              Terms
            </Link>
            <Link href="/privacy" className="text-sm text-gray-400 hover:text-white transition hidden lg:block">
              Privacy
            </Link>
            <Link href="/compare" className="text-sm text-gray-400 hover:text-white transition hidden lg:block">
              Compare
            </Link>
            <Link href="/ops" className="text-sm text-gray-400 hover:text-white transition hidden lg:block">
              Ops
            </Link>
            <WalletButton />
          </div>
        </div>

        {mobileSearchOpen && (
          <div className="md:hidden pb-3 pt-1 border-t border-[#2a2f36]">
            <form onSubmit={onSearch} className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Paste mint address…"
                className="sl-input w-full h-11 pl-10 pr-[4.75rem] text-sm placeholder:text-gray-500"
              />
              <button
                type="submit"
                className="btn-pro btn-pro-sm absolute right-1.5 top-1/2 -translate-y-1/2 !py-2 !px-3 touch-manipulation"
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
