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

function walletDecision(winRate, t) {
  const wr = Number(winRate || 0);
  if (wr >= 88) return { label: t("smart.decision.follow"), tone: "text-emerald-400" };
  if (wr >= 74) return { label: t("smart.decision.monitor"), tone: "text-amber-400" };
  return { label: t("smart.decision.ignore"), tone: "text-rose-500" };
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

function eventTargetInInteractive(t) {
  if (!t) return false;
  const el = t.nodeType === 1 ? t : t.parentElement;
  if (!el || typeof el.closest !== "function") return false;
  return Boolean(el.closest("a, button, [data-no-row-expand], summary, details"));
}

function median(nums) {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function truncateAddr(addr) {
  if (!addr || addr.length < 12) return addr || "—";
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
  const ms = tf === "24h" ? 86400000 : tf === "7d" ? 86400000 * 7 : 86400000 * 30;
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
      className="border border-[#1F2937] bg-[#0D1117] p-2"
    >
      <WalletNarrativeCard walletAddress={wallet} lang={narrativeLang} />
    </section>
  );
}

function TerminalHeader({
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
  return (
    <header className="border border-[#1F2937] bg-[#0D1117] px-2 py-1.5 flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-[11px] font-semibold tracking-widest uppercase text-gray-300">
          SENTINEL SMX // SMART MONEY LEADERBOARD
        </h1>
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[9px] font-mono text-gray-500">
            TREND:{trending.isError ? "[-]" : "[+]"}
          </span>
          <span className="flex items-center gap-1 text-[9px] font-mono text-emerald-400 uppercase">
            <span className="h-1.5 w-1.5 rounded-none bg-emerald-400 animate-pulse" aria-hidden />
            ENGINE LIVE
          </span>
          {(["24h", "7d", "30d"]).map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => setTimeframe(tf)}
              className={`px-2 py-0.5 border border-[#1F2937] text-[10px] font-mono uppercase transition-colors ${
                timeframe === tf ? "bg-[#111722] text-gray-100" : "text-gray-500 hover:bg-[#1a2233]"
              }`}
            >
              {tf}
            </button>
          ))}
          <details className="relative group" data-no-row-expand>
            <summary className="list-none cursor-pointer px-2 py-0.5 border border-[#1F2937] text-[10px] font-mono text-gray-400 hover:bg-[#1a2233] [&::-webkit-details-marker]:hidden">
              [ ≡ ]
            </summary>
            <div className="absolute right-0 mt-0.5 z-20 min-w-[160px] border border-[#1F2937] bg-[#0B0F14] py-0.5 text-[9px] font-mono divide-y divide-[#1F2937]">
              <Link href="/" className="block px-2 py-1 text-indigo-400 hover:bg-[#111722] hover:text-indigo-300">
                [ / ] HOME
              </Link>
              <Link href="/scanner" className="block px-2 py-1 text-indigo-400 hover:bg-[#111722] hover:text-indigo-300">
                [ &gt; ] SCANNER
              </Link>
              <Link href="/graveyard" className="block px-2 py-1 text-indigo-400 hover:bg-[#111722] hover:text-indigo-300">
                [ G ] GRAVEYARD
              </Link>
              <Link href="/wallet-stalker" className="block px-2 py-1 text-indigo-400 hover:bg-[#111722] hover:text-indigo-300">
                [ W ] WALLET STALKER
              </Link>
              <Link href="/watchlist" className="block px-2 py-1 text-indigo-400 hover:bg-[#111722] hover:text-indigo-300">
                [ WL ] WATCHLIST
              </Link>
              <Link href="/alerts" className="block px-2 py-1 text-indigo-400 hover:bg-[#111722] hover:text-indigo-300">
                [ A ] ALERTS
              </Link>
              <Link href="/compare" className="block px-2 py-1 text-indigo-400 hover:bg-[#111722] hover:text-indigo-300">
                [ C ] COMPARE
              </Link>
              <Link href="/portfolio" className="block px-2 py-1 text-indigo-400 hover:bg-[#111722] hover:text-indigo-300">
                [ P ] PORTFOLIO
              </Link>
              <Link href="/pricing" className="block px-2 py-1 text-indigo-400 hover:bg-[#111722] hover:text-indigo-300">
                [ $ ] PRICING
              </Link>
            </div>
          </details>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-1 text-[10px] text-gray-500">
        <label className="flex flex-col gap-0.5">
          <span className="text-[9px] uppercase tracking-widest">LIMIT</span>
          <select
            className="border border-[#1F2937] bg-[#0B0F14] px-2 py-0.5 font-mono text-[10px] text-gray-100"
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
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[9px] uppercase tracking-widest">CHAIN</span>
          <select
            className="border border-[#1F2937] bg-[#0B0F14] px-2 py-0.5 font-mono text-[10px] text-gray-100"
            value={chain}
            onChange={(e) => setChain(e.target.value)}
          >
            <option value="solana">{t("smart.filters.opt.solana")}</option>
            <option value="all">{t("smart.filters.opt.all")}</option>
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[9px] uppercase tracking-widest">MIN WR</span>
          <input
            type="number"
            min={0}
            max={100}
            className="border border-[#1F2937] bg-[#0B0F14] w-14 px-1 py-0.5 font-mono text-[10px] text-gray-100"
            value={minWinRate || ""}
            placeholder="0"
            onChange={(e) => setMinWinRate(Number(e.target.value || 0))}
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[9px] uppercase tracking-widest">MIN TR</span>
          <input
            type="number"
            min={0}
            className="border border-[#1F2937] bg-[#0B0F14] w-14 px-1 py-0.5 font-mono text-[10px] text-gray-100"
            value={minTrades || ""}
            placeholder="0"
            onChange={(e) => setMinTrades(Number(e.target.value || 0))}
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[9px] uppercase tracking-widest">NAR</span>
          <select
            className="border border-[#1F2937] bg-[#0B0F14] px-2 py-0.5 font-mono text-[10px] text-gray-100"
            value={narrativeLang}
            onChange={(e) => {
              const v = e.target.value;
              setNarrativeOverride(v === derivedNarrative ? null : v);
            }}
          >
            <option value="es">ES</option>
            <option value="en">EN</option>
          </select>
        </label>
        <label className="flex items-center gap-1 px-1 pb-0.5 cursor-pointer">
          <input
            type="checkbox"
            className="rounded-sm border-[#1F2937] h-3 w-3"
            checked={soloFavorites}
            onChange={(e) => {
              if (e.target.checked) pushQuery({ favorites: "1" });
              else pushQuery({ favorites: undefined });
            }}
            disabled={!routerReady}
          />
          <span className="text-[9px] uppercase tracking-widest text-gray-500">FAV ONLY</span>
        </label>
        <button
          type="button"
          onClick={() => refetchLb()}
          className="ml-auto px-2 py-0.5 border border-[#1F2937] font-mono text-[9px] text-gray-400 hover:bg-[#1a2233]"
        >
          [ REFRESH LB ]
        </button>
      </div>
    </header>
  );
}

function MetricsRow({ totalTracked, medianWinRate, avgPnl30, avgUnifiedScore, activeProbes24h }) {
  const cells = [
    { label: "TOTAL TRACKED WALLETS", value: totalTracked != null ? String(totalTracked) : "—" },
    { label: "MEDIAN WIN RATE", value: medianWinRate != null ? `${medianWinRate.toFixed(1)}%` : "—" },
    { label: "AVG 30D PnL", value: avgPnl30 != null ? `+$${formatUsdWhole(avgPnl30)}` : "—" },
    { label: "AVG UNIFIED SCORE", value: avgUnifiedScore != null ? avgUnifiedScore.toFixed(2) : "—" },
    { label: "ACTIVE PROBES (24H)", value: activeProbes24h != null ? String(activeProbes24h) : "—" }
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1">
      {cells.map((c) => (
        <div key={c.label} className="flex flex-col p-2 border border-[#1F2937] bg-[#0D1117]">
          <span className="text-[9px] text-gray-500 uppercase tracking-wide">{c.label}</span>
          <span className="text-base font-mono text-gray-100 tabular-nums mt-0.5">{c.value}</span>
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
    <aside className="border border-[#1F2937] bg-[#0D1117] flex flex-col min-h-0 lg:sticky lg:top-1 lg:max-h-[calc(100vh-72px)]">
      <div className="text-[10px] border-b border-[#1F2937] p-2 font-semibold tracking-widest uppercase text-gray-300 flex items-center justify-between gap-1">
        <span>RECENT MARKET SIGNALS</span>
        <button
          type="button"
          onClick={() => refetch()}
          className="font-mono text-[9px] text-indigo-400 hover:text-indigo-300 px-1"
        >
          [ SYNC ]
        </button>
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-[#1F2937] min-h-[120px]">
        {isLoading ? (
          <div className="p-4 text-[10px] font-mono text-gray-500 animate-pulse">
            &gt; CONNECTING TO DATA STREAM...
          </div>
        ) : null}
        {isError ? (
          <div className="p-2 text-[10px] font-mono text-rose-500">{error?.message || t("smart.activity.error")}</div>
        ) : null}
        {!isLoading && !isError && filtered.length === 0 ? (
          <div className="p-2 text-[10px] font-mono text-gray-500">{t("smart.activity.empty")}</div>
        ) : null}
        {!isLoading &&
          !isError &&
          filtered.map((r) => {
            const tick = r.token ? truncateAddr(r.token) : "—";
            const typ = signalTypeLabel(r.side);
            const conf = Number.isFinite(r.confidence) ? Math.round(r.confidence) : "—";
            const ts = r.createdAt ? formatDateTime(r.createdAt) : "—";
            const buySell = String(r.side || "").toLowerCase().includes("sell") ? "[-]" : "[+]";
            return (
              <div key={`${r.wallet}-${r.token}-${r.createdAt}`} className="p-2 hover:bg-[#111722] transition-colors">
                <div className="text-[10px] font-mono text-gray-100">
                  {buySell} {tick}{" "}
                  <span className="text-amber-400">{typ}</span>{" "}
                  <span className="text-gray-500">CONF</span>{" "}
                  <span className={Number(conf) >= 60 ? "text-emerald-400" : "text-gray-400"}>{conf}%</span>
                </div>
                <div className="text-[9px] font-mono text-gray-500 mt-0.5">{ts}</div>
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
  isFavorite,
  toggleFavorite,
  labelFor,
  titleFor,
  narrativeLang,
  t,
  onCopyWallet
}) {
  return (
    <div className="border border-[#1F2937] bg-[#0D1117] min-w-0 flex flex-col min-h-0 flex-1">
      <div className="text-[10px] border-b border-[#1F2937] p-2 font-semibold tracking-widest uppercase text-gray-300">
        WALLET UNIVERSE // {displayedRanked.length} ROWS
      </div>
      <div className="overflow-auto flex-1 min-h-[200px]">
        <table className="w-full min-w-[920px] border-collapse text-left">
          <thead className="sticky top-0 z-[1] bg-[#0B0F14]">
            <tr className="border-b border-[#1F2937]">
              {["", "RANK", "WALLET", "SCORE", "WIN RATE", "30D PnL", "TRADES (W/L)", "PROFIT FACTOR", "LAST ACTIVE", "ACTION"].map(
                (h) => (
                  <th
                    key={h || "fav"}
                    className="text-[11px] font-semibold tracking-widest uppercase text-gray-500 px-1 py-1.5 font-sans"
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1F2937]">
            {displayedRanked.map((w, idx) => {
              const raw = Number(w.winRate || 0);
              const { w: wc, l: lc } = wlFromWinRate(w.totalTrades, w.winRate);
              const pf = profitFactorApprox(w.totalTrades, w.winRate);
              const pnl = Number(w.pnl30d || 0);
              const pnlCls = pnl >= 0 ? "text-emerald-400" : "text-rose-500";
              const wrCls = raw >= 50 ? "text-emerald-400" : "text-rose-500";
              const rowBg = idx % 2 === 0 ? "bg-[#0D1117]" : "bg-[#111722]";
              const uScore = w.score != null && Number.isFinite(Number(w.score)) ? Number(w.score) : null;
              const dec = walletDecision(w.winRate, t);
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
                    className={`${rowBg} hover:bg-[#1a2233] transition-colors border-b border-[#1F2937] cursor-pointer`}
                  >
                    <td className="p-1 align-middle">
                      <button
                        type="button"
                        data-no-row-expand
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(w.wallet);
                        }}
                        className="font-mono text-[9px] text-amber-400 hover:text-amber-300 px-0.5"
                      >
                        {isFavorite(w.wallet) ? "[★]" : "[ ]"}
                      </button>
                    </td>
                    <td className="p-1 align-middle font-mono text-[10px] text-gray-100">
                      {soloFavorites ? (
                        <>
                          #{w.rank}
                          <span className="block text-[9px] text-gray-500">
                            GLB {w.globalRank}
                          </span>
                        </>
                      ) : (
                        w.rank
                      )}
                    </td>
                    <td className="p-1 align-middle min-w-[120px]">
                      <div className="text-[10px] text-gray-100 font-medium truncate" title={titleFor(w.wallet)}>
                        {labelFor(w.wallet)}
                      </div>
                      <div className="font-mono text-[10px] text-gray-500 truncate" title={w.wallet}>
                        {truncateAddr(w.wallet)}
                      </div>
                      {hasLowHorizonSample(w.profile) ? (
                        <span className="text-[9px] font-mono text-amber-400">[!] LOW N</span>
                      ) : null}
                    </td>
                    <td className="p-1 align-middle font-mono text-[10px] text-gray-100 tabular-nums">
                      {uScore != null ? uScore.toFixed(2) : "—"}
                    </td>
                    <td className={`p-1 align-middle font-mono text-[10px] tabular-nums ${wrCls}`}>
                      {Number(w.winRate || 0).toFixed(1)}%
                    </td>
                    <td className={`p-1 align-middle font-mono text-[10px] tabular-nums ${pnlCls}`}>
                      {pnl >= 0 ? "+" : "-"}${formatUsdWhole(Math.abs(pnl))}
                    </td>
                    <td className="p-1 align-middle font-mono text-[10px] text-gray-100 tabular-nums">
                      {w.totalTrades ?? "—"}{" "}
                      <span className="text-gray-500">
                        ({wc}/{lc})
                      </span>
                    </td>
                    <td className="p-1 align-middle font-mono text-[10px] text-gray-100 tabular-nums">
                      {pf ?? "—"}
                    </td>
                    <td className="p-1 align-middle font-mono text-[10px] text-gray-400 whitespace-nowrap">
                      {w.lastSeen ? formatDateTime(w.lastSeen) : "—"}
                    </td>
                    <td className="p-1 align-middle" onClick={(e) => e.stopPropagation()}>
                      <details className="relative" data-no-row-expand>
                        <summary className="list-none cursor-pointer font-mono text-[9px] text-indigo-400 hover:text-indigo-300 px-0.5 [&::-webkit-details-marker]:hidden">
                          [ ··· ]
                        </summary>
                        <div className="absolute right-0 mt-0.5 z-10 min-w-[140px] border border-[#1F2937] bg-[#0B0F14] py-0.5 text-[9px] font-mono">
                          <button
                            type="button"
                            className="block w-full text-left px-2 py-1 text-indigo-400 hover:bg-[#111722]"
                            onClick={() => onCopyWallet(w.wallet)}
                          >
                            [ COPY ]
                          </button>
                          <Link
                            href={`/wallet/${w.wallet}?lang=${narrativeLang}`}
                            className="block px-2 py-1 text-indigo-400 hover:bg-[#111722]"
                          >
                            [ ANALYZE ]
                          </Link>
                          <Link
                            href={`/wallet/${w.wallet}?lang=${narrativeLang}#behavior-memory`}
                            className="block px-2 py-1 text-indigo-400 hover:bg-[#111722]"
                          >
                            [ BEHAVIOR ]
                          </Link>
                          {w.bestTradeMint ? (
                            <Link
                              href={`/token/${w.bestTradeMint}`}
                              className="block px-2 py-1 text-indigo-400 hover:bg-[#111722]"
                            >
                              [ TOKEN ]
                            </Link>
                          ) : null}
                        </div>
                      </details>
                      <div className={`text-[9px] font-mono mt-0.5 ${dec.tone}`}>{dec.label}</div>
                    </td>
                  </tr>
                  {expandedWallet === w.wallet ? (
                    <tr className="bg-[#0B0F14] border-b border-[#1F2937]">
                      <td colSpan={10} className="p-2">
                        <p className="text-[10px] font-semibold tracking-wide text-gray-500 mb-1">{t("smart.detail.title")}</p>
                        <ExpandedWalletNarrativeSection wallet={w.wallet} narrativeLang={narrativeLang} />
                        <div className="mt-2">
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

  const onCopyWallet = useCallback(async (addr) => {
    if (!addr) return;
    try {
      await navigator.clipboard.writeText(addr);
    } catch {
      /* ignore */
    }
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
      <div className="min-h-screen bg-[#0B0F14] text-gray-100 p-1 pb-4 font-sans overflow-x-hidden">
        <div className="max-w-[1600px] mx-auto flex flex-col gap-1 min-h-[calc(100vh-8px)]">
          <TerminalHeader
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

          <div className="text-[9px] font-mono text-gray-500 px-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
            <span>
              [ META ] {soloFavorites ? `FAV · ${displayedRanked.length}` : `TOP ${limit}`} · SRC {meta.source || "—"}{" "}
              {heroRowsSuffix}
            </span>
            {favCount > 0 ? <span>[ FAV STORAGE ] {favCount}</span> : null}
            <span>{t("smart.filters.roiNote")}</span>
          </div>

          <MetricsRow
            totalTracked={displayedRanked.length}
            medianWinRate={medianWinRate}
            avgPnl30={avgPnl30}
            avgUnifiedScore={avgUnifiedScore}
            activeProbes24h={activeProbes24h}
          />

          {isLoading ? (
            <div className="border border-[#1F2937] bg-[#0D1117] p-6">
              <div className="text-[10px] font-mono text-gray-500 animate-pulse">&gt; CONNECTING TO DATA STREAM...</div>
            </div>
          ) : null}

          {isError ? (
            <div className="border border-[#1F2937] bg-[#0D1117] p-4 text-[10px] font-mono text-rose-500">
              {error?.message || t("smart.errorFallback")}
            </div>
          ) : null}

          {!isLoading && !isError && ranked.length === 0 ? (
            <div className="border border-[#1F2937] bg-[#0D1117] p-6 text-center space-y-2">
              <p className="text-[10px] font-mono text-gray-500 uppercase">{t("smart.empty.title")}</p>
              <p className="text-[10px] font-mono text-gray-500 max-w-lg mx-auto">{t("smart.empty.hint")}</p>
              <Link
                href="/pricing"
                className="inline-block text-[10px] font-mono text-indigo-400 hover:text-indigo-300 border border-[#1F2937] px-2 py-1"
              >
                [ UPGRADE ]
              </Link>
            </div>
          ) : null}

          {!isLoading && !isError && ranked.length > 0 && displayedRanked.length === 0 && soloFavorites ? (
            <div className="border border-amber-900/50 bg-[#0D1117] p-6 text-center space-y-2">
              <p className="text-[10px] font-mono text-amber-400 uppercase">{t("smart.favEmpty.title", { limit })}</p>
              <p className="text-[10px] font-mono text-gray-500">{t("smart.favEmpty.hint")}</p>
              <button
                type="button"
                className="text-[10px] font-mono text-indigo-400 border border-[#1F2937] px-2 py-1 hover:bg-[#111722]"
                onClick={() => pushQuery({ favorites: undefined })}
              >
                [ CLEAR FAV FILTER ]
              </button>
            </div>
          ) : null}

          {!isLoading && !isError && displayedRanked.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-1 flex-1 min-h-0">
              <div className="lg:col-span-9 flex flex-col min-h-[280px] min-w-0">
                <WalletTable
                  displayedRanked={displayedRanked}
                  soloFavorites={soloFavorites}
                  expandedWallet={expandedWallet}
                  onToggleExpand={onToggleExpand}
                  isFavorite={isFavorite}
                  toggleFavorite={toggleFavorite}
                  labelFor={labelFor}
                  titleFor={titleFor}
                  narrativeLang={narrativeLang}
                  t={t}
                  onCopyWallet={onCopyWallet}
                />
              </div>
              <div className="lg:col-span-3 flex flex-col min-h-[200px] min-w-0">
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
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
