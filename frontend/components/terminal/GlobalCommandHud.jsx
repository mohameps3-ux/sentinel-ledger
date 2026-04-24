import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bolt, Command, Crosshair, LineChart, Loader2, Search, Star, X } from "lucide-react";
import toast from "react-hot-toast";
import { useLocale } from "../../contexts/LocaleContext";
import { getPublicApiUrl } from "../../lib/publicRuntime";
import {
  buildDexscreenerSolanaTokenUrl,
  buildJupiterSwapUrl,
  EXTERNAL_ANCHOR_REL,
  isValidSolanaAddress,
  sanitizeAddressInput
} from "../../lib/terminalLinks";
import { isProbableSolanaMint } from "../../lib/solanaMint.mjs";

const WATCHLIST_CACHE_KEY = "sentinel-watchlist-cache";
const CONTROL_ROOM_PATHS = new Set(["/ops", "/pricing", "/legal", "/privacy", "/terms", "/contact"]);

function shortAddress(value = "") {
  return value ? `${value.slice(0, 4)}…${value.slice(-4)}` : "none";
}

function readWatchlistCache() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(WATCHLIST_CACHE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeWatchlistCache(next) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WATCHLIST_CACHE_KEY, JSON.stringify(next.slice(0, 40)));
}

function contextFromRouter(router) {
  const path = router.pathname || "";
  const q = router.query || {};
  if (path === "/token/[address]" && typeof q.address === "string") {
    return { mode: "token", address: sanitizeAddressInput(q.address), source: "token page" };
  }
  if (path === "/" && typeof q.t === "string") {
    return { mode: "token", address: sanitizeAddressInput(q.t), source: "radar desk" };
  }
  if (path === "/wallet/[address]" && typeof q.address === "string") {
    return { mode: "wallet", address: sanitizeAddressInput(q.address), source: "wallet page" };
  }
  return { mode: "token", address: "", source: CONTROL_ROOM_PATHS.has(path) ? "control room" : "global" };
}

export function GlobalCommandHud() {
  const router = useRouter();
  const { t } = useLocale();
  const inlineRef = useRef(null);
  const paletteRef = useRef(null);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("token");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [watchlist, setWatchlist] = useState([]);
  const [freshness, setFreshness] = useState({ state: "STALE", label: "Stale", hint: "checking" });

  const routeContext = useMemo(() => contextFromRouter(router), [router.pathname, router.query]);

  useEffect(() => {
    setWatchlist(readWatchlistCache());
  }, []);

  useEffect(() => {
    if (routeContext.mode) setMode(routeContext.mode);
    if (routeContext.address) setQuery(routeContext.address);
  }, [routeContext.mode, routeContext.address]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
        setTimeout(() => paletteRef.current?.focus(), 30);
      }
      if (e.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`${getPublicApiUrl()}/health/sync`, { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!alive || !res.ok) return;
        const ageMs = Math.max(0, Date.now() - Number(json.measuredAt || Date.now()));
        const degraded = json.status === "DEGRADED" || json.services?.market_data === "degraded";
        const state = degraded ? "DEGRADED" : ageMs > 60_000 ? "STALE" : "LIVE";
        setFreshness({
          state,
          label: state === "LIVE" ? "Live" : state === "STALE" ? "Stale" : "Degraded",
          hint: `${Math.round(ageMs / 1000)}s`
        });
      } catch {
        if (alive) setFreshness({ state: "DEGRADED", label: "Degraded", hint: "offline" });
      }
    };
    load();
    const id = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const target = sanitizeAddressInput(query || routeContext.address || "");
  const targetIsAddress = Boolean(target && isValidSolanaAddress(target));
  const targetIsMint = Boolean(target && isProbableSolanaMint(target) && targetIsAddress);
  const isFollowing = targetIsMint && watchlist.includes(target);
  const isControlRoom = CONTROL_ROOM_PATHS.has(router.pathname || "");
  const jupUrl = targetIsMint ? buildJupiterSwapUrl(target) : "#";
  const dexUrl = targetIsMint ? buildDexscreenerSolanaTokenUrl(target) : "#";
  const deskUrl = targetIsMint ? `/token/${encodeURIComponent(target)}` : "#";
  const walletUrl = targetIsAddress ? `/wallet/${encodeURIComponent(target)}` : "#";
  const freshnessTone =
    freshness.state === "LIVE" ? "bg-emerald-400" : freshness.state === "STALE" ? "bg-amber-400" : "bg-red-400";

  const go = () => {
    if (!targetIsAddress) {
      toast.error("Paste a valid Solana mint or wallet.");
      return;
    }
    const href = mode === "wallet" ? walletUrl : deskUrl;
    void router.push(href);
    setPaletteOpen(false);
  };

  const follow = () => {
    if (!targetIsMint) return;
    const next = isFollowing ? watchlist.filter((mint) => mint !== target) : [target, ...watchlist.filter((mint) => mint !== target)];
    setWatchlist(next.slice(0, 40));
    writeWatchlistCache(next);
    toast.success(isFollowing ? "Removed from local watchlist." : "Added to local watchlist.");
  };

  const triage = (
    <div className="flex flex-wrap items-center gap-1.5">
      <a
        href={jupUrl}
        target="_blank"
        rel={EXTERNAL_ANCHOR_REL}
        className={`inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/[0.08] px-2.5 text-[11px] font-semibold text-emerald-100 ${!targetIsMint ? "pointer-events-none opacity-35" : ""}`}
      >
        <Bolt size={13} /> JUP
      </a>
      <a
        href={dexUrl}
        target="_blank"
        rel={EXTERNAL_ANCHOR_REL}
        className={`inline-flex h-8 items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/[0.07] px-2.5 text-[11px] font-semibold text-cyan-100 ${!targetIsMint ? "pointer-events-none opacity-35" : ""}`}
      >
        <LineChart size={13} /> DEX
      </a>
      <Link
        href={deskUrl}
        className={`inline-flex h-8 items-center gap-1.5 rounded-lg border border-violet-500/35 bg-violet-500/[0.08] px-2.5 text-[11px] font-semibold text-violet-100 no-underline ${!targetIsMint ? "pointer-events-none opacity-35" : ""}`}
        onClick={() => setPaletteOpen(false)}
      >
        <Crosshair size={13} /> DESK
      </Link>
      <button
        type="button"
        onClick={follow}
        disabled={!targetIsMint}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-[11px] font-semibold text-gray-200 disabled:opacity-35 disabled:cursor-not-allowed"
      >
        <Star size={13} /> {isFollowing ? "Following" : "Follow"}
      </button>
    </div>
  );

  return (
    <>
      <div className="fixed inset-x-2 bottom-2 z-[210] pointer-events-none hidden md:block">
        <div className="pointer-events-auto mx-auto max-w-4xl rounded-2xl border border-white/[0.09] bg-[#07090d]/94 px-2.5 py-2 shadow-[0_18px_50px_rgba(0,0,0,0.55)] backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-cyan-500/25 bg-cyan-500/[0.08] px-2 text-[11px] font-semibold text-cyan-100"
            >
              <Command size={13} /> Ctrl+K
            </button>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                go();
              }}
              className="flex min-w-0 flex-1 items-center gap-2"
            >
              <div className="relative min-w-0 flex-1">
                <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  ref={inlineRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("terminal.hud.placeholder")}
                  className="h-8 w-full rounded-lg border border-white/[0.08] bg-black/30 pl-7 pr-2 font-mono text-[11px] text-gray-100 placeholder:text-gray-600 outline-none focus:border-cyan-500/40"
                  spellCheck={false}
                />
              </div>
              <button type="submit" className="h-8 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-[11px] font-semibold text-gray-200">
                {mode === "wallet" ? t("terminal.hud.modeWallet") : t("terminal.hud.modeToken")}
              </button>
            </form>
            {!isControlRoom ? triage : null}
            <div className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
              <span className={`h-2 w-2 rounded-full ${freshnessTone}`} />
              {freshness.label}
              <span className="font-mono normal-case tracking-normal text-gray-500">{freshness.hint}</span>
            </div>
          </div>
          {routeContext.address ? (
            <p className="mt-1 px-1 text-[10px] text-gray-500">
              {t("terminal.hud.contextFromPage")} · {routeContext.source} · {shortAddress(routeContext.address)}
            </p>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="fixed bottom-20 right-3 z-[210] inline-flex h-11 items-center gap-2 rounded-full border border-cyan-500/35 bg-[#07090d]/95 px-3 text-xs font-semibold text-cyan-100 shadow-[0_12px_34px_rgba(0,0,0,0.5)] md:hidden"
      >
        <Command size={15} /> Command
      </button>

      {paletteOpen ? (
        <div className="fixed inset-0 z-[260] bg-black/65 p-3 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="mx-auto mt-[12vh] max-w-2xl rounded-2xl border border-white/10 bg-[#090b10] p-4 shadow-2xl shadow-black/70">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">{t("terminal.palette.title")}</p>
                <p className="text-xs text-gray-500">{t("terminal.palette.subtitle")}</p>
              </div>
              <button type="button" onClick={() => setPaletteOpen(false)} className="rounded-lg p-1 text-gray-400 hover:bg-white/[0.06] hover:text-white">
                <X size={18} />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                go();
              }}
              className="space-y-3"
            >
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode(mode === "wallet" ? "token" : "wallet")}
                  className="h-11 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-gray-200"
                >
                  {mode === "wallet" ? t("terminal.hud.modeWallet") : t("terminal.hud.modeToken")}
                </button>
                <input
                  ref={paletteRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("terminal.hud.placeholder")}
                  className="h-11 min-w-0 flex-1 rounded-xl border border-white/[0.1] bg-black/35 px-3 font-mono text-sm text-gray-100 placeholder:text-gray-600 outline-none focus:border-cyan-500/45"
                  spellCheck={false}
                />
                <button type="submit" className="h-11 rounded-xl bg-cyan-500 px-4 text-sm font-bold text-black">
                  {t("terminal.hud.open")}
                </button>
              </div>
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Mini-Triage</p>
                  <p className="font-mono text-[10px] text-gray-500">{target ? shortAddress(target) : "no target"}</p>
                </div>
                {triage}
              </div>
              <div className="flex items-center justify-between gap-3 text-[11px] text-gray-500">
                <span>{routeContext.address ? `${routeContext.source}: ${shortAddress(routeContext.address)}` : "No page target detected."}</span>
                <span className="inline-flex items-center gap-1">
                  <span className={`h-2 w-2 rounded-full ${freshnessTone}`} /> {freshness.label} · {freshness.hint}
                </span>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
