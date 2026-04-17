import Link from "next/link";
import { WalletButton } from "./WalletButton";
import { useRouter } from "next/router";
import { SearchBar } from "./SearchBar";
import { HealthBar } from "./HealthBar";

export function Navbar() {
  const router = useRouter();
  const isHome = router.pathname === "/";

  return (
    <nav className="fixed top-0 w-full z-50 bg-[#0B0E11]/80 backdrop-blur-md border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex justify-between items-center w-full sm:w-auto">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-xl font-black gradient-text whitespace-nowrap bg-gradient-to-r from-purple-500 to-blue-400 bg-clip-text text-transparent"
            >
              SENTINEL LEDGER
            </Link>
          </div>
          <div className="flex items-center gap-3 sm:hidden">
            {!isHome && (
              <button
                type="button"
                onClick={() => router.push("/")}
                className="text-xs text-gray-400 hover:text-white transition-transform hover:scale-105"
              >
                New
              </button>
            )}
            <WalletButton />
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-4">
          <HealthBar />
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
        {!isHome && (
          <div className="w-full sm:w-auto sm:min-w-[300px]">
            <SearchBar />
          </div>
        )}
      </div>
    </nav>
  );
}
