import Link from "next/link";
import { WalletButton } from "./WalletButton";
import { useRouter } from "next/router";
import { SearchBar } from "./SearchBar";
import { HealthBar } from "./HealthBar";
import { useLayoutEffect, useRef } from "react";
import { Shield } from "lucide-react";

export function Navbar() {
  const router = useRouter();
  const isHome = router.pathname === "/";
  const navRef = useRef(null);

  /** Real navbar height; used by <main> + WarLayout so content is not covered. */
  useLayoutEffect(() => {
    const el = navRef.current;
    if (typeof document === "undefined" || !el) return;
    const apply = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      if (h > 0) document.documentElement.style.setProperty("--sl-nav-actual", `${h}px`);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--sl-nav-actual");
    };
  }, []);

  return (
    <nav
      ref={navRef}
      data-sl-nav="slim"
      data-sentinel-build={process.env.NEXT_PUBLIC_GIT_SHA}
      className="fixed top-0 left-0 right-0 w-full z-50 bg-[#070709]/92 backdrop-blur-xl border-b border-white/[0.07] shadow-[0_4px_24px_rgba(0,0,0,0.35)]"
    >
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

          <div className="hidden sm:flex flex-1 min-w-0 items-center gap-2 h-full pl-1 overflow-hidden">
            <div className="min-w-0 flex-1 max-w-full">
              <SearchBar compact withRecents={isHome} />
            </div>
            <div className="shrink-0 max-w-[min(12rem,28vw)]">
              <HealthBar onlyBadge />
            </div>
          </div>

          <div className="hidden sm:flex shrink-0 items-center pl-0.5">
            <WalletButton />
          </div>

          <div className="sm:hidden ml-auto flex items-center gap-1.5 min-w-0">
            <div className="shrink-0 max-w-[5.5rem]">
              <HealthBar onlyBadge />
            </div>
            <WalletButton />
          </div>
        </div>

        {isHome ? (
          <div className="sm:hidden border-t border-white/[0.08] py-1.5 bg-[#070709]/98 backdrop-blur-md">
            <SearchBar compact withRecents />
          </div>
        ) : null}

        {!isHome ? (
          <div className="sm:hidden border-t border-white/[0.08] py-1.5 sm:py-2 bg-[#070709]/98 backdrop-blur-md relative z-[70]">
            <div className="min-w-0">
              <SearchBar compact />
            </div>
          </div>
        ) : null}
      </div>
    </nav>
  );
}
