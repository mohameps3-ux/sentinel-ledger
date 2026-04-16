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
    <nav className="fixed top-0 w-full z-50 bg-[#0B0E11]/92 backdrop-blur-xl border-b border-[#2a2f36]">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 h-[72px] md:h-20 flex items-center justify-between gap-4">
        <Link
          href="/"
          className="flex items-center gap-2 text-lg md:text-xl font-black bg-gradient-to-r from-purple-500 to-blue-400 bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(129,140,248,0.35)]"
        >
          <Sparkles size={18} className="text-purple-400" />
          SENTINEL LEDGER
        </Link>

        <form onSubmit={onSearch} className="hidden md:flex flex-1 max-w-xl relative items-center gap-2">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none z-10" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Solana token mint…"
            className="sl-input w-full h-11 pl-11 pr-[7.5rem] text-sm placeholder:text-gray-500"
          />
          <button
            type="submit"
            className="btn-pro btn-pro-sm absolute right-1.5 top-1/2 -translate-y-1/2"
          >
            Analyze
          </button>
        </form>

        <div className="flex items-center gap-3 md:gap-5">
          <button
            onClick={() => setMobileSearchOpen((v) => !v)}
            className="md:hidden h-10 w-10 rounded-xl border soft-divider text-gray-300 inline-flex items-center justify-center"
            title="Search token"
          >
            {mobileSearchOpen ? <X size={16} /> : <Search size={16} />}
          </button>
          <Link href="/terms" className="text-sm text-gray-400 hover:text-white transition hidden sm:block">
            Terms
          </Link>
          <Link href="/privacy" className="text-sm text-gray-400 hover:text-white transition hidden sm:block">
            Privacy
          </Link>
          <Link href="/compare" className="text-sm text-gray-400 hover:text-white transition hidden sm:block">
            Compare
          </Link>
          <Link href="/ops" className="text-sm text-gray-400 hover:text-white transition hidden sm:block">
            Ops
          </Link>
          <WalletButton />
        </div>
      </div>
      {mobileSearchOpen && (
        <div className="md:hidden px-4 pb-3">
          <form onSubmit={onSearch} className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search token mint…"
              className="sl-input w-full h-10 pl-9 pr-[4.5rem] text-sm placeholder:text-gray-500"
            />
            <button type="submit" className="btn-pro btn-pro-sm absolute right-1.5 top-1/2 -translate-y-1/2 !py-1.5 !px-3">
              Go
            </button>
          </form>
        </div>
      )}
    </nav>
  );
}

