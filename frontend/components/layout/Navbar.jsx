import Link from "next/link";
import { WalletButton } from "./WalletButton";
import { useRouter } from "next/router";
import { useState } from "react";
import { Search, Sparkles } from "lucide-react";
import toast from "react-hot-toast";

export function Navbar() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const onSearch = (e) => {
    e.preventDefault();
    const value = query.trim();
    if (value.length < 32) {
      toast.error("Enter a valid token mint address.");
      return;
    }
    router.push(`/token/${value}`);
    setQuery("");
  };

  return (
    <nav className="fixed top-0 w-full z-50 bg-[#0B0E11]/90 backdrop-blur-xl border-b soft-divider">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 h-20 flex items-center justify-between gap-4">
        <Link
          href="/"
          className="flex items-center gap-2 text-lg md:text-xl font-black bg-gradient-to-r from-purple-500 to-blue-400 bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(129,140,248,0.35)]"
        >
          <Sparkles size={18} className="text-purple-400" />
          SENTINEL LEDGER
        </Link>

        <form onSubmit={onSearch} className="hidden md:flex flex-1 max-w-xl relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Solana token mint..."
            className="w-full h-11 rounded-xl bg-[#13171A] border soft-divider pl-11 pr-28 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-purple-500 transition"
          />
          <button className="absolute right-1.5 top-1.5 h-8 px-4 rounded-lg text-xs font-semibold bg-gradient-to-r from-purple-600 to-blue-600 hover:opacity-90 transition">
            Analyze
          </button>
        </form>

        <div className="flex items-center gap-3 md:gap-5">
          <Link href="/terms" className="text-sm text-gray-400 hover:text-white transition hidden sm:block">
            Terms
          </Link>
          <Link href="/privacy" className="text-sm text-gray-400 hover:text-white transition hidden sm:block">
            Privacy
          </Link>
          <WalletButton />
        </div>
      </div>
    </nav>
  );
}

