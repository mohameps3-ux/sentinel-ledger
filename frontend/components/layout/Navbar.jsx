import Link from "next/link";
import { WalletButton } from "./WalletButton";
import { useRouter } from "next/router";
import { SearchBar } from "./SearchBar";
import { LanguageMenu } from "./LanguageMenu";
import { useLocale } from "../../contexts/LocaleContext";
import { useLayoutEffect, useRef, useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { SentinelLogo } from "./SentinelLogo";
import { useWarMode } from "../../contexts/WarModeContext";

const PRIMARY_NAV = [
  { href: "/", label: "Home", match: "/" },
  { href: "/scanner", label: "Scanner", match: "/scanner" },
  { href: "/smart-money", label: "Smart Money", match: "/smart-money" },
  { href: "/alerts", label: "Alerts", match: "/alerts" },
  { href: "/graveyard", label: "Track Record", match: "/graveyard" }
];

export function Navbar() {
  const { t } = useLocale();
  const { isWarMode, toggleWarMode } = useWarMode();
  const router = useRouter();
  const isControlRoom = ["/ops", "/pricing", "/legal", "/privacy", "/terms", "/contact"].includes(router.pathname);
  const showTradingChrome = !isControlRoom;
  const navRef = useRef(null);
  const menuRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [router.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

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
      data-sl-ui="home-compact-v2"
      data-sentinel-build={process.env.NEXT_PUBLIC_GIT_SHA}
      className="fixed top-0 left-0 right-0 z-50 w-full border-b border-sl-border bg-sl-panel"
    >
      <div ref={menuRef} className="relative w-full">
        <div className="hidden h-13 min-w-0 items-center gap-0 px-4 md:flex">
          <div className="flex flex-shrink-0 items-center gap-6">
            <SentinelLogo />
            <div className="mx-3 h-5 w-px flex-shrink-0 self-stretch bg-sl-border" aria-hidden />
            <div className="flex items-center gap-0">
            {PRIMARY_NAV.map((item) => {
              const active = router.pathname === item.match;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                    className={`flex h-13 items-center border-b-2 px-4 font-mono text-xs uppercase tracking-wider no-underline transition-colors duration-150 ${
                    active
                        ? "border-sl-violet text-sl-text"
                        : "border-transparent text-sl-muted hover:text-sl-sub"
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                    {item.label.toUpperCase()}
                </Link>
              );
            })}
            </div>
          </div>

          <div className="flex flex-1 justify-center px-6">
            {showTradingChrome ? (
              <SearchBar compact navCommand formId="navbar-token-search" />
            ) : null}
          </div>

          <div className="flex flex-shrink-0 items-center gap-2">
            {showTradingChrome ? (
              <button type="submit" form="navbar-token-search" className="btn-primary">
                ANALYZE
              </button>
            ) : null}
            <button
              type="button"
              role="switch"
              aria-checked={isWarMode}
              aria-label={isWarMode ? "Disable war mode" : "Enable war mode"}
              onClick={toggleWarMode}
              className={isWarMode ? "btn-war-active" : "btn-war"}
            >
              WAR
            </button>
            <span className="badge-free">FREE</span>
            <LanguageMenu compact />
            <WalletButton navCompact />
          </div>
        </div>

        <div className="flex h-13 items-center justify-between px-4 md:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="text-sl-sub"
            aria-expanded={menuOpen}
            aria-haspopup="true"
            aria-label={t("layout.menu")}
            title={t("layout.menu")}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <span className="font-mono text-xs uppercase text-sl-text">SENTINEL LEDGER</span>
          <div className="w-6 overflow-hidden [&>div>span]:hidden">
            <SentinelLogo size={24} />
          </div>
        </div>

        {menuOpen ? (
          <>
            <div
              className="fixed inset-0 z-[90] bg-sl-root md:hidden"
              onClick={() => setMenuOpen(false)}
              aria-hidden
            />
            <div className="fixed inset-0 z-[100] bg-sl-root p-6 md:hidden">
              <div className="mb-6 flex items-center justify-between">
                <span className="font-mono text-xs uppercase text-sl-text">SENTINEL LEDGER</span>
                <button type="button" onClick={() => setMenuOpen(false)} className="btn-ghost-sm">
                  X
                </button>
              </div>
              <div className="flex flex-col">
                {PRIMARY_NAV.map((item) => {
                  const active = router.pathname === item.match;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => {
                        setMenuOpen(false);
                      }}
                      className={`flex w-full border-b-2 px-0 py-4 font-mono text-xs uppercase tracking-wider no-underline ${
                        active
                          ? "border-sl-violet text-sl-text"
                          : "border-transparent text-sl-muted hover:text-sl-sub"
                      }`}
                      aria-current={active ? "page" : undefined}
                    >
                      {item.label.toUpperCase()}
                    </Link>
                  );
                })}
              </div>
              <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between border-t border-sl-border pt-4">
                <WalletButton navCompact />
                <span className="badge-free">FREE</span>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </nav>
  );
}
