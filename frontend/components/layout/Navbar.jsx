import Link from "next/link";
import { WalletButton } from "./WalletButton";
import { useRouter } from "next/router";
import { SearchBar } from "./SearchBar";
import { APP_NAV_LINKS } from "./appNavConfig";
import { LanguageMenu } from "./LanguageMenu";
import { useLocale } from "../../contexts/LocaleContext";
import { useLayoutEffect, useRef, useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { SentinelLogo } from "./SentinelLogo";
import { WarModeToggle } from "../cockpit/WarModeToggle";

const PRIMARY_NAV = [
  { href: "/", label: "Home", match: "/" },
  { href: "/alerts", label: "Alerts", match: "/alerts" },
  { href: "/graveyard", label: "Track Record", match: "/graveyard" },
  { href: "/smart-money", label: "Smart Money", match: "/smart-money" },
  { href: "/scanner", label: "Scanner", match: "/scanner" }
];

const ALL_PAGES_SECTIONS = [
  {
    key: "main",
    title: "MAIN",
    links: [
      { href: "/", label: "Home" },
      { href: "/scanner", label: "Scanner" },
      { href: "/smart-money", label: "Smart Money" },
      { href: "/alerts", label: "Alerts" },
      { href: "/graveyard", label: "Track Record" }
    ]
  },
  {
    key: "analysis",
    title: "ANALYSIS",
    links: [
      { href: "/compare", label: "Compare" },
      { href: "/watchlist", label: "Watchlist" },
      { href: "/portfolio", label: "Portfolio" },
      { href: "/results", label: "Results" },
      { href: "/wallet-stalker", label: "Wallet Stalker" }
    ]
  },
  {
    key: "account",
    title: "ACCOUNT",
    links: [
      { href: "/pricing", label: "Pricing" },
      { href: "/contact", label: "Contact" }
    ]
  },
  {
    key: "system",
    title: "SYSTEM",
    links: [
      { href: "/ops", label: "Ops" },
      { href: "/legal", label: "Legal" },
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" }
    ]
  }
];

export function Navbar() {
  const { t } = useLocale();
  const router = useRouter();
  const isControlRoom = ["/ops", "/pricing", "/legal", "/privacy", "/terms", "/contact"].includes(router.pathname);
  const showTradingChrome = !isControlRoom;
  const navRef = useRef(null);
  const menuRef = useRef(null);
  const allPagesRef = useRef(null);
  const [stalkerUnread, setStalkerUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [allPagesOpen, setAllPagesOpen] = useState(false);

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
    setAllPagesOpen(false);
  }, [router.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  useEffect(() => {
    if (!allPagesOpen) return;
    const onDoc = (e) => {
      if (allPagesRef.current && !allPagesRef.current.contains(e.target)) setAllPagesOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [allPagesOpen]);

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
      className="fixed top-0 left-0 right-0 w-full z-50 border-b border-[rgba(255,255,255,0.06)] bg-[rgba(8,9,15,0.95)] backdrop-blur-md shadow-[0_4px_24px_rgba(0,0,0,0.35)]"
    >
      <div ref={menuRef} className="relative w-full">
        <div className="hidden sm:flex items-center justify-between w-full h-12 px-8">
          <div className="flex shrink-0 items-center gap-3 min-w-0">
            <SentinelLogo />
            <div ref={allPagesRef} className="relative">
              <button
                type="button"
                onClick={() => setAllPagesOpen((v) => !v)}
                className="h-8 w-8 flex items-center justify-center border border-sl-border bg-sl-card hover:border-sl-blue hover:text-sl-text text-sl-muted transition-colors duration-150"
                style={{ borderRadius: "2px" }}
                aria-expanded={allPagesOpen}
                aria-haspopup="true"
                aria-label="All pages"
                title="All pages"
              >
                <Menu size={16} aria-hidden />
              </button>
              {allPagesOpen ? (
                <div className="absolute left-0 top-full z-[100] mt-1 min-w-[240px] border border-sl-border bg-sl-panel py-2">
                  {ALL_PAGES_SECTIONS.map((section, si) => (
                    <div key={section.key}>
                      {si > 0 ? <div className="my-1 border-t border-sl-border" /> : null}
                      <div className="px-4 py-1 font-mono text-2xs text-sl-muted uppercase tracking-widest">
                        {section.title}
                      </div>
                      {section.links.map((link) => (
                        <Link
                          key={link.href}
                          href={link.href}
                          onClick={() => setAllPagesOpen(false)}
                          className="block px-4 py-1.5 font-mono text-xs text-sl-sub no-underline transition-colors duration-150 hover:bg-sl-card hover:text-sl-text"
                        >
                          {link.label}
                        </Link>
                      ))}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-1 min-w-0 justify-center items-center gap-5">
            <div className="flex items-center gap-1 min-w-0 overflow-x-auto">
              {PRIMARY_NAV.map((item) => {
                const active = router.pathname === item.match;
                const navLinkClass = `px-3 py-1 font-mono text-xs uppercase tracking-wider no-underline border-b-2 transition-colors whitespace-nowrap ${
                  active
                    ? "text-sl-text border-sl-blue"
                    : "text-sl-muted border-transparent hover:text-sl-sub"
                }`;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={navLinkClass}
                    aria-current={active ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
            <span className="sl-badge shrink-0 border-white/10 bg-white/[0.03] text-gray-500">v1.0 BETA</span>
          </div>

          <div className="flex shrink-0 items-center min-w-0">
            <div className="mr-2">
              <LanguageMenu compact />
            </div>
            {showTradingChrome ? (
              <div className="hidden lg:block shrink-0 min-w-[280px] max-w-[380px] mr-2">
                <SearchBar compact />
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.dispatchEvent(new CustomEvent("open-support-chat"));
                }
              }}
              className="mr-2 inline-flex h-7 items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 font-mono text-[10px] tracking-wider text-gray-400 transition-colors duration-150 hover:bg-white/[0.08] hover:text-white"
              title="Support"
            >
              HELP
            </button>
            <span className="mr-2 inline-flex h-7 items-center rounded-full border border-indigo-400/30 bg-indigo-500/15 px-2.5 font-mono text-[10px] font-bold tracking-[0.12em] text-indigo-100">
              FREE
            </span>
            <div className="mr-3">
              <WarModeToggle />
            </div>
            <div className="ml-2">
              <WalletButton navCompact />
            </div>
          </div>
        </div>

        <div className="sm:hidden flex h-12 items-center justify-between gap-1.5 px-6 sm:px-8">
            <div className="flex items-center gap-1 shrink-0 min-w-0">
              <SentinelLogo />
            </div>
            <div className="flex items-center gap-1 shrink-0 min-w-0">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="h-7 px-1.5 rounded-md border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] text-gray-200 inline-flex items-center gap-1"
                aria-expanded={menuOpen}
                aria-haspopup="true"
                aria-label={t("layout.menu")}
                title={t("layout.menu")}
              >
                {menuOpen ? <X size={12} /> : <Menu size={12} />}
              </button>
            </div>
        </div>

        {menuOpen ? (
          <>
            <div
              className="sm:hidden fixed inset-0 z-[210] bg-black/55 backdrop-blur-[1px]"
              onClick={() => setMenuOpen(false)}
              aria-hidden
            />
            <div className="sm:hidden fixed inset-0 z-[220] bg-[#08090f]/98 backdrop-blur-xl p-4">
              <div className="mb-5 flex items-center justify-between">
                <span className="font-mono text-sm font-extrabold tracking-[0.15em] text-white">SENTINEL</span>
                <button type="button" onClick={() => setMenuOpen(false)} className="h-8 w-8 rounded-md border border-white/10 text-gray-300">
                  <X size={16} className="mx-auto" />
                </button>
              </div>
              {showTradingChrome ? <SearchBar compact /> : null}
              <div className="mt-4 flex flex-col gap-1">
                {APP_NAV_LINKS.filter((it) => !it.isSecondary).map((item) => {
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
              <div className="mt-6">
                <p className="px-1 mb-2 text-[10px] font-mono font-semibold uppercase tracking-[0.18em] text-gray-500">
                  Information
                </p>
                <div className="flex flex-col gap-1">
                  {APP_NAV_LINKS.filter((it) => it.isSecondary).map((item) => {
                    const active = router.pathname === item.href;
                    return (
                      <Link
                        key={item.key}
                        href={item.href}
                        onClick={() => setMenuOpen(false)}
                        className={`text-[11px] px-2.5 py-1.5 rounded-md no-underline inline-flex items-center justify-between gap-2 ${
                          active
                            ? "text-white bg-white/[0.06]"
                            : "text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]"
                        }`}
                        aria-current={active ? "page" : undefined}
                      >
                        <span className="truncate">{t(`nav.${item.key}`)}</span>
                      </Link>
                    );
                  })}
                </div>
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
