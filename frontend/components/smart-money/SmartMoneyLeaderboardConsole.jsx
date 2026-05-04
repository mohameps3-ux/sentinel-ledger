import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  Bell,
  ChevronRight,
  Copy,
  Eye,
  Loader2,
  RefreshCw,
  Star
} from "lucide-react";
import toast from "react-hot-toast";
import { formatUsdWhole, formatDateTime } from "../../lib/formatStable";
import { SmartWalletDetailPanel } from "./SmartWalletDetailPanel";
import { WalletNarrativeCard } from "../WalletNarrativeCard";

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
  if (l === 0) return null;
  return w / l;
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

function relShort(iso) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const sec = Math.round((Date.now() - t) / 1000);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  return formatDateTime(iso);
}

function winRateBadgeClass(wr) {
  const n = Number(wr || 0);
  if (n > 70) return "bg-emerald-500/15 text-emerald-400 border-emerald-500/25";
  if (n > 50) return "bg-amber-500/15 text-amber-400 border-amber-500/25";
  return "bg-rose-500/10 text-rose-400 border-rose-500/25";
}

const cardShell = "rounded-lg border border-white/5 bg-[#0C0F14] shadow-sm";

/** @typedef {'rank'|'wallet'|'score'|'winRate'|'pnl30d'|'totalTrades'|'profitFactor'|'lastSeen'} SortKey */

export function SmartMoneyLeaderboardConsole({
  displayedRanked,
  soloFavorites,
  isLoadingLeaderboard,
  leaderboardError,
  activityRows,
  activityLoading,
  activityError,
  activityRefetch,
  timeframe,
  setTimeframe,
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
  refetchLeaderboard,
  labelFor,
  titleFor,
  isFavorite,
  toggleFavorite,
  medianWinRate,
  avgPnl30,
  avgUnifiedScore,
  activeProbes24h,
  rawRowCount,
  onClearFavoritesFilter,
  t
}) {
  const router = useRouter();
  const [sortBy, setSortBy] = useState(/** @type {SortKey} */ ("rank"));
  const [sortOrder, setSortOrder] = useState(/** @type {'asc'|'desc'} */ ("asc"));
  const [selectedWallet, setSelectedWallet] = useState("");

  const sortedRows = useMemo(() => {
    const list = displayedRanked.map((row) => ({
      ...row,
      _pf: profitFactorApprox(row.totalTrades, row.winRate)
    }));
    const dir = sortOrder === "asc" ? 1 : -1;
    const val = (row, key) => {
      switch (key) {
        case "rank":
          return row.rank;
        case "wallet":
          return row.wallet || "";
        case "score":
          return Number(row.score);
        case "winRate":
          return Number(row.winRate);
        case "pnl30d":
          return Number(row.pnl30d);
        case "totalTrades":
          return Number(row.totalTrades);
        case "profitFactor":
          return row._pf ?? 0;
        case "lastSeen":
          return row.lastSeen ? new Date(row.lastSeen).getTime() : 0;
        default:
          return 0;
      }
    };
    list.sort((a, b) => {
      const va = val(a, sortBy);
      const vb = val(b, sortBy);
      if (va === vb) return 0;
      if (typeof va === "string" && typeof vb === "string") {
        return va < vb ? -dir : dir;
      }
      return (Number(va) - Number(vb)) * dir;
    });
    return list;
  }, [displayedRanked, sortBy, sortOrder]);

  const selectedRow = useMemo(
    () => sortedRows.find((r) => r.wallet === selectedWallet) || null,
    [sortedRows, selectedWallet]
  );

  const onHeaderClick = useCallback((key) => {
    setSortBy((prev) => {
      if (prev === key) {
        setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortOrder(key === "wallet" || key === "rank" ? "asc" : "desc");
      return key;
    });
  }, []);

  const copyAddr = useCallback(async (addr) => {
    if (!addr) return;
    try {
      await navigator.clipboard.writeText(addr);
      toast.success("Address copied.");
    } catch {
      toast.error("Copy failed.");
    }
  }, []);

  const onFollow = useCallback(
    (addr) => {
      if (!addr) return;
      const was = isFavorite(addr);
      toggleFavorite(addr);
      toast.success(was ? "Removed from local favorites." : "Saved to local favorites (watchlist-style).");
    },
    [isFavorite, toggleFavorite]
  );

  const onMonitor = useCallback(
    (addr) => {
      if (!addr) return;
      toast("Opening wallet dossier…", { icon: "◎" });
      router.push(`/wallet/${addr}?lang=${narrativeLang || "en"}`);
    },
    [narrativeLang, router]
  );

  const filteredActivity = useMemo(
    () => activityRows.filter((r) => activityInTimeframe(r.createdAt, timeframe)),
    [activityRows, timeframe]
  );

  const filterCtl =
    "rounded-md border border-zinc-700/80 bg-black/30 text-[10px] font-mono text-zinc-200 px-2 py-1.5";

  return (
    <div className="mx-auto max-w-[1920px] px-4 pb-6 pt-4 font-sans text-zinc-100">
      {/* Toolbar */}
      <div className={`${cardShell} mb-6 px-4 py-3`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between min-w-0">
          <div className="min-w-0">
            <h1 className="text-[11px] font-mono font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Sentinel SMX · Smart money intelligence
            </h1>
            <p className="mt-0.5 text-[10px] text-zinc-500 font-mono">Live leaderboard + cross-market signals</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase text-zinc-500 font-mono">Limit</span>
            <select
              className={filterCtl}
              value={String(limit)}
              onChange={(e) => {
                const v = Math.min(100, Math.max(1, Number(e.target.value) || 50));
                pushQuery({ limit: v === 50 ? undefined : String(v) });
              }}
              disabled={!routerReady}
            >
              {[10, 20, 30, 50, 75, 100].map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </select>
            <span className="text-[10px] uppercase text-zinc-500 font-mono">Chain</span>
            <select className={filterCtl} value={chain} onChange={(e) => setChain(e.target.value)}>
              <option value="solana">{t("smart.filters.opt.solana")}</option>
              <option value="all">{t("smart.filters.opt.all")}</option>
            </select>
            <span className="text-[10px] uppercase text-zinc-500 font-mono">Min WR</span>
            <input
              type="number"
              min={0}
              max={100}
              className={`${filterCtl} w-14`}
              value={minWinRate || ""}
              placeholder="0"
              onChange={(e) => setMinWinRate(Number(e.target.value || 0))}
            />
            <span className="text-[10px] uppercase text-zinc-500 font-mono">Min TR</span>
            <input
              type="number"
              min={0}
              className={`${filterCtl} w-14`}
              value={minTrades || ""}
              placeholder="0"
              onChange={(e) => setMinTrades(Number(e.target.value || 0))}
            />
            <span className="text-[10px] uppercase text-zinc-500 font-mono">NAR</span>
            <select
              className={filterCtl}
              value={narrativeLang}
              onChange={(e) => {
                const v = e.target.value;
                setNarrativeOverride(v === derivedNarrative ? null : v);
              }}
            >
              <option value="es">ES</option>
              <option value="en">EN</option>
            </select>
            <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-mono text-zinc-500">
              <input
                type="checkbox"
                className="rounded border-zinc-600 bg-black/40"
                checked={soloFavorites}
                onChange={(e) => {
                  if (e.target.checked) pushQuery({ favorites: "1" });
                  else pushQuery({ favorites: undefined });
                }}
                disabled={!routerReady}
              />
              Fav only
            </label>
            {(["24h", "7d", "30d"]).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={`rounded-md border px-2 py-1.5 text-[10px] font-mono uppercase ${
                  timeframe === tf
                    ? "border-red-500/40 bg-red-500/10 text-red-300"
                    : "border-zinc-700/80 bg-black/30 text-zinc-500"
                }`}
              >
                {tf}
              </button>
            ))}
            <button
              type="button"
              onClick={() => refetchLeaderboard()}
              className="inline-flex items-center gap-1 rounded-md border border-zinc-700/80 bg-black/30 px-2 py-1.5 text-[10px] font-mono uppercase text-zinc-300 hover:bg-white/5"
            >
              <RefreshCw className="h-3 w-3" />
              Sync
            </button>
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          {
            label: "Tracked wallets",
            body:
              displayedRanked.length != null ? (
                <span className="text-2xl font-mono tabular-nums text-white">{displayedRanked.length}</span>
              ) : (
                "—"
              )
          },
          {
            label: "Median win rate",
            body:
              medianWinRate != null ? (
                <div className="space-y-1">
                  <span className="text-2xl font-mono tabular-nums text-white">{medianWinRate.toFixed(1)}%</span>
                  <div className="h-1 w-full overflow-hidden rounded bg-zinc-800">
                    <div
                      className="h-full rounded bg-emerald-500/70"
                      style={{ width: `${Math.min(100, medianWinRate)}%` }}
                    />
                  </div>
                </div>
              ) : (
                "—"
              )
          },
          {
            label: "Avg 30D PnL",
            body:
              avgPnl30 != null ? (
                <span
                  className={`text-2xl font-mono tabular-nums ${
                    avgPnl30 >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {avgPnl30 >= 0 ? "+" : "-"}${formatUsdWhole(Math.abs(avgPnl30))}
                </span>
              ) : (
                "—"
              )
          },
          {
            label: "Avg unified score",
            body:
              avgUnifiedScore != null ? (
                <span className="text-2xl font-mono tabular-nums text-white">{avgUnifiedScore.toFixed(1)}</span>
              ) : (
                "—"
              )
          },
          {
            label: "Active probes (24h)",
            body:
              activeProbes24h != null ? (
                <span className="text-2xl font-mono tabular-nums text-red-400/90">{activeProbes24h}</span>
              ) : (
                "—"
              )
          }
        ].map((k) => (
          <div key={k.label} className={`${cardShell} bg-white/[0.03] p-3`}>
            <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">{k.label}</p>
            <div className="mt-1 min-h-[2rem]">{k.body}</div>
          </div>
        ))}
      </div>

      {isLoadingLeaderboard ? (
        <div className={`${cardShell} flex items-center gap-2 p-6 text-zinc-500`}>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="font-mono text-xs">Loading leaderboard…</span>
        </div>
      ) : null}

      {leaderboardError ? (
        <div className={`${cardShell} border-rose-500/20 bg-rose-950/20 p-4 font-mono text-xs text-rose-200`}>
          {leaderboardError?.message || t("smart.errorFallback")}
        </div>
      ) : null}

      {!isLoadingLeaderboard && !leaderboardError && rawRowCount === 0 ? (
        <div className={`${cardShell} mx-auto max-w-lg p-8 text-center`}>
          <p className="font-mono text-xs uppercase text-zinc-500">{t("smart.empty.title")}</p>
          <p className="mt-2 font-mono text-[11px] text-zinc-500">{t("smart.empty.hint")}</p>
          <Link
            href="/pricing"
            className="mt-4 inline-block rounded-md border border-zinc-600 px-4 py-2 font-mono text-[10px] uppercase text-zinc-400 hover:bg-white/5"
          >
            Upgrade
          </Link>
        </div>
      ) : null}

      {!isLoadingLeaderboard &&
      !leaderboardError &&
      rawRowCount > 0 &&
      displayedRanked.length === 0 &&
      soloFavorites ? (
        <div className={`${cardShell} mx-auto max-w-lg border-amber-500/20 bg-amber-950/10 p-8 text-center`}>
          <p className="font-mono text-xs uppercase text-amber-200/80">{t("smart.favEmpty.title", { limit })}</p>
          <p className="mt-2 font-mono text-[11px] text-zinc-500">{t("smart.favEmpty.hint")}</p>
          <button
            type="button"
            className="mt-4 rounded-md border border-zinc-600 px-4 py-2 font-mono text-[10px] uppercase text-zinc-400 hover:bg-white/5"
            onClick={onClearFavoritesFilter}
          >
            Clear fav filter
          </button>
        </div>
      ) : null}

      {!isLoadingLeaderboard && !leaderboardError && displayedRanked.length > 0 ? (
        <div className="grid grid-cols-12 gap-6 lg:gap-8">
          {/* Main table — col-span-12 lg:col-span-8 */}
          <div className={`col-span-12 lg:col-span-8 ${cardShell} flex min-h-0 flex-col overflow-hidden`}>
            <div className="border-b border-white/5 px-4 py-2.5">
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                Wallet universe · {sortedRows.length} rows
              </span>
              {soloFavorites ? (
                <span className="ml-2 text-[10px] font-mono text-amber-400/90">Favorites filter on</span>
              ) : null}
            </div>
            <div className="max-h-[min(70vh,920px)] overflow-auto">
              <table className="w-full min-w-[880px] text-left text-[11px]">
                <thead className="sticky top-0 z-[1] bg-[#0C0F14]">
                  <tr className="border-b border-white/5 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                    {[
                      ["rank", "Rank"],
                      ["wallet", "Wallet"],
                      ["score", "Score"],
                      ["winRate", "Win rate"],
                      ["pnl30d", "30D PnL"],
                      ["totalTrades", "Trades (W/L)"],
                      ["profitFactor", "Profit factor"],
                      ["lastSeen", "Last active"],
                      [null, "Action"]
                    ].map(([key, label]) =>
                      key ? (
                        <th key={key} className="cursor-pointer select-none px-3 py-3 hover:text-zinc-300" scope="col">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 font-mono uppercase tracking-wider"
                            onClick={() => onHeaderClick(key)}
                          >
                            {label}
                            {sortBy === key ? (sortOrder === "asc" ? " ↑" : " ↓") : ""}
                          </button>
                        </th>
                      ) : (
                        <th key="action" className="px-3 py-3 font-mono uppercase tracking-wider" scope="col">
                          {label}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((w) => {
                    const wr = Number(w.winRate || 0);
                    const { w: wc, l: lc } = wlFromWinRate(w.totalTrades, w.winRate);
                    const pf = w._pf != null ? w._pf.toFixed(2) : "—";
                    const pnl = Number(w.pnl30d || 0);
                    const scoreNum = w.score != null && Number.isFinite(Number(w.score)) ? Number(w.score) : null;
                    const isSel = selectedWallet === w.wallet;
                    return (
                        <tr
                          key={w.wallet}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelectedWallet(w.wallet);
                            }
                          }}
                          onClick={(e) => {
                            const el = e.target;
                            if (el.closest?.("a,button,[data-no-row-select]")) return;
                            setSelectedWallet(w.wallet);
                          }}
                          className={`cursor-pointer border-b border-white/[0.04] transition-colors ${
                            isSel ? "bg-red-500/[0.07]" : "hover:bg-white/[0.04]"
                          }`}
                        >
                          <td className="px-3 py-4 font-mono tabular-nums text-zinc-300">
                            {soloFavorites ? `${w.rank} (${w.globalRank})` : w.rank}
                          </td>
                          <td className="max-w-[160px] px-3 py-4 font-mono text-zinc-200" title={titleFor?.(w.wallet)}>
                            <span className="text-indigo-300/90">{truncateWallet(w.wallet)}</span>
                            {labelFor?.(w.wallet) ? (
                              <span className="ml-1 text-[9px] text-zinc-500">· {labelFor(w.wallet)}</span>
                            ) : null}
                          </td>
                          <td className="px-3 py-4">
                            {scoreNum != null ? (
                              <div className="flex min-w-[100px] flex-col gap-1">
                                <div className="h-1.5 w-full overflow-hidden rounded bg-zinc-800">
                                  <div
                                    className="h-full rounded bg-gradient-to-r from-red-600/80 to-emerald-500/80"
                                    style={{ width: `${Math.min(100, Math.max(0, scoreNum))}%` }}
                                  />
                                </div>
                                <span className="font-mono tabular-nums text-zinc-200">{scoreNum.toFixed(1)}</span>
                              </div>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-3 py-4">
                            <span
                              className={`inline-flex rounded border px-2 py-0.5 font-mono tabular-nums text-[10px] ${winRateBadgeClass(wr)}`}
                            >
                              {wr.toFixed(1)}%
                            </span>
                          </td>
                          <td
                            className={`px-3 py-4 font-mono tabular-nums ${pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}
                          >
                            {pnl >= 0 ? "+" : "-"}${formatUsdWhole(Math.abs(pnl))}
                          </td>
                          <td className="px-3 py-4 font-mono tabular-nums text-zinc-300">
                            {w.totalTrades ?? "—"}{" "}
                            <span className="text-zinc-600">
                              ({wc}/{lc})
                            </span>
                          </td>
                          <td className="px-3 py-4 font-mono tabular-nums text-zinc-400">{pf}</td>
                          <td className="whitespace-nowrap px-3 py-4 font-mono text-zinc-500">
                            {w.lastSeen ? formatDateTime(w.lastSeen) : "—"}
                          </td>
                          <td className="px-3 py-4">
                            <div className="flex flex-wrap items-center gap-1.5" data-no-row-select>
                              <button
                                type="button"
                                onClick={() => onMonitor(w.wallet)}
                                className="inline-flex items-center gap-1 rounded border border-zinc-600/80 bg-black/20 px-2 py-1 text-[9px] font-mono uppercase text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                                title="Open wallet dossier"
                              >
                                <Bell className="h-3 w-3" />
                                Monitor
                              </button>
                              <button
                                type="button"
                                onClick={() => onFollow(w.wallet)}
                                className="inline-flex items-center gap-1 rounded border border-zinc-600/80 bg-black/20 px-2 py-1 text-[9px] font-mono uppercase text-zinc-400 hover:border-emerald-500/40 hover:text-emerald-300"
                                title="Local favorite"
                              >
                                <Eye className="h-3 w-3" />
                                {isFavorite(w.wallet) ? "Following" : "Follow"}
                              </button>
                            </div>
                          </td>
                        </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right intelligence rail — col-span-12 lg:col-span-4 */}
          <aside className="col-span-12 flex flex-col gap-4 lg:col-span-4">
            <div className={`${cardShell} flex min-h-[200px] flex-col`}>
              <div className="border-b border-white/5 px-4 py-2.5">
                <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Wallet intelligence</span>
              </div>
              <div className="flex-1 space-y-3 p-4">
                {!selectedRow ? (
                  <div className="rounded-md border border-dashed border-zinc-700/60 bg-black/20 p-4">
                    <p className="text-xs font-medium text-zinc-300">Select a wallet from the universe</p>
                    <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                      Row-click loads on-chain stats, behavior profile, and narrative context in this panel. Use
                      Monitor for full dossier or Follow for local favorites.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Address</p>
                        <p className="mt-1 break-all font-mono text-[11px] text-indigo-300/90" title={selectedRow.wallet}>
                          {truncateWallet(selectedRow.wallet)}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => copyAddr(selectedRow.wallet)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded border border-zinc-700/80 bg-black/30 text-zinc-400 hover:text-white"
                          title="Copy"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <Link
                          href={`/wallet/${selectedRow.wallet}?lang=${narrativeLang || "en"}`}
                          className="inline-flex h-8 items-center justify-center rounded border border-zinc-700/80 bg-black/30 px-2 text-[9px] font-mono uppercase text-zinc-400 hover:text-white"
                        >
                          Dossier
                        </Link>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        ["Score", selectedRow.score != null ? Number(selectedRow.score).toFixed(1) : "—"],
                        ["Win rate", `${Number(selectedRow.winRate || 0).toFixed(1)}%`],
                        [
                          "30D PnL",
                          `${Number(selectedRow.pnl30d || 0) >= 0 ? "+" : "-"}$${formatUsdWhole(Math.abs(Number(selectedRow.pnl30d || 0)))}`
                        ],
                        ["Last active", selectedRow.lastSeen ? relShort(selectedRow.lastSeen) : "—"]
                      ].map(([lab, val]) => (
                        <div key={lab} className="rounded-md border border-white/5 bg-black/25 p-2">
                          <p className="text-[9px] font-mono uppercase text-zinc-500">{lab}</p>
                          <p className="mt-0.5 font-mono text-xs text-zinc-200">{val}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onMonitor(selectedRow.wallet)}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-zinc-600 bg-zinc-900/50 py-2.5 text-[10px] font-mono uppercase tracking-wide text-zinc-200 hover:bg-zinc-800"
                      >
                        <Bell className="h-4 w-4" />
                        Monitor
                      </button>
                      <button
                        type="button"
                        onClick={() => onFollow(selectedRow.wallet)}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 py-2.5 text-[10px] font-mono uppercase tracking-wide text-emerald-300 hover:bg-emerald-500/20"
                      >
                        {isFavorite(selectedRow.wallet) ? (
                          <Star className="h-4 w-4 fill-current" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                        {isFavorite(selectedRow.wallet) ? "Following" : "Follow"}
                      </button>
                    </div>
                    <div className="max-h-[220px] overflow-y-auto rounded-md border border-white/5">
                      <WalletNarrativeCard walletAddress={selectedRow.wallet} lang={narrativeLang} />
                    </div>
                    <SmartWalletDetailPanel
                      row={selectedRow}
                      labelFor={labelFor}
                      titleFor={titleFor}
                      narrativeLang={narrativeLang}
                    />
                  </>
                )}
              </div>
            </div>

            <div className={`${cardShell} flex max-h-[min(52vh,560px)] min-h-[280px] flex-col overflow-hidden`}>
              <div className="flex items-center justify-between border-b border-white/5 px-4 py-2.5">
                <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Recent signals</span>
                <button
                  type="button"
                  onClick={() => activityRefetch()}
                  className="inline-flex items-center gap-1 text-[10px] font-mono uppercase text-zinc-500 hover:text-zinc-300"
                >
                  <RefreshCw className="h-3 w-3" />
                  Sync
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {activityLoading ? (
                  <div className="flex items-center gap-2 p-4 text-xs text-zinc-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Streaming…
                  </div>
                ) : null}
                {activityError ? (
                  <div className="p-4 text-xs text-rose-400/90">{activityError?.message || t("smart.activity.error")}</div>
                ) : null}
                {!activityLoading && !activityError && filteredActivity.length === 0 ? (
                  <div className="p-4 text-xs text-zinc-500">{t("smart.activity.empty")}</div>
                ) : null}
                {!activityLoading &&
                  !activityError &&
                  filteredActivity.map((r) => {
                    const tick = r.token ? truncateWallet(r.token) : "—";
                    const typ = signalTypeLabel(r.side);
                    const conf = Number.isFinite(r.confidence) ? Math.round(r.confidence) : "—";
                    return (
                      <div
                        key={`${r.wallet}-${r.token}-${r.createdAt}`}
                        className="flex items-start gap-2 border-b border-white/[0.04] px-4 py-3 hover:bg-white/[0.03]"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded border px-1.5 py-0 text-[9px] font-mono uppercase ${
                                typ === "SWAP"
                                  ? "border-amber-500/25 bg-amber-500/10 text-amber-300"
                                  : "border-cyan-500/25 bg-cyan-500/10 text-cyan-300"
                              }`}
                            >
                              {typ}
                            </span>
                            <span className="font-mono text-[10px] text-zinc-300">{tick}</span>
                            <span className="text-[10px] text-zinc-500">CONF {conf}%</span>
                          </div>
                          <p className="mt-1 text-[9px] font-mono text-zinc-600">{relShort(r.createdAt)}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600" aria-hidden />
                      </div>
                    );
                  })}
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
