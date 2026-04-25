import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useTrendingTokens } from "../hooks/useTrendingTokens";
import { useSmartWalletsLeaderboard } from "../hooks/useSmartWalletsLeaderboard";
import { useSmartMoneyActivity } from "../hooks/useSmartMoneyActivity";
import { useWalletLabels } from "../hooks/useWalletLabels";
import { useWalletFavorites } from "../hooks/useWalletFavorites";
import { formatUsdWhole, formatDateTime } from "../lib/formatStable";
import { PageHead } from "../components/seo/PageHead";
import { SmartWalletDetailPanel } from "../components/smart-money/SmartWalletDetailPanel";
import { Loader2, Radio, SlidersHorizontal, Star } from "lucide-react";
import { WalletNarrativeCard } from "../components/WalletNarrativeCard";
import { useLocale } from "../contexts/LocaleContext";
import { walletNarrativeApiLang } from "../lib/walletNarrativeLang";
import { TerminalActionIcons } from "../components/terminal/TerminalActionIcons";

function walletDecision(winRate, t) {
  const wr = Number(winRate || 0);
  if (wr >= 88) return { label: t("smart.decision.follow"), tone: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10" };
  if (wr >= 74) return { label: t("smart.decision.monitor"), tone: "text-amber-300 border-amber-500/30 bg-amber-500/10" };
  return { label: t("smart.decision.ignore"), tone: "text-red-300 border-red-500/30 bg-red-500/10" };
}

const MIN_HORIZON_SAMPLE = 5;

function hasLowHorizonSample(profile) {
  if (!profile) return false;
  return (
    Number(profile.resolvedSignals5m || 0) < MIN_HORIZON_SAMPLE ||
    Number(profile.resolvedSignals30m || 0) < MIN_HORIZON_SAMPLE ||
    Number(profile.resolvedSignals2h || 0) < MIN_HORIZON_SAMPLE
  );
}

function parseLimitFromQuery(raw) {
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (s == null || s === "") return 50;
  const n = Number(s);
  if (!Number.isFinite(n)) return 50;
  return Math.min(100, Math.max(1, Math.round(n)));
}

/** e.target a veces es nodo de texto; #text no tiene .closest (rompía el expand). */
function eventTargetInInteractive(t) {
  if (!t) return false;
  const el = t.nodeType === 1 ? t : t.parentElement;
  if (!el || typeof el.closest !== "function") return false;
  return Boolean(el.closest("a, button, [data-no-row-expand]"));
}

function ExpandedWalletNarrativeSection({ wallet, narrativeLang, title }) {
  return (
    <section data-testid="smart-money-expanded-wallet-narrative" className="rounded-xl border border-violet-500/20 bg-violet-500/[0.04] p-3">
      <p className="text-xs text-violet-200/80 font-semibold mb-2">{title}</p>
      <WalletNarrativeCard walletAddress={wallet} lang={narrativeLang} />
    </section>
  );
}

export default function SmartMoneyPage() {
  const router = useRouter();
  const { locale, t } = useLocale();
  const derivedNarrative = walletNarrativeApiLang(locale);
  const [narrativeOverride, setNarrativeOverride] = useState(null);
  const narrativeLang = narrativeOverride ?? derivedNarrative;
  const trending = useTrendingTokens();
  const [chain, setChain] = useState("solana");
  const [minWinRate, setMinWinRate] = useState(0);
  const [minTrades, setMinTrades] = useState(0);
  const [expandedWallet, setExpandedWallet] = useState("");
  /** Evita error de hidratación: SSG/SSR y la primera capa de cliente usan el mismo límite/filtro; la query real se aplica al montar. */
  const [urlHydrated, setUrlHydrated] = useState(false);
  useEffect(() => {
    setUrlHydrated(true);
  }, []);

  useEffect(() => {
    setNarrativeOverride(null);
  }, [locale]);

  const limit = useMemo(() => {
    if (!urlHydrated) return 50;
    if (!router.isReady) return 50;
    return parseLimitFromQuery(router.query.limit);
  }, [urlHydrated, router.isReady, router.query.limit]);

  const soloFavorites = useMemo(() => {
    if (!urlHydrated) return false;
    if (!router.isReady) return false;
    const f = router.query.favorites;
    const s = Array.isArray(f) ? f[0] : f;
    return s === "1" || s === "true";
  }, [urlHydrated, router.isReady, router.query.favorites]);

  const pushQuery = useCallback(
    (patch) => {
      if (!router.isReady) return;
      const next = { ...router.query, ...patch };
      Object.keys(next).forEach((k) => {
        if (next[k] === undefined || next[k] === "") delete next[k];
      });
      router.push({ pathname: "/smart-money", query: next }, undefined, { shallow: true });
    },
    [router]
  );

  const { data, isLoading, isError, error, refetch } = useSmartWalletsLeaderboard({
    chain,
    minWinRate,
    minTrades,
    limit
  });
  const activity = useSmartMoneyActivity(48);
  const { isFavorite, toggle: toggleFavorite, count: favCount, favorites: favList } = useWalletFavorites();
  const favKey = favList.join(",");

  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const meta = data?.meta || {};
  const actRows = Array.isArray(activity.data?.rows) ? activity.data.rows : [];

  const addresses = useMemo(() => rows.map((r) => r.wallet).filter(Boolean), [rows]);
  const { labelFor, titleFor } = useWalletLabels(addresses);

  const ranked = useMemo(() => {
    return rows.map((w, i) => ({
      ...w,
      rank: i + 1,
      decision: walletDecision(w.winRate, t)
    }));
  }, [rows, t]);

  const displayedRanked = useMemo(() => {
    const list = soloFavorites ? ranked.filter((w) => isFavorite(w.wallet)) : ranked;
    return list.map((w, i) => {
      const globalRank = w.rank;
      return {
        ...w,
        rank: i + 1,
        globalRank
      };
    });
  }, [ranked, soloFavorites, isFavorite, favKey]);

  const heroRowsSuffix = useMemo(() => {
    if (meta.count == null) return "";
    return t("smart.hero.rowsMeta", {
      count: meta.count,
      limitHint: meta.limit != null ? t("smart.hero.limitHint", { limit: meta.limit }) : ""
    });
  }, [meta.count, meta.limit, t]);

  const onToggleExpand = useCallback((wallet) => {
    if (!wallet) return;
    setExpandedWallet((v) => (v === wallet ? "" : wallet));
  }, []);

  return (
    <>
      <PageHead title={t("smart.pageTitle")} description={t("smart.pageDesc")} />
      <div className="sl-container py-10 space-y-6 pb-24">
        <section className="sl-home-hero sl-inset sm:p-7 ring-1 ring-white/[0.06]">
          <p className="sl-label text-emerald-400/90">{t("smart.label")}</p>
          <h1 className="sl-h1 text-white mt-2 tracking-tight">
            {soloFavorites
              ? t("smart.hero.h1.favorites", {
                  limit,
                  suffix: displayedRanked.length > 0 ? ` · ${displayedRanked.length}` : ""
                })
              : t("smart.hero.h1.top", { limit })}
          </h1>
          <p className="sl-body sl-muted mt-2">
            {soloFavorites ? (
              <span>{t("smart.hero.body.favorites", { limit })}</span>
            ) : (
              <span>
                {t("smart.hero.body.default", {
                  source: meta.source || "—",
                  rows: heroRowsSuffix
                })}
              </span>
            )}{" "}
            <span>{t("smart.hero.body.tail")}</span>
          </p>
          <p className="text-xs text-gray-500 mt-3">
            {t("smart.hero.trending", {
              state: trending.isError ? t("smart.hero.trending.degraded") : t("smart.hero.trending.connected"),
              fav: favCount > 0 ? String(favCount) : "0"
            })}{" "}
            <button type="button" onClick={() => refetch()} className="text-cyan-400 hover:underline">
              {t("smart.hero.refreshLb")}
            </button>
          </p>
        </section>

        <section className="glass-card sl-inset space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-300">
            <SlidersHorizontal size={16} className="text-gray-500" />
            <span className="sl-label text-gray-400">{t("smart.filters.label")}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <label className="space-y-1.5 text-xs text-gray-400">
              <span className="uppercase tracking-wide">{t("smart.filters.apiLimit")}</span>
              <select
                className="sl-input w-full h-10 px-3"
                value={String(limit)}
                onChange={(e) => {
                  const v = parseLimitFromQuery(e.target.value);
                  pushQuery({ limit: v === 50 ? undefined : String(v) });
                }}
                disabled={!router.isReady}
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="30">30</option>
                <option value="50">{t("smart.select.default50")}</option>
                <option value="75">75</option>
                <option value="100">100</option>
              </select>
            </label>
            <label className="space-y-1.5 text-xs text-gray-400">
              <span className="uppercase tracking-wide">{t("smart.filters.chain")}</span>
              <select
                className="sl-input w-full h-10 px-3"
                value={chain}
                onChange={(e) => setChain(e.target.value)}
              >
                <option value="solana">{t("smart.filters.opt.solana")}</option>
                <option value="all">{t("smart.filters.opt.all")}</option>
              </select>
            </label>
            <label className="space-y-1.5 text-xs text-gray-400">
              <span className="uppercase tracking-wide">{t("smart.filters.minWr")}</span>
              <input
                type="number"
                min={0}
                max={100}
                className="sl-input w-full h-10 px-3 mono"
                value={minWinRate || ""}
                placeholder="0"
                onChange={(e) => setMinWinRate(Number(e.target.value || 0))}
              />
            </label>
            <label className="space-y-1.5 text-xs text-gray-400">
              <span className="uppercase tracking-wide">{t("smart.filters.minTrades")}</span>
              <input
                type="number"
                min={0}
                className="sl-input w-full h-10 px-3 mono"
                value={minTrades || ""}
                placeholder="0"
                onChange={(e) => setMinTrades(Number(e.target.value || 0))}
              />
            </label>
            <label className="space-y-1.5 text-xs text-gray-400">
              <span className="uppercase tracking-wide">{t("smart.filters.narrativeLang")}</span>
              <select
                className="sl-input w-full h-10 px-3"
                value={narrativeLang}
                onChange={(e) => {
                  const v = e.target.value;
                  setNarrativeOverride(v === derivedNarrative ? null : v);
                }}
              >
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
            </label>
            <label className="flex items-end gap-2 pb-1.5 h-full cursor-pointer text-xs text-gray-300">
              <input
                type="checkbox"
                className="rounded border-white/20 h-4 w-4"
                checked={soloFavorites}
                onChange={(e) => {
                  if (e.target.checked) pushQuery({ favorites: "1" });
                  else pushQuery({ favorites: undefined });
                }}
                disabled={!router.isReady}
              />
              <span className="select-none">{t("smart.filters.favoritesOnly")}</span>
            </label>
          </div>
          <p className="text-[11px] text-gray-600">{t("smart.filters.roiNote")}</p>
        </section>

        {isLoading ? (
          <div className="glass-card sl-inset flex items-center justify-center gap-3 py-16 text-gray-400">
            <Loader2 className="animate-spin" size={22} />
            {t("smart.loading")}
          </div>
        ) : null}

        {isError ? (
          <div className="glass-card sl-inset border border-red-500/30 text-red-200 text-sm py-6 px-4">
            {error?.message || t("smart.errorFallback")}
          </div>
        ) : null}

        {!isLoading && !isError && ranked.length === 0 ? (
          <section className="glass-card sl-inset text-center py-12 space-y-3">
            <p className="text-gray-300">{t("smart.empty.title")}</p>
            <p className="text-sm text-gray-500 max-w-lg mx-auto">
              {t("smart.empty.hint")}
            </p>
            <Link href="/pricing" className="btn-pro inline-flex no-underline mt-2">
              {t("smart.empty.upgrade")}
            </Link>
          </section>
        ) : null}

        {!isLoading && !isError && ranked.length > 0 && displayedRanked.length === 0 && soloFavorites ? (
          <section className="glass-card sl-inset text-center py-12 space-y-3 border border-amber-500/20">
            <p className="text-gray-200">{t("smart.favEmpty.title", { limit })}</p>
            <p className="text-sm text-gray-500 max-w-lg mx-auto">{t("smart.favEmpty.hint")}</p>
            <button
              type="button"
              className="text-cyan-400 text-sm hover:underline"
              onClick={() => pushQuery({ favorites: undefined })}
            >
              {t("smart.favEmpty.clear")}
            </button>
          </section>
        ) : null}

        {!isLoading && !isError && displayedRanked.length > 0 ? (
          <>
            <section className="glass-card sl-inset overflow-x-auto hidden xl:block">
              <table className="w-full min-w-[1200px] text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-white/10">
                    <th className="py-2 pr-1 w-8 text-center" title={t("smart.th.fav")}>
                      ★
                    </th>
                    <th className="py-2 pr-2 w-10">{t("smart.th.rank")}</th>
                    <th className="py-2 pr-3">{t("smart.th.wallet")}</th>
                    <th className="py-2 pr-3">{t("smart.th.winRate")}</th>
                    <th className="py-2 pr-3">{t("smart.th.wrReal")}</th>
                    <th className="py-2 pr-3">{t("smart.th.roi")}</th>
                    <th className="py-2 pr-3">{t("smart.th.pnl")}</th>
                    <th className="py-2 pr-3">{t("smart.th.trades")}</th>
                    <th className="py-2 pr-3">{t("smart.th.best")}</th>
                    <th className="py-2 pr-3">{t("smart.th.lastSeen")}</th>
                    <th className="py-2 min-w-[160px]">{t("smart.th.call")}</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedRanked.map((w) => (
                    <Fragment key={w.wallet}>
                      <tr
                        role="button"
                        tabIndex={0}
                        aria-expanded={expandedWallet === w.wallet}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onToggleExpand(w.wallet);
                          }
                        }}
                        onClick={(e) => {
                          if (eventTargetInInteractive(e.target)) return;
                          onToggleExpand(w.wallet);
                        }}
                        className="border-b border-white/5 hover:bg-white/[0.03] group cursor-pointer"
                      >
                        <td className="py-3 pr-1 text-center align-top">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavorite(w.wallet);
                            }}
                            className="inline-flex p-1 rounded-md hover:bg-amber-500/15 text-gray-500 hover:text-amber-200 transition"
                            title={isFavorite(w.wallet) ? t("smart.fav.removeTitle") : t("smart.fav.addTitle")}
                            aria-pressed={isFavorite(w.wallet)}
                            aria-label={t("smart.fav.aria")}
                          >
                            <Star
                              size={16}
                              className={
                                isFavorite(w.wallet) ? "fill-amber-400/90 text-amber-200" : "text-gray-500"
                              }
                              strokeWidth={isFavorite(w.wallet) ? 0 : 2}
                            />
                          </button>
                        </td>
                        <td className="py-3 pr-2 text-gray-500 mono text-xs align-top">
                          {soloFavorites ? (
                            <div>
                              <span className="text-gray-200">#{w.rank}</span>
                              <div
                                className="text-[10px] text-gray-600"
                                title={t("smart.globalRankTitle", { limit })}
                              >
                                {t("smart.global")} {w.globalRank}
                              </div>
                            </div>
                          ) : (
                            w.rank
                          )}
                        </td>
                        <td className="py-3 pr-3">
                          <div className="min-w-0">
                            <div className="text-gray-100 font-medium truncate" title={titleFor(w.wallet)}>
                              <Link
                                className="hover:text-cyan-300"
                                href={`/wallet/${w.wallet}?lang=${narrativeLang}`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {labelFor(w.wallet)}
                              </Link>
                            </div>
                            <div className="font-mono text-[11px] text-gray-500 truncate">{w.wallet}</div>
                          </div>
                        </td>
                        <td className="py-3 pr-3 text-emerald-300 tabular-nums">{w.winRate.toFixed(1)}%</td>
                        <td className="py-3 pr-3 text-[11px] text-gray-300 leading-tight">
                          {w.profile ? (
                            <div className="space-y-0.5">
                              <div className="font-mono">
                                5m {Number(w.profile.winRateReal5m || 0).toFixed(1)}% · 30m{" "}
                                {Number(w.profile.winRateReal30m || 0).toFixed(1)}% · 2h{" "}
                                {Number(w.profile.winRateReal2h || 0).toFixed(1)}%
                              </div>
                              <div className="text-gray-500">
                                n {w.profile.resolvedSignals5m || 0}/{w.profile.resolvedSignals30m || 0}/
                                {w.profile.resolvedSignals2h || 0}
                              </div>
                              {hasLowHorizonSample(w.profile) ? (
                                <div className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded border border-amber-500/35 bg-amber-500/10 text-amber-200">
                                  {t("smart.lowSample")}
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-gray-600">{t("smart.pending")}</span>
                          )}
                        </td>
                        <td className="py-3 pr-3 text-cyan-200/90 tabular-nums">{Number(w.roi30dVsAvgSize || 0).toFixed(2)}×</td>
                        <td className="py-3 pr-3 text-emerald-200/90 tabular-nums">+${formatUsdWhole(w.pnl30d)}</td>
                        <td className="py-3 pr-3 tabular-nums text-gray-200">{w.totalTrades ?? "—"}</td>
                        <td className="py-3 pr-3 text-xs text-gray-300">
                          {w.bestTradePct != null ? (
                            <span className="text-emerald-300 font-mono">+{w.bestTradePct.toFixed(1)}%</span>
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                          {w.bestTradeMint ? (
                            <div className="flex items-center gap-2 mt-1">
                              <Link
                                className="hover:text-cyan-300 text-[10px] text-gray-600 mono truncate max-w-[120px]"
                                href={`/token/${w.bestTradeMint}`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                mint…{w.bestTradeMint.slice(-4)}
                              </Link>
                              <TerminalActionIcons mint={w.bestTradeMint} className="scale-90 origin-left" />
                            </div>
                          ) : null}
                        </td>
                        <td className="py-3 pr-3 text-gray-400 text-xs whitespace-nowrap">
                          {w.lastSeen ? formatDateTime(w.lastSeen) : "—"}
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                            <span className={`text-xs px-2 py-1 rounded border ${w.decision.tone}`}>{w.decision.label}</span>
                            <Link
                              href={`/wallet/${w.wallet}?lang=${narrativeLang}#behavior-memory`}
                              className="text-[11px] px-2 py-1 rounded border border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"
                            >
                              {t("smart.behavior")}
                            </Link>
                            <button
                              type="button"
                              onClick={() => onToggleExpand(w.wallet)}
                              className="text-[11px] px-2 py-1 rounded border border-violet-500/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20"
                            >
                              {expandedWallet === w.wallet ? t("smart.panel.close") : t("smart.panel.open")}
                            </button>
                          </div>
                          {w.profile ? (
                            <p className="text-[10px] text-gray-500 mt-1 max-w-[260px]">
                              pre-pump ${formatUsdWhole(w.profile.avgSizePrePumpUsd || 0)} · latency{" "}
                              {w.profile.avgLatencyPostDeployMin != null
                                ? `${Number(w.profile.avgLatencyPostDeployMin).toFixed(1)}m`
                                : "—"}{" "}
                              · solo/grp {Math.round(Number(w.profile.soloBuyRatio || 0) * 100)}%/
                              {Math.round(Number(w.profile.groupBuyRatio || 0) * 100)}% · anti/brk{" "}
                              {Math.round(Number(w.profile.anticipatoryBuyRatio || 0) * 100)}%/
                              {Math.round(Number(w.profile.breakoutBuyRatio || 0) * 100)}%
                            </p>
                          ) : null}
                        </td>
                      </tr>
                      {expandedWallet === w.wallet ? (
                        <tr className="border-b border-white/5 bg-white/[0.02]">
                          <td colSpan={11} className="px-3 py-4">
                            <p className="text-xs text-violet-200/80 font-semibold mb-3">{t("smart.detail.title")}</p>
                            <SmartWalletDetailPanel
                              row={w}
                              labelFor={labelFor}
                              titleFor={titleFor}
                              narrativeLang={narrativeLang}
                              afterStats={
                                <ExpandedWalletNarrativeSection
                                  wallet={w.wallet}
                                  narrativeLang={narrativeLang}
                                  title={t("smart.narrative.title")}
                                />
                              }
                            />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="grid grid-cols-1 gap-3 xl:hidden">
              {displayedRanked.map((w) => (
                <article
                  key={w.wallet}
                  role="button"
                  tabIndex={0}
                  aria-expanded={expandedWallet === w.wallet}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onToggleExpand(w.wallet);
                    }
                  }}
                  onClick={(e) => {
                    if (eventTargetInInteractive(e.target)) return;
                    onToggleExpand(w.wallet);
                  }}
                  className="glass-card p-4 rounded-2xl border border-white/10 space-y-2 hover:border-emerald-500/25 transition cursor-pointer"
                >
                  <div className="flex justify-between gap-2 items-start">
                    <div className="min-w-0 flex-1">
                      <p className="text-white font-semibold truncate" title={titleFor(w.wallet)}>
                        #{w.rank}
                        {soloFavorites ? (
                          <span className="text-gray-500 font-normal text-xs ml-1">
                            ({t("smart.global")} {w.globalRank})
                          </span>
                        ) : null}{" "}
                        ·{" "}
                        <Link
                          className="hover:text-cyan-300"
                          href={`/wallet/${w.wallet}?lang=${narrativeLang}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {labelFor(w.wallet)}
                        </Link>
                      </p>
                      <p className="font-mono text-[11px] text-gray-500 truncate">{w.wallet}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(w.wallet);
                        }}
                        className="inline-flex p-1.5 rounded-lg hover:bg-amber-500/15 text-gray-500 hover:text-amber-200"
                        title={isFavorite(w.wallet) ? t("smart.fav.removeTitle") : t("smart.fav.mobileTitle")}
                        aria-pressed={isFavorite(w.wallet)}
                        aria-label={t("smart.fav.aria")}
                      >
                        <Star
                          size={18}
                          className={isFavorite(w.wallet) ? "fill-amber-400/90 text-amber-200" : "text-gray-500"}
                          strokeWidth={isFavorite(w.wallet) ? 0 : 2}
                        />
                      </button>
                      <span className={`text-xs px-2 py-1 rounded border ${w.decision.tone}`}>{w.decision.label}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-300">
                    <span>
                      {t("smart.mobile.win")} {w.winRate.toFixed(1)}%
                    </span>
                    <span>
                      {t("smart.mobile.roi")} {Number(w.roi30dVsAvgSize || 0).toFixed(2)}×
                    </span>
                    <span>
                      {t("smart.mobile.trades")} {w.totalTrades ?? "—"}
                    </span>
                    <span className="text-gray-500">{w.lastSeen ? formatDateTime(w.lastSeen) : "—"}</span>
                  </div>
                  {w.profile ? (
                    <div className="space-y-1">
                      <p className="text-[11px] text-gray-400">
                        WR real: 5m {Number(w.profile.winRateReal5m || 0).toFixed(1)}% · 30m{" "}
                        {Number(w.profile.winRateReal30m || 0).toFixed(1)}% · 2h {Number(w.profile.winRateReal2h || 0).toFixed(1)}%
                      </p>
                      {hasLowHorizonSample(w.profile) ? (
                        <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded border border-amber-500/35 bg-amber-500/10 text-amber-200">
                          {t("smart.lowSampleMobile", { n: MIN_HORIZON_SAMPLE })}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  <p className="text-emerald-300 text-sm font-mono">
                    +${formatUsdWhole(w.pnl30d)} {t("smart.mobile.pnl30")}
                  </p>
                  <div onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/wallet/${w.wallet}?lang=${narrativeLang}#behavior-memory`}
                        className="text-[11px] px-2 py-1 rounded border border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"
                      >
                        {t("smart.behavior")}
                      </Link>
                      <button
                        type="button"
                        onClick={() => onToggleExpand(w.wallet)}
                        className="text-[11px] px-2 py-1 rounded border border-violet-500/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20"
                      >
                        {expandedWallet === w.wallet ? t("smart.panel.close") : t("smart.panel.openFull")}
                      </button>
                    </div>
                  </div>
                  {w.bestTradePct != null ? (
                    <div className="text-[11px] text-gray-400">
                      {t("smart.mobile.bestSignal")}{" "}
                      <span className="text-emerald-300">+{w.bestTradePct.toFixed(1)}%</span>
                      {w.bestTradeMint ? (
                        <>
                          {" "}
                          {t("smart.mobile.on")}{" "}
                          <Link
                            href={`/token/${w.bestTradeMint}`}
                            className="text-cyan-300 hover:underline mono"
                            onClick={(e) => e.stopPropagation()}
                          >
                            …{w.bestTradeMint.slice(-4)}
                          </Link>
                          <div className="inline-flex align-middle ml-1">
                            <TerminalActionIcons mint={w.bestTradeMint} className="scale-90 origin-left" />
                          </div>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                  {expandedWallet === w.wallet ? (
                    <div className="pt-2 space-y-3 border-t border-white/10" onClick={(e) => e.stopPropagation()}>
                      <p className="text-xs text-violet-200/80 font-semibold">{t("smart.detail.title")}</p>
                      <SmartWalletDetailPanel
                        row={w}
                        labelFor={labelFor}
                        titleFor={titleFor}
                        narrativeLang={narrativeLang}
                        afterStats={
                          <ExpandedWalletNarrativeSection
                            wallet={w.wallet}
                            narrativeLang={narrativeLang}
                            title={t("smart.narrative.title")}
                          />
                        }
                      />
                    </div>
                  ) : null}
                </article>
              ))}
            </section>
          </>
        ) : null}

        <section className="glass-card sl-inset space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="sl-label inline-flex items-center gap-2 text-gray-200">
              <Radio size={14} className="text-purple-300" />
              {t("smart.activity.label")}
            </p>
            <button
              type="button"
              onClick={() => activity.refetch()}
              className="text-xs text-cyan-400 hover:underline"
            >
              {t("smart.activity.refresh")}
            </button>
          </div>
          {activity.isLoading ? (
            <div className="flex items-center gap-2 text-gray-500 text-sm py-6">
              <Loader2 className="animate-spin" size={18} />
              {t("smart.activity.loading")}
            </div>
          ) : null}
          {activity.isError ? (
            <p className="text-sm text-red-300">{activity.error?.message || t("smart.activity.error")}</p>
          ) : null}
          {!activity.isLoading && !activity.isError && actRows.length === 0 ? (
            <p className="text-sm text-gray-500">{t("smart.activity.empty")}</p>
          ) : null}
          {!activity.isLoading && !activity.isError && actRows.length > 0 ? (
            <ul className="divide-y divide-white/[0.06] border border-white/[0.06] rounded-xl overflow-hidden">
              {actRows.map((r) => (
                <li key={`${r.wallet}-${r.token}-${r.createdAt}`} className="px-3 py-2.5 flex flex-wrap gap-2 text-sm bg-white/[0.015]">
                  <span className="mono text-gray-200 text-xs">{r.wallet?.slice(0, 4)}…{r.wallet?.slice(-4)}</span>
                  <span
                    className={`text-[11px] font-semibold uppercase px-2 py-0.5 rounded border ${
                      String(r.side).toLowerCase().includes("sell")
                        ? "border-red-500/30 text-red-200 bg-red-500/10"
                        : "border-emerald-500/30 text-emerald-200 bg-emerald-500/10"
                    }`}
                  >
                    {r.side}
                  </span>
                  <div className="inline-flex items-center gap-2">
                    <Link href={`/token/${r.token}`} className="text-cyan-300 hover:underline mono text-xs truncate max-w-[160px]">
                      {r.token?.slice(0, 4)}…{r.token?.slice(-4)}
                    </Link>
                    <TerminalActionIcons mint={r.token} className="scale-90 origin-left" />
                  </div>
                  <span className="text-gray-500 text-xs ml-auto tabular-nums">
                    {r.createdAt ? formatDateTime(r.createdAt) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>
    </>
  );
}
