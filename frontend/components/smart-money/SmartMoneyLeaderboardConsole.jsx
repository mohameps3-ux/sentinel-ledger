import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  Activity,
  Bell,
  ChevronRight,
  Copy,
  Eye,
  Loader2,
  Radio,
  RefreshCw,
  Star
} from "lucide-react";
import toast from "react-hot-toast";
import { formatUsdWhole, formatDateTime } from "../../lib/formatStable";
import { SmartWalletDetailPanel } from "./SmartWalletDetailPanel";
import { WalletNarrativeCard } from "../WalletNarrativeCard";
import { ProPurchaseButton } from "../subscription/ProPurchaseButton";

function truncateWallet(addr) {
  if (!addr || addr.length < 9) return addr || "—";
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function wlFromWinRate(totalTrades, winRate) {
  const tt = Number(totalTrades || 0);
  const wr = Number(winRate || 0);
  if (!tt) return { w: 0, l: 0 };
  const w = Math.round(tt * (wr / 100));
  const l = Math.max(0, tt - w);
  return { w, l };
}

/** Leaderboard composite rank score (API `unifiedScore`, legacy `score`) — not DB `smartScore`. */
function leaderboardUnifiedScore(row) {
  const u = row.unifiedScore != null ? Number(row.unifiedScore) : null;
  if (u != null && Number.isFinite(u)) return u;
  const s = row.score != null ? Number(row.score) : null;
  if (s != null && Number.isFinite(s)) return s;
  return null;
}

/** Table display: server `profitFactor` only. */
function profitFactorDisplay(row) {
  if (row.profitFactor == null || row.profitFactor === "") return "—";
  const s = Number(row.profitFactor);
  if (Number.isFinite(s)) return s.toFixed(2);
  return "—";
}

/** Sort by server `profitFactor` only (missing → 0). */
function profitFactorSortValue(row) {
  const s = Number(row.profitFactor);
  return Number.isFinite(s) ? s : 0;
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
  if (n > 70) return "bg-emerald-950/40 text-emerald-400/95 ring-1 ring-emerald-800/40";
  if (n > 50) return "bg-amber-950/35 text-amber-400/90 ring-1 ring-amber-900/35";
  return "bg-rose-950/30 text-rose-400/85 ring-1 ring-rose-900/30";
}

const INACTIVITY_DECAY_TOOLTIP =
  "Ranking decay uses last on-chain activity (wallet_tokens.bought_at) when available, falling back to last gated signal.";

/** Server fields `daysInactive` / `decayMultiplier`; label tiers match leaderboard decay bands. */
function inactivityDecayBadge(row) {
  const mult = row.decayMultiplier != null ? Number(row.decayMultiplier) : 1;
  if (!Number.isFinite(mult) || mult >= 1) return null;
  const d = row.daysInactive != null ? Number(row.daysInactive) : null;
  let label = null;
  if (d != null && Number.isFinite(d)) {
    if (d > 30) label = "dormant";
    else if (d > 14) label = "inactive";
    else if (d > 7) label = "stale";
  }
  if (!label) {
    if (mult <= 0.31) label = "dormant";
    else if (mult <= 0.51) label = "inactive";
    else label = "stale";
  }
  const styles = {
    dormant: "bg-zinc-800/55 text-zinc-500 ring-zinc-600/35",
    inactive: "bg-zinc-800/45 text-zinc-500 ring-zinc-600/30",
    stale: "bg-zinc-800/40 text-zinc-500 ring-zinc-600/25"
  };
  return { label, className: styles[label] || styles.stale };
}

/** @typedef {'rank'|'wallet'|'unifiedScore'|'winRate'|'pnl30d'|'totalTrades'|'profitFactor'|'lastCheckedAt'} SortKey */

/** Poll time for table column; until first poll after deploy, fall back to last trade time. */
function leaderboardCheckedIso(row) {
  return row?.lastCheckedAt || row?.lastSeen || null;
}

/** Honest "last seen trading" timestamp: prefer real on-chain activity (wallet_tokens.bought_at)
 *  over the gated last_seen which only ticks when our system emits a signal for the wallet. */
function leaderboardActivityIso(row) {
  const onchain = row?.lastOnchainActivityAt;
  const lastSeen = row?.lastSeen;
  if (onchain && lastSeen) {
    return new Date(onchain).getTime() >= new Date(lastSeen).getTime() ? onchain : lastSeen;
  }
  return onchain || lastSeen || null;
}

function StatusDot({ tone }) {
  const map = {
    ok: "bg-emerald-600/80",
    load: "bg-amber-600/75",
    err: "bg-rose-700/75"
  };
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${map[tone] || map.load}`} aria-hidden />;
}

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
  medianPnl30,
  meanPnl30,
  medianUnifiedScore,
  meanUnifiedScore,
  activeProbes24h,
  totalSmartWallets,
  totalBehaviorProfiles,
  dataComputedAt,
  onRefreshAll,
  profitableOnly,
  setProfitableOnly,
  rawRowCount,
  onClearFavoritesFilter,
  t
}) {
  const router = useRouter();
  const [sortBy, setSortBy] = useState(/** @type {SortKey} */ ("rank"));
  const [sortOrder, setSortOrder] = useState(/** @type {'asc'|'desc'} */ ("asc"));
  const [selectedWallet, setSelectedWallet] = useState("");

  const sortedRows = useMemo(() => {
    const list = displayedRanked.slice();
    const dir = sortOrder === "asc" ? 1 : -1;
    const val = (row, key) => {
      switch (key) {
        case "rank":
          return row.rank;
        case "wallet":
          return row.wallet || "";
        case "unifiedScore":
          return leaderboardUnifiedScore(row) ?? 0;
        case "winRate":
          return Number(row.winRate);
        case "pnl30d":
          return Number(row.pnl30d);
        case "totalTrades":
          return Number(row.totalTrades);
        case "profitFactor":
          return profitFactorSortValue(row);
        case "lastCheckedAt": {
          const iso = leaderboardCheckedIso(row);
          return iso ? new Date(iso).getTime() : 0;
        }
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

  const filteredActivity = useMemo(
    () => activityRows.filter((r) => activityInTimeframe(r.createdAt, timeframe)),
    [activityRows, timeframe]
  );

  const signalQuality = useMemo(() => {
    const confs = filteredActivity
      .map((r) => r.confidence)
      .filter((c) => Number.isFinite(Number(c)))
      .map(Number);
    if (!confs.length) return { avg: null, high: 0, n: 0 };
    const avg = confs.reduce((a, b) => a + b, 0) / confs.length;
    const high = confs.filter((c) => c >= 50).length;
    return { avg, high, n: confs.length };
  }, [filteredActivity]);

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

  const filterCtl =
    "h-8 rounded-md border-0 bg-[#141A24]/90 px-2.5 text-[11px] text-zinc-300 outline-none ring-1 ring-white/[0.06] focus:ring-white/12";

  const connectorsOk = !leaderboardError && !activityError;
  const chainLabel = chain === "all" ? "MULTI" : "SOL";

  return (
    <div
      className="smx-console min-h-screen bg-[#090C11] font-sans text-zinc-200 antialiased selection:bg-emerald-900/40"
      style={{ fontFamily: "var(--font-inter), Inter, system-ui, sans-serif" }}
    >
      <div className="mx-auto max-w-[1920px] px-6 pb-12 pt-6 lg:px-8">
        {/* TOP STATUS BAR */}
        <div className="mb-8 flex min-h-11 flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-white/[0.06] pb-4">
          <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-2">
              <StatusDot
                tone={leaderboardError ? "err" : isLoadingLeaderboard ? "load" : "ok"}
              />
              <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">Feed</span>
            </div>
            <div className="flex items-center gap-2">
              <StatusDot tone={activityError ? "err" : activityLoading ? "load" : "ok"} />
              <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">Probe stream</span>
            </div>
            <div className="flex items-center gap-2">
              <Radio className="h-3.5 w-3.5 text-zinc-500" aria-hidden />
              <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">{chainLabel}</span>
            </div>
            <div className="hidden h-4 w-px bg-white/[0.08] sm:block" aria-hidden />
            <div className="flex items-center gap-2 text-[11px] text-zinc-400">
              <Activity className="h-3.5 w-3.5 text-zinc-500" />
              <span className="font-medium tracking-wide">Signals ·</span>
              <span className="font-mono tabular-nums text-zinc-300">{filteredActivity.length}</span>
              <span className="text-zinc-600">·</span>
              <span className="text-zinc-500">{timeframe} window</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => refetchLeaderboard()}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[11px] font-medium text-zinc-400 ring-1 ring-white/[0.06] transition hover:bg-white/[0.04] hover:text-zinc-200"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
            <span
              className={`hidden text-[10px] font-medium uppercase tracking-[0.12em] sm:inline ${
                connectorsOk ? "text-emerald-600/90" : "text-amber-600/85"
              }`}
            >
              {connectorsOk ? "Systems nominal" : "Degraded"}
            </span>
          </div>
        </div>

        {/* Title + controls — secondary, airy */}
        <div className="mb-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Smart money</p>
            <h1 className="mt-1 text-lg font-medium tracking-tight text-zinc-100">Wallet intelligence console</h1>
            <p className="mt-2 max-w-xl text-sm font-normal leading-relaxed text-zinc-500">
              Institutional ranking and live market probes. One primary grid, one persistent context rail — no
              side-by-side lists.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Limit</span>
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
            <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Chain</span>
            <select className={filterCtl} value={chain} onChange={(e) => setChain(e.target.value)}>
              <option value="solana">{t("smart.filters.opt.solana")}</option>
              <option value="all">{t("smart.filters.opt.all")}</option>
            </select>
            <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Min WR</span>
            <input
              type="number"
              min={0}
              max={100}
              className={`${filterCtl} w-16`}
              value={minWinRate || ""}
              placeholder="0"
              onChange={(e) => setMinWinRate(Number(e.target.value || 0))}
            />
            <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Min trades</span>
            <input
              type="number"
              min={0}
              className={`${filterCtl} w-16`}
              value={minTrades || ""}
              placeholder="0"
              onChange={(e) => setMinTrades(Number(e.target.value || 0))}
            />
            <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Narrative</span>
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
            <label
              className="flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-emerald-400/85"
              title="Filter out wallets with negative 30D PnL. Use when you want only profitable smart money."
            >
              <input
                type="checkbox"
                className="rounded border-emerald-600/60 bg-[#141A24] accent-emerald-500"
                checked={Boolean(profitableOnly)}
                onChange={(e) => {
                  if (typeof setProfitableOnly === "function") setProfitableOnly(e.target.checked);
                }}
              />
              Profitable only
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-zinc-500">
              <input
                type="checkbox"
                className="rounded border-zinc-600/60 bg-[#141A24]"
                checked={soloFavorites}
                onChange={(e) => {
                  if (e.target.checked) pushQuery({ favorites: "1" });
                  else pushQuery({ favorites: undefined });
                }}
                disabled={!routerReady}
              />
              Favorites only
            </label>
            <div className="flex rounded-md p-0.5 ring-1 ring-white/[0.06]">
              {(["24h", "7d", "30d"]).map((tf) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => setTimeframe(tf)}
                  className={`px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                    timeframe === tf
                      ? "rounded bg-zinc-700/50 text-zinc-100"
                      : "text-zinc-500 hover:text-zinc-400"
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* HERO / SUMMARY STRIP — one clean row, layered surface */}
        <div className="mb-10 rounded-2xl bg-gradient-to-b from-[#101620]/90 to-[#0D1118]/90 px-6 py-7 lg:px-10 lg:py-8">
          <div className="flex flex-col gap-8 lg:flex-row lg:flex-nowrap lg:items-start lg:justify-between lg:gap-12">
            {[
              {
                k: "Total tracked wallets",
                tooltip:
                  "Registry rows in smart_wallets (includes Helius shells). Behavior profiles = wallets with resolved outcome memory in wallet_behavior_stats — used for reputation ranking.",
                v: (() => {
                  const shown = Array.isArray(displayedRanked) ? displayedRanked.length : 0;
                  const total = Number.isFinite(Number(totalSmartWallets))
                    ? Number(totalSmartWallets)
                    : null;
                  const behaviorN = Number.isFinite(Number(totalBehaviorProfiles))
                    ? Number(totalBehaviorProfiles)
                    : null;
                  if (total != null && total > 0) {
                    return (
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-3xl font-medium tabular-nums tracking-tight text-zinc-50">
                            {total}
                          </span>
                          <span className="font-mono text-xs tabular-nums text-zinc-500">· top {shown} shown</span>
                        </div>
                        {behaviorN != null ? (
                          <span className="font-mono text-[10px] tabular-nums text-zinc-500">
                            {behaviorN.toLocaleString()} behavior profiles synced
                          </span>
                        ) : null}
                      </div>
                    );
                  }
                  return shown > 0 ? (
                    <span className="font-mono text-3xl font-medium tabular-nums tracking-tight text-zinc-50">
                      {shown}
                    </span>
                  ) : (
                    "—"
                  );
                })()
              },
              {
                k: "Median win rate",
                tooltip: "Median of win_rate across the wallets currently shown (rolling 30-day window).",
                v:
                  medianWinRate != null ? (
                    <div className="space-y-3">
                      <span className="font-mono text-3xl font-medium tabular-nums tracking-tight text-zinc-50">
                        {medianWinRate.toFixed(1)}
                        <span className="text-lg text-zinc-500">%</span>
                      </span>
                      <div className="h-1 max-w-[140px] overflow-hidden rounded-full bg-zinc-800/80">
                        <div
                          className="h-full rounded-full bg-emerald-700/55"
                          style={{ width: `${Math.min(100, medianWinRate)}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    "—"
                  )
              },
              {
                k: "Median 30D PnL",
                tooltip:
                  meanPnl30 != null
                    ? `Median net PnL across the wallets shown (rolling 30d). Median (not mean) is used because one high-volume bot wallet can dominate the average. Mean for reference: ${meanPnl30 >= 0 ? "+" : "-"}$${formatUsdWhole(Math.abs(meanPnl30))}.`
                    : "Median net PnL across the wallets shown (rolling 30d). Median is used instead of mean because outliers (high-volume bot wallets) distort the average.",
                v:
                  medianPnl30 != null ? (
                    <div className="space-y-1.5">
                      <span
                        className={`font-mono text-3xl font-medium tabular-nums tracking-tight ${
                          medianPnl30 >= 0 ? "text-emerald-500/85" : "text-rose-500/80"
                        }`}
                      >
                        {medianPnl30 >= 0 ? "+" : "-"}${formatUsdWhole(Math.abs(medianPnl30))}
                      </span>
                      {meanPnl30 != null && Number.isFinite(meanPnl30) ? (
                        <div className="font-mono text-[10px] tabular-nums text-zinc-500">
                          mean {meanPnl30 >= 0 ? "+" : "-"}${formatUsdWhole(Math.abs(meanPnl30))}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    "—"
                  )
              },
              {
                k: "Median Unified Score",
                tooltip:
                  meanUnifiedScore != null
                    ? `Median of unifiedScore (0-100): 50% win rate + 30% trades confidence + 20% PnL influence. Mean for reference: ${meanUnifiedScore.toFixed(1)}.`
                    : "Median of unifiedScore (0-100): 50% win rate + 30% trades confidence + 20% PnL influence.",
                v:
                  medianUnifiedScore != null ? (
                    <div className="space-y-1.5">
                      <span className="font-mono text-3xl font-medium tabular-nums tracking-tight text-zinc-50">
                        {medianUnifiedScore.toFixed(1)}
                      </span>
                      {meanUnifiedScore != null && Number.isFinite(meanUnifiedScore) ? (
                        <div className="font-mono text-[10px] tabular-nums text-zinc-500">
                          mean {meanUnifiedScore.toFixed(1)}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    "—"
                  )
              },
              {
                k: "Active probes",
                tooltip:
                  "Smart-wallet emissions tracked in the last 24h (counted server-side over the whole universe, not capped by page size).",
                v:
                  activeProbes24h != null ? (
                    <span className="font-mono text-3xl font-medium tabular-nums tracking-tight text-zinc-200">
                      {activeProbes24h}
                      <span className="ml-2 text-sm font-normal text-zinc-500">/ 24h</span>
                    </span>
                  ) : (
                    "—"
                  )
              }
            ].map((item, i) => (
              <div
                key={item.k}
                title={item.tooltip || undefined}
                className={`min-w-0 flex-1 ${i > 0 ? "lg:border-l lg:border-white/[0.05] lg:pl-12" : ""}`}
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{item.k}</p>
                <div className="mt-3">{item.v}</div>
              </div>
            ))}
          </div>

          {/* Freshness footer — answers "are these numbers live?" honestly. */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.04] pt-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium tracking-wide text-zinc-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500/70" aria-hidden />
                <span>
                  Universe updated{" "}
                  <span className="font-mono tabular-nums text-zinc-300">
                    {dataComputedAt ? relShort(dataComputedAt) : "—"}
                  </span>{" "}
                  ago
                </span>
              </span>
              <span className="hidden text-zinc-700 sm:inline">·</span>
              <span className="text-zinc-500">Aggregates refresh every 6h (auto-discovery + behavior cron)</span>
              <span className="hidden text-zinc-700 sm:inline">·</span>
              <span className="text-zinc-500">Cache TTL 3 min</span>
            </div>
            {typeof onRefreshAll === "function" ? (
              <button
                type="button"
                onClick={() => {
                  onRefreshAll();
                  toast("Refreshing universe…");
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-[#0D1118]/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-300 transition hover:border-white/[0.12] hover:text-zinc-100"
                title="Force a refresh now (clears client cache)"
              >
                <RefreshCw className="h-3 w-3" aria-hidden />
                Refresh
              </button>
            ) : null}
          </div>
        </div>

        {isLoadingLeaderboard ? (
          <div className="mb-8 flex items-center gap-3 rounded-2xl bg-[#101620]/50 px-6 py-8 text-zinc-500">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
            <span className="text-sm font-medium">Loading universe…</span>
          </div>
        ) : null}

        {leaderboardError ? (
          <div className="mb-8 rounded-2xl bg-rose-950/20 px-6 py-5 text-sm text-rose-300/90 ring-1 ring-rose-900/25">
            {leaderboardError?.message || t("smart.errorFallback")}
          </div>
        ) : null}

        {!isLoadingLeaderboard && !leaderboardError && rawRowCount === 0 ? (
          <div className="mx-auto max-w-md rounded-2xl bg-[#101620]/60 px-8 py-10 text-center ring-1 ring-white/[0.05]">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{t("smart.empty.title")}</p>
            <p className="mt-3 text-sm leading-relaxed text-zinc-500">{t("smart.empty.hint")}</p>
            <ProPurchaseButton className="mt-6 inline-flex rounded-lg bg-zinc-800/80 px-4 py-2.5 text-xs font-semibold text-zinc-200 ring-1 ring-white/[0.06] hover:bg-zinc-800">
              Upgrade
            </ProPurchaseButton>
          </div>
        ) : null}

        {!isLoadingLeaderboard &&
        !leaderboardError &&
        rawRowCount > 0 &&
        displayedRanked.length === 0 &&
        soloFavorites ? (
          <div className="mx-auto max-w-md rounded-2xl bg-amber-950/15 px-8 py-10 text-center ring-1 ring-amber-900/20">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-200/80">
              {t("smart.favEmpty.title", { limit })}
            </p>
            <p className="mt-3 text-sm text-zinc-500">{t("smart.favEmpty.hint")}</p>
            <button
              type="button"
              className="mt-6 text-xs font-semibold text-zinc-400 underline-offset-2 hover:text-zinc-300 hover:underline"
              onClick={onClearFavoritesFilter}
            >
              Clear favorites filter
            </button>
          </div>
        ) : null}

        {!isLoadingLeaderboard && !leaderboardError && displayedRanked.length > 0 ? (
          <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-12 xl:gap-16">
            {/* MAIN TABLE ~68–72% */}
            <div className="min-w-0 flex-1">
              <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Wallet universe</h2>
                <p className="text-sm text-zinc-500">
                  <span className="font-mono tabular-nums text-zinc-400">{sortedRows.length}</span> rows
                  {soloFavorites ? (
                    <span className="ml-2 text-amber-500/80">· favorites filter</span>
                  ) : null}
                </p>
              </div>
              <div className="overflow-hidden rounded-2xl bg-[#0E131C]/70 ring-1 ring-white/[0.05]">
                <div className="max-h-[min(72vh,960px)] overflow-x-auto overflow-y-auto">
                  <table className="w-full min-w-[900px] text-left text-[13px]">
                    <thead className="sticky top-0 z-10 bg-[#121A26]/95 backdrop-blur-md">
                      <tr className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                        {[
                          ["rank", "Rank"],
                          ["wallet", "Wallet"],
                          ["unifiedScore", "Unified score"],
                          ["winRate", "Win rate"],
                          ["pnl30d", "30D PnL"],
                          ["totalTrades", "Trades"],
                          ["profitFactor", "Profit factor"],
                          ["lastCheckedAt", t("smart.th.lastChecked")],
                          [null, "Action"]
                        ].map(([key, label]) =>
                          key ? (
                            <th key={key} className="cursor-pointer select-none whitespace-nowrap px-5 py-4 first:pl-6" scope="col">
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 text-left font-semibold text-zinc-500 transition hover:text-zinc-300"
                                onClick={() => onHeaderClick(key)}
                              >
                                {label}
                                {sortBy === key ? (
                                  <span className="font-mono text-zinc-400">{sortOrder === "asc" ? "↑" : "↓"}</span>
                                ) : null}
                              </button>
                            </th>
                          ) : (
                            <th key="action" className="whitespace-nowrap px-5 py-4 last:pr-6" scope="col">
                              {label}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody className="text-zinc-300">
                      {sortedRows.map((w) => {
                        const wr = Number(w.winRate || 0);
                        const { w: wc, l: lc } = wlFromWinRate(w.totalTrades, w.winRate);
                        const pf = profitFactorDisplay(w);
                        const pnl = Number(w.pnl30d || 0);
                        const scoreNum = leaderboardUnifiedScore(w);
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
                              if (e.target.closest?.("a,button,[data-no-row-select]")) return;
                              setSelectedWallet(w.wallet);
                            }}
                            className={`border-t border-white/[0.04] transition-colors ${
                              isSel
                                ? "bg-[#161E2C]/95 ring-1 ring-inset ring-emerald-500/15"
                                : "hover:bg-[#121722]/90"
                            }`}
                          >
                            <td className="px-5 py-5 font-mono text-[12px] tabular-nums text-zinc-400 first:pl-6">
                              {soloFavorites ? `${w.rank} (${w.globalRank})` : w.rank}
                            </td>
                            <td className="max-w-[200px] px-5 py-5" title={titleFor?.(w.wallet)}>
                              <span className="font-mono text-[12px] text-sky-400/90">{truncateWallet(w.wallet)}</span>
                              {labelFor?.(w.wallet) ? (
                                <span className="mt-0.5 block truncate text-[11px] font-normal text-zinc-500">
                                  {labelFor(w.wallet)}
                                </span>
                              ) : null}
                            </td>
                            <td className="px-5 py-5">
                              {scoreNum != null ? (
                                <div className="flex min-w-[108px] flex-col">
                                  <span className="font-mono text-[12px] tabular-nums text-zinc-200">
                                    {scoreNum.toFixed(1)}
                                  </span>
                                  <div className="mt-1 h-1.5 w-full rounded-full bg-zinc-700/50">
                                    <div
                                      className="h-1.5 rounded-full bg-emerald-500"
                                      style={{
                                        width: `${Math.min(Math.max(0, scoreNum), 100)}%`
                                      }}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <span className="text-zinc-600">—</span>
                              )}
                            </td>
                            <td className="px-5 py-5">
                              <span
                                className={`inline-flex rounded-md px-2.5 py-1 text-[11px] font-mono tabular-nums ${winRateBadgeClass(wr)}`}
                              >
                                {wr.toFixed(1)}%
                              </span>
                            </td>
                            <td
                              className={`px-5 py-5 font-mono text-[12px] tabular-nums ${
                                pnl >= 0 ? "text-emerald-500/80" : "text-rose-500/75"
                              }`}
                            >
                              {pnl >= 0 ? "+" : "-"}${formatUsdWhole(Math.abs(pnl))}
                            </td>
                            <td className="px-5 py-5 font-mono text-[12px] tabular-nums text-zinc-400">
                              {w.totalTrades ?? "—"}
                              <span className="text-zinc-600"> ({wc}W / {lc}L)</span>
                            </td>
                            <td className="px-5 py-5 font-mono text-[12px] tabular-nums text-zinc-500">{pf}</td>
                            <td className="px-5 py-5 font-mono text-[11px] tabular-nums text-zinc-500">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="whitespace-nowrap" title="Last time Sentinel polled this wallet (last_checked_at).">
                                  {leaderboardCheckedIso(w) ? formatDateTime(leaderboardCheckedIso(w)) : "—"}
                                </span>
                                {(() => {
                                  const activityIso = leaderboardActivityIso(w);
                                  if (!activityIso) return null;
                                  return (
                                    <span
                                      className="whitespace-nowrap text-[10px] text-emerald-500/70"
                                      title="Last on-chain activity (wallet_tokens.bought_at) — updated by Helius webhook on every tx, regardless of our signal gating."
                                    >
                                      · on-chain {relShort(activityIso)}
                                    </span>
                                  );
                                })()}
                                {(() => {
                                  const badge = inactivityDecayBadge(w);
                                  if (!badge) return null;
                                  return (
                                    <span
                                      title={INACTIVITY_DECAY_TOOLTIP}
                                      className={`inline-flex shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ring-1 ${badge.className}`}
                                    >
                                      {badge.label}
                                    </span>
                                  );
                                })()}
                              </div>
                            </td>
                            <td className="px-5 py-5 last:pr-6">
                              <div className="flex flex-wrap gap-1.5" data-no-row-select>
                                <button
                                  type="button"
                                  onClick={() => onMonitor(w.wallet)}
                                  className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 ring-1 ring-white/[0.08] hover:bg-white/[0.04] hover:text-zinc-200"
                                >
                                  <Bell className="h-3 w-3" />
                                  Monitor
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onFollow(w.wallet)}
                                  className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 ring-1 ring-white/[0.08] hover:bg-emerald-950/40 hover:text-emerald-400/90"
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
            </div>

            {/* RIGHT RAIL ~28–32% — panel de contexto permanente */}
            <aside className="w-full shrink-0 space-y-10 lg:w-[min(32vw,400px)] lg:max-w-[32%] xl:w-[400px]">
              <div className="rounded-2xl bg-[#0E131C]/70 ring-1 ring-white/[0.05]">
                <div className="border-b border-white/[0.05] px-6 py-4">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Context</h3>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-600">
                    {selectedRow ? "Selected wallet — full profile below." : "No row selected — live market summary active."}
                  </p>
                </div>
                <div className="space-y-8 px-6 py-6">
                  {!selectedRow ? (
                    <div className="space-y-4 text-sm leading-relaxed text-zinc-400">
                      <p className="font-medium text-zinc-300">Executive snapshot</p>
                      <ul className="list-inside list-disc space-y-2 text-[13px] text-zinc-500 marker:text-zinc-600">
                        <li>
                          Coverage:{" "}
                          <span className="font-mono tabular-nums text-zinc-400">{displayedRanked.length}</span> wallets
                          in view
                          {medianWinRate != null ? (
                            <>
                              {" "}
                              · median win rate{" "}
                              <span className="font-mono text-zinc-400">{medianWinRate.toFixed(1)}%</span>
                            </>
                          ) : null}
                        </li>
                        <li>
                          Probe cadence:{" "}
                          <span className="font-mono text-zinc-400">{activeProbes24h ?? "—"}</span> touches in 24h ·{" "}
                          <span className="font-mono text-zinc-400">{filteredActivity.length}</span> signals in{" "}
                          {timeframe}
                        </li>
                        <li>
                          Median book PnL (30D):{" "}
                          {medianPnl30 != null ? (
                            <span
                              className={`font-mono tabular-nums ${medianPnl30 >= 0 ? "text-emerald-500/75" : "text-rose-500/75"}`}
                            >
                              {medianPnl30 >= 0 ? "+" : "-"}${formatUsdWhole(Math.abs(medianPnl30))}
                            </span>
                          ) : (
                            "—"
                          )}
                          {meanPnl30 != null && Number.isFinite(meanPnl30) ? (
                            <span className="ml-2 font-mono text-[11px] tabular-nums text-zinc-600">
                              (mean {meanPnl30 >= 0 ? "+" : "-"}${formatUsdWhole(Math.abs(meanPnl30))})
                            </span>
                          ) : null}
                        </li>
                      </ul>
                      <p className="text-[12px] text-zinc-600">
                        Click any row to load wallet intelligence, narrative, and execution context in this column.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Wallet</p>
                          <p className="mt-1 font-mono text-sm text-sky-400/90" title={selectedRow.wallet}>
                            {truncateWallet(selectedRow.wallet)}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => copyAddr(selectedRow.wallet)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 ring-1 ring-white/[0.08] hover:bg-white/[0.04] hover:text-zinc-200"
                            title="Copy address"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                          <Link
                            href={`/wallet/${selectedRow.wallet}?lang=${narrativeLang || "en"}`}
                            className="inline-flex h-9 items-center rounded-lg px-3 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 ring-1 ring-white/[0.08] hover:bg-white/[0.04]"
                          >
                            Full dossier
                          </Link>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          [
                            "Unified score",
                            (() => {
                              const u = leaderboardUnifiedScore(selectedRow);
                              return u != null ? u.toFixed(1) : "—";
                            })()
                          ],
                          ["Win rate", `${Number(selectedRow.winRate || 0).toFixed(1)}%`],
                          [
                            "30D PnL",
                            `${Number(selectedRow.pnl30d || 0) >= 0 ? "+" : "-"}$${formatUsdWhole(Math.abs(Number(selectedRow.pnl30d || 0)))}`
                          ],
                          [
                            t("smart.th.lastChecked"),
                            leaderboardCheckedIso(selectedRow) ? relShort(leaderboardCheckedIso(selectedRow)) : "—"
                          ],
                          [
                            t("smart.th.lastSeen"),
                            selectedRow.lastSeen ? relShort(selectedRow.lastSeen) : "—"
                          ]
                        ].map(([lab, val]) => (
                          <div key={lab} className="rounded-xl bg-[#121926]/60 px-3 py-3 ring-1 ring-white/[0.04]">
                            <p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">{lab}</p>
                            <p className="mt-1 font-mono text-[13px] tabular-nums text-zinc-200">{val}</p>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => onMonitor(selectedRow.wallet)}
                          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-200 ring-1 ring-white/[0.1] hover:bg-white/[0.05]"
                        >
                          <Bell className="h-4 w-4" />
                          Monitor
                        </button>
                        <button
                          type="button"
                          onClick={() => onFollow(selectedRow.wallet)}
                          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-[11px] font-semibold uppercase tracking-wide text-emerald-400/90 ring-1 ring-emerald-800/35 hover:bg-emerald-950/30"
                        >
                          {isFavorite(selectedRow.wallet) ? (
                            <Star className="h-4 w-4 fill-current" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                          {isFavorite(selectedRow.wallet) ? "Following" : "Follow"}
                        </button>
                      </div>
                      <div className="max-h-[200px] overflow-y-auto rounded-xl ring-1 ring-white/[0.05]">
                        <WalletNarrativeCard walletAddress={selectedRow.wallet} lang={narrativeLang} />
                      </div>
                      <SmartWalletDetailPanel
                        row={selectedRow}
                        labelFor={labelFor}
                        titleFor={titleFor}
                        narrativeLang={narrativeLang}
                      />
                    </div>
                  )}

                  {/* Signal quality — always visible */}
                  <div className="border-t border-white/[0.05] pt-8">
                    <h4 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Signal quality</h4>
                    <p className="mt-3 text-sm text-zinc-500">
                      {signalQuality.n > 0 ? (
                        <>
                          Mean confidence{" "}
                          <span className="font-mono tabular-nums text-zinc-300">
                            {signalQuality.avg != null ? signalQuality.avg.toFixed(0) : "—"}%
                          </span>
                          ·{" "}
                          <span className="font-mono tabular-nums text-zinc-300">{signalQuality.high}</span> /{" "}
                          <span className="font-mono text-zinc-600">{signalQuality.n}</span> ≥ half-scale in window
                        </>
                      ) : (
                        <span className="text-zinc-600">No confidence samples in this timeframe.</span>
                      )}
                    </p>
                  </div>

                  {/* Action context */}
                  <div className="border-t border-white/[0.05] pt-8">
                    <h4 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Actions</h4>
                    <p className="mt-3 text-[12px] leading-relaxed text-zinc-600">
                      <strong className="font-medium text-zinc-500">Monitor</strong> opens the institutional wallet dossier
                      (charts, behavior, narratives).
                      <br />
                      <strong className="font-medium text-zinc-500">Follow</strong> persists a local bookmark — same
                      storage as your smart-money favorites.
                    </p>
                  </div>
                </div>
              </div>

              {/* Timeline — recent probes */}
              <div className="rounded-2xl bg-[#0E131C]/70 ring-1 ring-white/[0.05]">
                <div className="flex items-center justify-between border-b border-white/[0.05] px-6 py-4">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Live probe timeline</h3>
                  <button
                    type="button"
                    onClick={() => activityRefetch()}
                    className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 hover:text-zinc-300"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Sync
                  </button>
                </div>
                <div className="max-h-[420px] overflow-y-auto px-2 py-2">
                  {activityLoading ? (
                    <div className="flex items-center gap-2 px-4 py-6 text-sm text-zinc-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Ingesting…
                    </div>
                  ) : null}
                  {activityError ? (
                    <div className="px-4 py-4 text-sm text-rose-400/85">
                      {activityError?.message || t("smart.activity.error")}
                    </div>
                  ) : null}
                  {!activityLoading && !activityError && filteredActivity.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-zinc-600">{t("smart.activity.empty")}</div>
                  ) : null}
                  {!activityLoading &&
                    !activityError &&
                    filteredActivity.map((r, i) => {
                      const tick = r.token ? truncateWallet(r.token) : "—";
                      const typ = signalTypeLabel(r.side);
                      const conf = Number.isFinite(r.confidence) ? Math.round(r.confidence) : "—";
                      return (
                        <div key={`${r.wallet}-${r.token}-${r.createdAt}-${i}`} className="relative flex gap-3 px-4 py-3">
                          <div className="flex w-8 shrink-0 flex-col items-center pt-1">
                            <span className="h-2 w-2 rounded-full bg-zinc-600" />
                            {i < filteredActivity.length - 1 ? (
                              <span className="mt-1 w-px flex-1 min-h-[24px] bg-white/[0.06]" aria-hidden />
                            ) : null}
                          </div>
                          <div className="min-w-0 flex-1 pb-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-md bg-zinc-800/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-400 ring-1 ring-white/[0.06]">
                                {typ}
                              </span>
                              <span className="font-mono text-[11px] text-zinc-300">{tick}</span>
                              <span className="text-[10px] text-zinc-500">conf {conf}%</span>
                              {r.resultPct != null && Number.isFinite(r.resultPct) ? (
                                <span
                                  className={`text-[10px] font-mono tabular-nums ${
                                    r.resultPct >= 0 ? "text-emerald-600/85" : "text-rose-600/80"
                                  }`}
                                >
                                  {r.resultPct >= 0 ? "+" : ""}
                                  {Number(r.resultPct).toFixed(1)}%
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1.5 font-mono text-[10px] tabular-nums text-zinc-600">
                              {relShort(r.createdAt)}
                            </p>
                          </div>
                          <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-zinc-700" aria-hidden />
                        </div>
                      );
                    })}
                </div>
              </div>
            </aside>
          </div>
        ) : null}
      </div>
    </div>
  );
}
