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
import { WalletNarrativeCard } from "../components/WalletNarrativeCard";
import { useLocale } from "../contexts/LocaleContext";
import { walletNarrativeApiLang } from "../lib/walletNarrativeLang";

function actionUpperFromWinRate(winRate) {
  const wr = Number(winRate || 0);
  if (wr >= 88) return "FOLLOW";
  if (wr >= 74) return "MONITOR";
  return "IGNORE";
}

function parseLimitFromQuery(raw) {
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (s == null || s === "") return 50;
  const n = Number(s);
  if (!Number.isFinite(n)) return 50;
  return Math.min(100, Math.max(1, Math.round(n)));
}

function eventTargetInInteractive(t) {
  if (!t) return false;
  const el = t.nodeType === 1 ? t : t.parentElement;
  if (!el || typeof el.closest !== "function") return false;
  return Boolean(el.closest("a, button, [data-no-row-expand]"));
}

function median(nums) {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function truncateWallet(addr) {
  if (!addr || addr.length < 9) return addr || "—";
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

function wlFromWinRate(totalTrades, winRate) {
  const tt = Number(totalTrades || 0);
  const wr = Number(winRate || 0);
  if (!tt) return { w: 0, l: 0 };
  const w = Math.round(tt * (wr / 100));
  const l = Math.max(0, tt - w);
  return { w, l };
}

function profitFactorApprox(totalTrades, winRate) {
  const { w, l } = wlFromWinRate(totalTrades, winRate);
  if (!w && !l) return null;
  if (l === 0) return "—";
  return (w / l).toFixed(2);
}

function activityInTimeframe(createdAt, tf) {
  if (!createdAt) return true;
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return true;
  const now = Date.now();
  const key = String(tf || "24h").toLowerCase();
  const ms = key === "24h" ? 86400000 : key === "7d" ? 86400000 * 7 : 86400000 * 30;
  return now - t <= ms;
}

function signalTypeLabel(side) {
  const s = String(side || "").toLowerCase();
  if (s.includes("pool") || s.includes("lp") || s.includes("liquidity")) return "LP";
  return "SWAP";
}

function ExpandedWalletNarrativeSection({ wallet, narrativeLang }) {
  return (
    <section
      data-testid="smart-money-expanded-wallet-narrative"
      data-wallet={wallet}
      className="border border-[#1F2937] bg-[#0B0F14] p-1"
    >
      <WalletNarrativeCard walletAddress={wallet} lang={narrativeLang} />
    </section>
  );
}

function TopControlBar({
  trending,
  timeframe,
  setTimeframe,
  soloFavorites,
  pushQuery,
  routerReady,
  limit,
  chain,
  setChain,
  minWinRate,
  setMinWinRate,
  minTrades,
  setMinTrades,
  narrativeLang,
  derivedNarrative,
  setNarrativeOverride,
  refetchLb,
  t
}) {
  const filterCtl =
    "border border-[#1F2937] bg-transparent text-[10px] font-mono text-gray-100 px-2 py-1";
  return (
    <header className="flex flex-nowrap items-center gap-2 border-b border-[#1F2937] bg-[#0B0F14] px-2 py-1 min-w-0 overflow-x-auto">
      <h1 className="shrink-0 text-xs uppercase tracking-wider text-gray-400 whitespace-nowrap">
        SENTINEL SMX // SMART MONEY LEADERBOARD
      </h1>
      <div className="flex flex-nowrap items-center gap-2 mx-auto min-w-0">
        <span className="text-[10px] text-gray-500 shrink-0">LIMIT</span>
        <select
          className={filterCtl + " shrink-0"}
          value={String(limit)}
          onChange={(e) => {
            const v = parseLimitFromQuery(e.target.value);
            pushQuery({ limit: v === 50 ? undefined : String(v) });
          }}
          disabled={!routerReady}
        >
          <option value="10">10</option>
          <option value="20">20</option>
          <option value="30">30</option>
          <option value="50">50</option>
          <option value="75">75</option>
          <option value="100">100</option>
        </select>
        <span className="text-[10px] text-gray-500 shrink-0">CHAIN</span>
        <select className={filterCtl + " shrink-0"} value={chain} onChange={(e) => setChain(e.target.value)}>
          <option value="solana">{t("smart.filters.opt.solana")}</option>
          <option value="all">{t("smart.filters.opt.all")}</option>
        </select>
        <span className="text-[10px] text-gray-500 shrink-0">MIN WR</span>
        <input
          type="number"
          min={0}
          max={100}
          className={filterCtl + " w-12 shrink-0"}
          value={minWinRate || ""}
          placeholder="0"
          onChange={(e) => setMinWinRate(Number(e.target.value || 0))}
        />
        <span className="text-[10px] text-gray-500 shrink-0">MIN TR</span>
        <input
          type="number"
          min={0}
          className={filterCtl + " w-12 shrink-0"}
          value={minTrades || ""}
          placeholder="0"
          onChange={(e) => setMinTrades(Number(e.target.value || 0))}
        />
        <span className="text-[10px] text-gray-500 shrink-0">NAR</span>
        <select
          className={filterCtl + " shrink-0"}
          value={narrativeLang}
          onChange={(e) => {
            const v = e.target.value;
            setNarrativeOverride(v === derivedNarrative ? null : v);
          }}
        >
          <option value="es">ES</option>
          <option value="en">EN</option>
        </select>
        <label className="flex items-center gap-1 shrink-0 cursor-pointer text-[10px] text-gray-500 whitespace-nowrap">
          <input
            type="checkbox"
            className="border border-[#1F2937] bg-transparent rounded-none h-3 w-3"
            checked={soloFavorites}
            onChange={(e) => {
              if (e.target.checked) pushQuery({ favorites: "1" });
              else pushQuery({ favorites: undefined });
            }}
            disabled={!routerReady}
          />
          FAV ONLY
        </label>
      </div>
      <div className="flex flex-nowrap items-center gap-2 shrink-0 ml-auto">
        <span className="text-[10px] font-mono text-gray-500 whitespace-nowrap">
          TREND {trending.isError ? "[-]" : "[+]"}
        </span>
        <span className="text-[10px] font-mono text-gray-100 uppercase whitespace-nowrap">ENGINE LIVE</span>
        {(["24h", "7d", "30d"]).map((tf) => (
          <button
            key={tf}
            type="button"
            onClick={() => setTimeframe(tf)}
            className={`border border-[#1F2937] bg-transparent px-2 py-1 text-[10px] font-mono uppercase whitespace-nowrap ${
              timeframe === tf ? "text-gray-100" : "text-gray-500"
            }`}
          >
            [{tf.toUpperCase()}]
          </button>
        ))}
        <button
          type="button"
          onClick={() => refetchLb()}
          className="border border-[#1F2937] bg-transparent px-2 py-1 text-[10px] font-mono text-gray-100 uppercase whitespace-nowrap"
        >
          [REFRESH LB]
        </button>
      </div>
    </header>
  );
}

function KpiStrip({ totalTracked, medianWinRate, avgPnl30, avgUnifiedScore, activeProbes24h }) {
  const cells = [
    { label: "TOTAL TRACKED WALLETS", value: totalTracked != null ? String(totalTracked) : "—" },
    { label: "MEDIAN WIN RATE", value: medianWinRate != null ? `${medianWinRate.toFixed(1)}%` : "—" },
    { label: "AVG 30D PNL", value: avgPnl30 != null ? `+$${formatUsdWhole(avgPnl30)}` : "—" },
    { label: "AVG UNIFIED SCORE", value: avgUnifiedScore != null ? avgUnifiedScore.toFixed(2) : "—" },
    { label: "ACTIVE PROBES (24H)", value: activeProbes24h != null ? String(activeProbes24h) : "—" }
  ];
  return (
    <div className="flex border-b border-[#1F2937] bg-[#0B0F14]">
      {cells.map((c, i) => (
        <div
          key={c.label}
          className={`flex flex-col px-4 py-2 min-w-0 flex-1 ${i < cells.length - 1 ? "border-r border-[#1F2937]" : ""}`}
        >
          <span className="text-[9px] text-gray-500 uppercase">{c.label}</span>
          <span className="text-sm font-mono text-gray-100 tabular-nums">{c.value}</span>
        </div>
      ))}
    </div>
  );
}

function LiveSignalFeed({ rows, timeframe, refetch, isLoading, isError, error, t }) {
  const filtered = useMemo(
    () => rows.filter((r) => activityInTimeframe(r.createdAt, timeframe)),
    [rows, timeframe]
  );
  return (
    <aside className="flex flex-col min-h-0 border-l border-[#1F2937] bg-[#0B0F14] min-w-0">
      <div className="flex items-center justify-between gap-2 border-b border-[#1F2937] px-2 py-1 text-[10px] font-mono uppercase text-gray-300">
        <span>RECENT MARKET SIGNALS</span>
        <button type="button" onClick={() => refetch()} className="text-[10px] font-mono text-gray-400 uppercase">
          [SYNC]
        </button>
      </div>
      <div className="flex-1 overflow-y-auto min-h-[120px]">
        {isLoading ? (
          <div className="px-2 py-2 text-[10px] font-mono text-gray-500">&gt; CONNECTING TO DATA STREAM...</div>
        ) : null}
        {isError ? (
          <div className="px-2 py-2 text-[10px] font-mono text-gray-500">{error?.message || t("smart.activity.error")}</div>
        ) : null}
        {!isLoading && !isError && filtered.length === 0 ? (
          <div className="px-2 py-2 text-[10px] font-mono text-gray-500">{t("smart.activity.empty")}</div>
        ) : null}
        {!isLoading &&
          !isError &&
          filtered.map((r) => {
            const tick = r.token ? truncateWallet(r.token) : "—";
            const typ = signalTypeLabel(r.side);
            const conf = Number.isFinite(r.confidence) ? Math.round(r.confidence) : "—";
            const ts = r.createdAt ? formatDateTime(r.createdAt) : "—";
            const side = String(r.side || "").toLowerCase().includes("sell") ? "[-]" : "[+]";
            const typCls = typ === "SWAP" ? "text-yellow-400" : "text-gray-100";
            return (
              <div key={`${r.wallet}-${r.token}-${r.createdAt}`} className="border-b border-[#1F2937] py-2 px-2">
                <div className="text-[10px] font-mono text-gray-100">
                  {side} {tick}{" "}
                  <span className={typCls}>{typ}</span>{" "}
                  <span className="text-gray-400">CONF</span> <span className="text-gray-400">{conf}%</span>
                </div>
                <div className="text-[10px] font-mono text-gray-500">{ts}</div>
              </div>
            );
          })}
      </div>
    </aside>
  );
}

function WalletTable({
  displayedRanked,
  soloFavorites,
  expandedWallet,
  onToggleExpand,
  labelFor,
  titleFor,
  narrativeLang,
  t,
  isFavorite,
  toggleFavorite
}) {
  return (
    <div className="flex flex-col min-h-0 min-w-0 flex-1 bg-[#0B0F14]">
      <div className="border-b border-[#1F2937] px-2 py-1 text-[11px] font-mono uppercase text-gray-500">
        WALLET UNIVERSE // {displayedRanked.length} ROWS
      </div>
      <div className="overflow-auto flex-1 min-h-[200px]">
        <table className="w-full min-w-[800px] border-collapse text-left">
          <thead className="sticky top-0 bg-[#0B0F14] z-[1]">
            <tr className="border-b border-[#1F2937]">
              {["RANK", "WALLET", "SCORE", "WIN RATE", "30D PNL", "TRADES (W/L)", "PROFIT FACTOR", "LAST ACTIVE", "ACTION"].map(
                (h) => (
                  <th key={h} className="text-[11px] uppercase text-gray-500 px-2 py-1 font-sans font-normal">
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {displayedRanked.map((w) => {
              const raw = Number(w.winRate || 0);
              const { w: wc, l: lc } = wlFromWinRate(w.totalTrades, w.winRate);
              const pf = profitFactorApprox(w.totalTrades, w.winRate);
              const pnl = Number(w.pnl30d || 0);
              const pnlStr = `${pnl >= 0 ? "+" : "-"}$${formatUsdWhole(Math.abs(pnl))}`;
              const wrCls = raw > 50 ? "text-emerald-400" : raw < 50 ? "text-rose-500" : "text-gray-100";
              const uScore = w.score != null && Number.isFinite(Number(w.score)) ? Number(w.score) : null;
              const action = actionUpperFromWinRate(w.winRate);
              return (
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
                    className="border-b border-[#1F2937] hover:bg-[#111722] cursor-pointer"
                  >
                    <td className="py-1 px-2 align-middle text-[11px] font-mono text-gray-100 tabular-nums">
                      {soloFavorites ? `${w.rank} (${w.globalRank})` : w.rank}
                    </td>
                    <td className="py-1 px-2 align-middle text-[11px] font-mono text-gray-100 max-w-[140px]" title={titleFor(w.wallet)}>
                      {truncateWallet(w.wallet)}
                    </td>
                    <td className="py-1 px-2 align-middle text-[11px] font-mono text-gray-100 tabular-nums">
                      {uScore != null ? uScore.toFixed(2) : "—"}
                    </td>
                    <td className={`py-1 px-2 align-middle text-[11px] font-mono tabular-nums ${wrCls}`}>
                      {Number(w.winRate || 0).toFixed(1)}%
                    </td>
                    <td className="py-1 px-2 align-middle text-[11px] font-mono text-gray-100 tabular-nums">{pnlStr}</td>
                    <td className="py-1 px-2 align-middle text-[11px] font-mono text-gray-100 tabular-nums">
                      {w.totalTrades ?? "—"} <span className="text-gray-500">({wc}/{lc})</span>
                    </td>
                    <td className="py-1 px-2 align-middle text-[11px] font-mono text-gray-100 tabular-nums">{pf ?? "—"}</td>
                    <td className="py-1 px-2 align-middle text-[11px] font-mono text-gray-100 whitespace-nowrap">
                      {w.lastSeen ? formatDateTime(w.lastSeen) : "—"}
                    </td>
                    <td className="py-1 px-2 align-middle text-xs font-mono uppercase text-gray-100">{action}</td>
                  </tr>
                  {expandedWallet === w.wallet ? (
                    <tr className="border-b border-[#1F2937] bg-[#0B0F14]">
                      <td colSpan={9} className="p-2">
                        <div className="flex gap-2 mb-1">
                          <button
                            type="button"
                            data-no-row-expand
                            className="text-[10px] font-mono uppercase text-gray-400 border border-[#1F2937] px-2 py-0.5"
                            onClick={() => toggleFavorite(w.wallet)}
                          >
                            {isFavorite(w.wallet) ? "REMOVE FAV" : "ADD FAV"}
                          </button>
                        </div>
                        <p className="text-[10px] text-gray-500 uppercase mb-1">{t("smart.detail.title")}</p>
                        <ExpandedWalletNarrativeSection wallet={w.wallet} narrativeLang={narrativeLang} />
                        <div className="mt-1">
                          <SmartWalletDetailPanel
                            row={w}
                            labelFor={labelFor}
                            titleFor={titleFor}
                            narrativeLang={narrativeLang}
                          />
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
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
  const [urlHydrated, setUrlHydrated] = useState(false);
  const [timeframe, setTimeframe] = useState("24h");

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
  const { isFavorite, toggle: toggleFavorite, favorites: favList } = useWalletFavorites();
  const favKey = favList.join(",");

  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const actRows = Array.isArray(activity.data?.rows) ? activity.data.rows : [];

  const addresses = useMemo(() => rows.map((r) => r.wallet).filter(Boolean), [rows]);
  const { labelFor, titleFor } = useWalletLabels(addresses);

  const ranked = useMemo(() => {
    return rows.map((w, i) => ({
      ...w,
      rank: i + 1
    }));
  }, [rows]);

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

  const onToggleExpand = useCallback((wallet) => {
    if (!wallet) return;
    setExpandedWallet((v) => (v === wallet ? "" : wallet));
  }, []);

  const medianWinRate = useMemo(() => {
    if (!displayedRanked.length) return null;
    return median(displayedRanked.map((w) => Number(w.winRate || 0)));
  }, [displayedRanked]);

  const avgPnl30 = useMemo(() => {
    if (!displayedRanked.length) return null;
    const sum = displayedRanked.reduce((a, w) => a + Number(w.pnl30d || 0), 0);
    return sum / displayedRanked.length;
  }, [displayedRanked]);

  const avgUnifiedScore = useMemo(() => {
    if (!displayedRanked.length) return null;
    const nums = displayedRanked.map((w) => Number(w.score)).filter(Number.isFinite);
    if (!nums.length) return null;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  }, [displayedRanked]);

  const activeProbes24h = useMemo(
    () => actRows.filter((r) => activityInTimeframe(r.createdAt, "24h")).length,
    [actRows]
  );

  return (
    <>
      <PageHead title={t("smart.pageTitle")} description={t("smart.pageDesc")} />
      <div className="min-h-screen bg-[#0B0F14] text-gray-100 p-1 font-sans overflow-x-hidden">
        <div className="flex flex-col gap-1 max-w-[1800px] mx-auto min-h-[calc(100vh-8px)]">
          <TopControlBar
            trending={trending}
            timeframe={timeframe}
            setTimeframe={setTimeframe}
            soloFavorites={soloFavorites}
            pushQuery={pushQuery}
            routerReady={router.isReady}
            limit={limit}
            chain={chain}
            setChain={setChain}
            minWinRate={minWinRate}
            setMinWinRate={setMinWinRate}
            minTrades={minTrades}
            setMinTrades={setMinTrades}
            narrativeLang={narrativeLang}
            derivedNarrative={derivedNarrative}
            setNarrativeOverride={setNarrativeOverride}
            refetchLb={refetch}
            t={t}
          />
          <KpiStrip
            totalTracked={displayedRanked.length}
            medianWinRate={medianWinRate}
            avgPnl30={avgPnl30}
            avgUnifiedScore={avgUnifiedScore}
            activeProbes24h={activeProbes24h}
          />
          {isLoading ? (
            <div className="border-b border-[#1F2937] px-2 py-2">
              <div className="text-[10px] font-mono text-gray-500">&gt; CONNECTING TO DATA STREAM...</div>
            </div>
          ) : null}
          {isError ? (
            <div className="border-b border-[#1F2937] px-2 py-2 text-[10px] font-mono text-gray-100">{error?.message || t("smart.errorFallback")}</div>
          ) : null}
          {!isLoading && !isError && rows.length === 0 ? (
            <div className="border-b border-[#1F2937] px-2 py-4 text-center">
              <p className="text-[10px] font-mono text-gray-500 uppercase">{t("smart.empty.title")}</p>
              <p className="text-[10px] font-mono text-gray-500 mt-1">{t("smart.empty.hint")}</p>
              <Link href="/pricing" className="inline-block mt-2 text-[10px] font-mono text-gray-400 border border-[#1F2937] px-2 py-1 uppercase">
                UPGRADE
              </Link>
            </div>
          ) : null}
          {!isLoading && !isError && rows.length > 0 && displayedRanked.length === 0 && soloFavorites ? (
            <div className="border-b border-[#1F2937] px-2 py-4 text-center">
              <p className="text-[10px] font-mono text-gray-500 uppercase">{t("smart.favEmpty.title", { limit })}</p>
              <p className="text-[10px] font-mono text-gray-500 mt-1">{t("smart.favEmpty.hint")}</p>
              <button
                type="button"
                className="mt-2 text-[10px] font-mono text-gray-400 border border-[#1F2937] px-2 py-1 uppercase"
                onClick={() => pushQuery({ favorites: undefined })}
              >
                CLEAR FAV FILTER
              </button>
            </div>
          ) : null}
          {!isLoading && !isError && displayedRanked.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-[7fr_3fr] gap-0 flex-1 min-h-0 border-t border-[#1F2937]">
              <WalletTable
                displayedRanked={displayedRanked}
                soloFavorites={soloFavorites}
                expandedWallet={expandedWallet}
                onToggleExpand={onToggleExpand}
                labelFor={labelFor}
                titleFor={titleFor}
                narrativeLang={narrativeLang}
                t={t}
                isFavorite={isFavorite}
                toggleFavorite={toggleFavorite}
              />
              <LiveSignalFeed
                rows={actRows}
                timeframe={timeframe}
                refetch={activity.refetch}
                isLoading={activity.isLoading}
                isError={activity.isError}
                error={activity.error}
                t={t}
              />
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
