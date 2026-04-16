import Link from "next/link";
import { WalletButton } from "./WalletButton";
import { useRouter } from "next/router";

export function Navbar() {
  const router = useRouter();
  const isHome = router.pathname === "/";
  return (
    <nav className="fixed top-0 w-full z-50 bg-[#0f0f0f]/80 backdrop-blur-md border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link
          href="/"
          className="text-xl font-black bg-gradient-to-r from-purple-500 to-blue-400 bg-clip-text text-transparent"
        >
          SENTINEL LEDGER
        </Link>
        <div className="flex items-center gap-6">
          {!isHome && (
            <button
              onClick={() => router.push("/")}
              className="text-sm text-gray-400 hover:text-white transition"
            >
              New Search
            </button>
          )}
          <WalletButton />
        </div>
      </div>
    </nav>
  );
}

