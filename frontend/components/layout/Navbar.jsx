import Link from "next/link";
import { WalletButton } from "./WalletButton";
import { useRouter } from "next/router";
import { SearchBar } from "./SearchBar";
import { HealthBar } from "./HealthBar";
import { APP_NAV_LINKS } from "./appNavConfig";
import { LanguageMenu } from "./LanguageMenu";
import { useLocale } from "../../contexts/LocaleContext";
import { useLayoutEffect, useRef, useEffect, useState } from "react";
import { Home, Menu, Sparkles, X } from "lucide-react";

const PRIMARY_NAV = [
  { href: "/", label: "Home", match: "/" },
  { href: "/scanner", label: "Scanner", match: "/scanner" },
  { href: "/smart-money", label: "Smart Money", match: "/smart-money" },
  { href: "/graveyard", label: "Track Record", match: "/graveyard" },
  { href: "/alerts", label: "Alerts", match: "/alerts" }
];

export function Navbar() {
  const { t } = useLocale();
  const router = useRouter();
  const isHome = router.pathname === "/";
  const isControlRoom = ["/ops", "/pricing", "/legal", "/privacy", "/terms", "/contact"].includes(router.pathname);
  const showTradingChrome = !isControlRoom;
  const showHealthBadge = isHome || router.pathname === "/ops";
  const navRef = useRef(null);
  const menuRef = useRef(null);
  const [stalkerUnread, setStalkerUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  const clearStalker = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("walletStalkerUnread", "0");
      setStalkerUnread(0);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const refresh = () => setStalkerUnread(Number(localStorage.getItem("walletStalkerUnread") || 0));
    refresh();
    window.addEventListener("wallet-stalker-update", refresh);
    return () => window.removeEventListener("wallet-stalker-update", refresh);
  }, []);

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
      className="fixed top-0 left-0 right-0 w-full z-50 border-b border-[var(--sl-border)] bg-[rgba(7,8,15,0.95)] backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.35)]"
    >
      <div ref={menuRef} className="max-w-7xl mx-auto px-2 sm:px-4 relative">
        <div className="hidden sm:grid grid-cols-[auto_1fr_auto] items-center gap-3 min-h-12 h-12 min-w-0">
          <Link
            href="/"
            className="flex items-center gap-2 shrink-0 min-w-0 group rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-[#070709]"
          >
            <span className="h-8 w-8 rounded-md border border-[var(--sl-border-accent)] bg-[var(--sl-indigo-dim)] flex items-center justify-center transition-colors group-hover:bg-white/[0.07] shrink-0">
              <Sparkles className="text-cyan-200" size={16} aria-hidden />
            </span>
            <span className="font-mono text-sm font-extrabold tracking-[0.18em] text-white truncate">SENTINEL</span>
            <span className="sl-badge sl-badge-indigo hidden lg:inline-flex">v1.0 BETA</span>
          </Link>

          <div className="flex items-center justify-center gap-1 min-w-0">
            {PRIMARY_NAV.map((item) => {
              const active = router.pathname === item.match;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold no-underline transition ${
                    active
                      ? "bg-[var(--sl-indigo-dim)] text-[var(--sl-text-accent)]"
                      : "text-[var(--sl-text-secondary)] hover:bg-white/[0.04] hover:text-white"
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  {item.label}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="shrink-0 h-7 px-1.5 rounded-md border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] text-gray-200 inline-flex items-center gap-1"
              aria-expanded={menuOpen}
              aria-haspopup="true"
              aria-label={t("layout.menu")}
              title={t("layout.menu")}
            >
              <Home size={12} />
              {menuOpen ? <X size={12} /> : <Menu size={12} />}
            </button>
          </div>

          <div className="flex items-center justify-end gap-2 min-w-0">
            {showTradingChrome ? (
              isHome ? null : (
                <div className="hidden lg:block shrink-0 w-40 min-w-0">
                  <SearchBar compact />
                </div>
              )
            ) : (
              <div className="hidden lg:block truncate text-[11px] uppercase tracking-[0.18em] text-slate-500 font-semibold">
                Control room
              </div>
            )}
            <LanguageMenu />
            <HealthBar onlyBadge />
            <WalletButton />
          </div>
        </div>

        <div className="sm:hidden flex flex-col gap-1.5 py-1.5">
          <div className="flex items-center justify-between gap-1.5 min-w-0">
            <div className="flex items-center gap-1 shrink-0 min-w-0">
              <Link
                href="/"
                className="flex items-center gap-1 shrink-0 min-w-0 group rounded-lg focus:outline-none"
              >
                <span className="h-7 w-7 rounded-md border border-white/12 bg-white/[0.04] flex items-center justify-center shrink-0">
                  <Sparkles className="text-cyan-200" size={15} aria-hidden />
                </span>
                <span className="text-sm font-bold text-white truncate max-w-[7rem]">Sentinel</span>
              </Link>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="h-7 px-1.5 rounded-md border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] text-gray-200 inline-flex items-center gap-1"
                aria-expanded={menuOpen}
                aria-haspopup="true"
                aria-label={t("layout.menu")}
                title={t("layout.menu")}
              >
                <Home size={12} />
                {menuOpen ? <X size={12} /> : <Menu size={12} />}
              </button>
              <div className="shrink-0">
                <LanguageMenu />
              </div>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              {showHealthBadge ? (
                <div className="max-w-[3.5rem] shrink-0">
                  <HealthBar onlyBadge />
                </div>
              ) : null}
              <Link
                href="/graveyard"
                className="rounded-md border border-cyan-400/20 bg-cyan-400/[0.06] px-2 py-1 text-[10px] font-semibold text-cyan-100 no-underline"
              >
                Track
              </Link>
              <WalletButton />
            </div>
          </div>
          {showTradingChrome ? (
            isHome ? (
              <SearchBar headerMicro withRecents />
            ) : (
              <SearchBar compact />
            )
          ) : (
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold">
              Control room
            </div>
          )}
        </div>

        {menuOpen ? (
          <>
            <div
              className="sm:hidden fixed inset-0 z-[210] bg-black/55 backdrop-blur-[1px]"
              onClick={() => setMenuOpen(false)}
              aria-hidden
            />
            <div className="sm:hidden fixed left-0 top-0 bottom-0 z-[220] w-[min(17rem,88vw)] border-r border-white/10 bg-[#0a0c0f]/98 backdrop-blur-xl shadow-2xl shadow-black/60 p-2.5">
              <p className="text-[9px] uppercase tracking-wider text-gray-500 font-semibold px-2 pb-1.5">
                {t("layout.menu")}
              </p>
              <div className="flex flex-col gap-1">
                {APP_NAV_LINKS.map((item) => {
                  const active = item.key === "pricing" ? router.pathname === "/pricing" : router.pathname === item.href;
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      onClick={() => {
                        if (item.isStalker) clearStalker();
                        setMenuOpen(false);
                      }}
                      className={`text-xs px-2.5 py-2 rounded-md border no-underline inline-flex items-center justify-between gap-2 ${
                        active
                          ? "text-white border-white/20 bg-white/[0.08]"
                          : "text-gray-300 border-transparent hover:border-white/10 hover:bg-white/[0.05]"
                      }`}
                      aria-current={active ? "page" : undefined}
                    >
                      <span className="truncate">{t(`nav.${item.key}`)}</span>
                      {item.isStalker && stalkerUnread > 0 ? (
                        <span className="inline-flex min-w-[16px] h-4 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-[9px] items-center justify-center px-0.5">
                          {Math.min(stalkerUnread, 99)}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className="hidden sm:block absolute left-2 sm:left-4 top-[calc(100%-0.25rem)] z-[220] w-[min(15rem,calc(100vw-1rem))] rounded-xl border border-white/10 bg-[#0a0c0f]/98 backdrop-blur-xl shadow-2xl shadow-black/50 p-2">
              <p className="text-[9px] uppercase tracking-wider text-gray-500 font-semibold px-2 pb-1">
                {t("layout.menu")}
              </p>
              <div className="flex flex-col gap-1">
                {APP_NAV_LINKS.map((item) => {
                  const active = item.key === "pricing" ? router.pathname === "/pricing" : router.pathname === item.href;
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      onClick={() => {
                        if (item.isStalker) clearStalker();
                        setMenuOpen(false);
                      }}
                      className={`text-xs px-2 py-1.5 rounded-md border no-underline inline-flex items-center justify-between gap-2 ${
                        active
                          ? "text-white border-white/20 bg-white/[0.08]"
                          : "text-gray-300 border-transparent hover:border-white/10 hover:bg-white/[0.05]"
                      }`}
                      aria-current={active ? "page" : undefined}
                    >
                      <span className="truncate">{t(`nav.${item.key}`)}</span>
                      {item.isStalker && stalkerUnread > 0 ? (
                        <span className="inline-flex min-w-[16px] h-4 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-[9px] items-center justify-center px-0.5">
                          {Math.min(stalkerUnread, 99)}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </nav>
  );
}
