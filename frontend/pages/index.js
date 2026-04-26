import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useTrendingTokens } from "../hooks/useTrendingTokens";
import { useSignalsFeed } from "../hooks/useSignalsFeed";
import { useDecisionFeedQuotes } from "../hooks/useDecisionFeedQuotes";
import { useRankDeltas } from "../hooks/useRankDeltas";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { AnimatedNumber } from "../components/ui/AnimatedNumber";
import { useLiveFeedSocket } from "../hooks/useLiveFeedSocket";
import { PageHead } from "../components/seo/PageHead";
import { useWalletLabels } from "../hooks/useWalletLabels";
import { WarLayout } from "../components/layout/WarLayout";
import { TokenDesk } from "../components/cockpit/TokenDesk";
import { isProbableSolanaMint } from "../lib/solanaMint.mjs";
import {
  deskMintFromQuery,
  deskRadarQueryNeedsScrub,
  mergeDeskMintIntoQuery,
  parseDeskRadarHintFromQuery,
  scrubDeskRadarParamsFromQuery
} from "../lib/deskRadarCtx.mjs";
import TacticalFeed from "@/features/war-home/TacticalFeed";
import {
  TACTICAL_TAB_LS_KEY,
  UI_CONFIG
} from "@/constants/homeData";
import {
  chunkArray,
  computeSignalStrength,
  liquidityFromApiRedFlags,
  initialCountdownSec
} from "@/lib/signalUtils";
import { useWarMode } from "../contexts/WarModeContext";
import { useLocale } from "../contexts/LocaleContext";
import { useWebSocket } from "../hooks/useWebSocket";
import { useLastGoodArray } from "../hooks/useLastGoodArray";
import { formatUsdWhole } from "../lib/formatStable";

function HomeMetricStrip({ signalsToday, activeWallets, avgConfidence, bestSignal }) {
  const metrics = [
    ["SIGNALS TODAY", signalsToday],
    ["ACTIVE WALLETS", activeWallets],
    ["AVG CONFIDENCE", avgConfidence != null ? `${Math.round(avgConfidence)}%` : "—"],
    ["BEST SIGNAL", bestSignal != null ? `${Math.round(bestSignal)}%` : "—"]
  ];
  return (
    <div className="kpi-strip w-full">
      {metrics.map(([label, value]) => (
        <div key={label} className="kpi-block">
          <span className="kpi-label">{label}</span>
          <span className="kpi-number">
            {typeof value === "number" ? <AnimatedNumber value={value} decimalPlaces={0} /> : value}
          </span>
        </div>
      ))}
    </div>
  );
}

function HomeSettings({ strategyMode, onStrategyModeChange, soundEnabled, onToggleSound }) {
  return (
    <details className="relative">
      <summary className="list-none cursor-pointer rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400 hover:text-white">
        Settings
      </summary>
      <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-56 rounded-xl border border-white/10 bg-[#090b12] p-2 shadow-2xl">
        <p className="mb-1 text-[10px] uppercase tracking-[0.12em] text-gray-500">Strategy</p>
        {["conservative", "balanced", "aggressive"].map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => onStrategyModeChange(mode)}
            className={`mb-1 w-full rounded-md border px-2 py-1 text-left text-[11px] capitalize ${
              strategyMode === mode ? "border-indigo-400/45 bg-indigo-500/15 text-indigo-100" : "border-white/10 bg-white/[0.02] text-gray-400"
            }`}
          >
            {mode}
          </button>
        ))}
        <button
          type="button"
          onClick={onToggleSound}
          className="mt-1 w-full rounded-md border border-white/10 bg-white/[0.02] px-2 py-1 text-left text-[11px] text-gray-300"
        >
          Sound alerts: {soundEnabled ? "On" : "Off"}
        </button>
      </div>
    </details>
  );
}

function SmartWalletsPreview({ wallets, labelFor, titleFor }) {
  const rows = wallets.slice(0, 5);
  return (
    <section className="sl-card-elevated p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="font-mono text-[12px] font-bold uppercase tracking-[0.16em] text-white">Smart Wallets</h2>
        <Link href="/smart-money?limit=50" className="text-[11px] font-semibold text-indigo-200 no-underline hover:text-white">
          View all →
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="sl-table text-[11px]">
          <tbody>
            {rows.length ? rows.map((wallet, idx) => (
              <tr key={wallet.address || wallet.wallet || idx}>
                <td className="py-2 pr-2 text-gray-500">#{idx + 1}</td>
                <td className="py-2 pr-2 font-mono text-gray-200" title={wallet.address ? titleFor(wallet.address) : wallet.tooltip}>
                  {wallet.address ? labelFor(wallet.address) : wallet.wallet}
                </td>
                <td className="py-2 pr-2 text-emerald-300">{Number(wallet.winRate || 0).toFixed(1)}%</td>
                <td className="py-2 text-right text-gray-400">${formatUsdWhole(wallet.pnl30d || 0)}</td>
              </tr>
            )) : (
              <tr><td className="py-3 text-gray-500">Accumulating verified wallet data.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RecentAlertsPreview({ alerts }) {
  const rows = alerts.slice(0, 5);
  return (
    <section className="sl-card-elevated p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="font-mono text-[12px] font-bold uppercase tracking-[0.16em] text-white">Recent Alerts</h2>
        <Link href="/alerts" className="text-[11px] font-semibold text-indigo-200 no-underline hover:text-white">
          View all →
        </Link>
      </div>
      <div className="space-y-1.5">
        {rows.length ? rows.map((alert, idx) => (
          <Link
            key={`${alert.tokenAddress || "alert"}-${idx}`}
            href={alert.tokenAddress ? `/token/${alert.tokenAddress}` : "/alerts"}
            className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1.5 text-[11px] no-underline hover:border-indigo-400/25"
          >
            <span className="font-mono text-gray-200">{alert.tokenAddress ? `${alert.tokenAddress.slice(0, 4)}…${alert.tokenAddress.slice(-4)}` : "Alert"}</span>
            <span className="truncate text-gray-500">{alert.alertType}</span>
          </Link>
        )) : (
          <p className="py-3 text-[12px] text-gray-500">No urgent alerts in the latest window.</p>
        )}
      </div>
    </section>
  );
}

/**
 * HOT row → LIVE card (same shell as DB signals). Rank uses API `sentinelScore` when set.
 */
function mapHotTrendToLiveFill(row, heatContext) {
  const mint =
    (row?.mint && isProbableSolanaMint(String(row.mint)) && String(row.mint)) ||
    (row?.tokenAddress && isProbableSolanaMint(String(row.tokenAddress)) && String(row.tokenAddress)) ||
    null;
  if (!mint) return null;
  const rawScore = Number(row.sentinelScore);
  const score = Number.isFinite(rawScore) && rawScore > 0 ? Math.round(rawScore) : computeSignalStrength(row);
  if (!Number.isFinite(score)) return null;
  const sym = String(row.symbol || row.token || "TOKEN").replace(/^\$/, "").trim() || "TOKEN";
  const sw = Number(row.smartWallets);
  const smartWallets = Number.isFinite(sw) ? Math.max(0, Math.round(sw)) : 0;
  return {
    symbol: sym,
    mint,
    _liveSource: "hot_fill",
    token: {
      symbol: sym,
      mint,
      price: (() => {
        const p = Number(row.price);
        return Number.isFinite(p) && p > 0 ? p : undefined;
      })(),
      liquidity: Number(row.liquidity || 0),
      volume24h: Number(row.volume24h || 0),
      change: Number(row.change ?? row.change24h ?? 0),
      whyTrade: Array.isArray(row.whyTrade) ? row.whyTrade : []
    },
    signalStrength: Math.max(1, Math.min(100, score)),
    smartWallets,
    context: heatContext,
    clusterScore: Math.min(99, Math.max(1, Math.round(score - 6))),
    momentum: Number(row.volume24h || 0),
    _api: {
      token: sym.startsWith("$") ? sym : `$${sym}`,
      tokenAddress: mint,
      smartWallets,
      sentinelScore: Math.max(1, Math.min(100, score)),
      decision: row.decision || "MERCADO",
      whyNow: Array.isArray(row.whyTrade) ? row.whyTrade : [],
      redFlags: Array.isArray(row.redFlags) ? row.redFlags : [],
      entryWindow: row.entryWindow ?? null,
      entryWindowMinutesLeft: row.entryWindowMinutesLeft ?? null,
      timeAdvantage: row.timeAdvantage ?? null,
      signalDecay: row.signalDecay ?? null,
      poolAgeLabel: row.poolAgeLabel ?? null,
      confluence: Boolean(row.confluence),
      evidenceChips: Array.isArray(row.evidenceChips) && row.evidenceChips.length
        ? row.evidenceChips
        : [String(row.grade || "HEAT").slice(0, 6)],
      contextHistory: heatContext,
      rulePerformance: row.rulePerformance || null,
      createdAt: row.createdAt || new Date().toISOString(),
      volume24h: Number(row.volume24h || 0),
      change24h: Number(row.change ?? row.change24h ?? 0)
    }
  };
}

export async function getServerSideProps() {
  try {
    const res = await fetch(`${getPublicApiUrl()}/api/v1/tokens/hot?limit=24`);
    if (!res.ok) return { props: { initialTrending: [], initialTrendingMeta: {} } };
    const json = await res.json();
    return {
      props: {
        initialTrending: Array.isArray(json?.data) ? json.data : [],
        initialTrendingMeta: json?.meta || {}
      }
    };
  } catch {
    return { props: { initialTrending: [], initialTrendingMeta: {} } };
  }
}

export default function Home({ initialTrending = [], initialTrendingMeta = {} }) {
  const { t } = useLocale();
  const [alerts, setAlerts] = useState([]);
  const [signalCursor, setSignalCursor] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [strategyMode, setStrategyMode] = useState("balanced");
  const [tacticalTab, setTacticalTab] = useState("live");
  const [historyRows, setHistoryRows] = useState([]);
  const [outcomesSummary, setOutcomesSummary] = useState(null);
  const [topWalletsApi, setTopWalletsApi] = useState([]);
  const [entryCountdownByMint, setEntryCountdownByMint] = useState({});
  const [liveExpanded, setLiveExpanded] = useState(false);
  const [heatExpanded, setHeatExpanded] = useState(false);
  const skipTacticalTabPersistRef = useRef(true);
  useLiveFeedSocket({ onSignal: useCallback(() => {}, []) });
  const router = useRouter();
  const selectedMint = useMemo(() => deskMintFromQuery(router.query), [router.query]);
  const deskRadarHint = useMemo(() => parseDeskRadarHintFromQuery(router.query), [router.query]);

  const pushDeskMint = useCallback(
    (mint, ctx) => {
      if (!mint || !isProbableSolanaMint(mint)) return;
      const nextQuery = mergeDeskMintIntoQuery(router.query, mint, ctx);
      void router.push({ pathname: router.pathname || "/", query: nextQuery }, undefined, { shallow: true });
    },
    [router]
  );

  useEffect(() => {
    if (!router.isReady) return;
    if (!deskRadarQueryNeedsScrub(router.query)) return;
    const nextQuery = scrubDeskRadarParamsFromQuery(router.query);
    void router.replace({ pathname: router.pathname || "/", query: nextQuery }, undefined, { shallow: true });
  }, [router, router.isReady, router.query, router.pathname]);

  const { coordination: deskCoordination } = useWebSocket(selectedMint);
  const { isWarMode } = useWarMode();
  const isFallbackSource = useCallback((meta) => {
    const src = String(meta?.source || "").toLowerCase();
    if (!src) return true;
    return src.includes("fallback") || src.includes("static") || src.includes("route_fallback");
  }, []);
  // Fixed limit: avoid React Query key churn (and empty flashes) when toggling heat expand;
  // `heatTokensForGrid` / token pool still slice in the UI.
  const trendingQuery = useTrendingTokens(initialTrending, initialTrendingMeta, "", {
    limit: UI_CONFIG.TRENDING_API_LIMIT_EXPANDED,
    refetchMs: isWarMode ? UI_CONFIG.TRENDING_REFETCH_WAR_MS : UI_CONFIG.TRENDING_REFETCH_NORMAL_MS
  });
  // Stable poll for signals (fixed limit) — must run before any memo that uses `apiFeedCards`.
  const signalsFeedQuery = useSignalsFeed({
    strategy: strategyMode,
    limit: UI_CONFIG.SIGNAL_API_LIMIT_EXPANDED,
    refetchMs: isWarMode ? UI_CONFIG.SIGNAL_FEED_REFETCH_WAR_MS : UI_CONFIG.SIGNAL_FEED_REFETCH_NORMAL_MS
  });
  const signalRowsIn = useMemo(() => {
    if (signalsFeedQuery.isError) return null;
    const payload = signalsFeedQuery.data;
    if (!payload) return null;
    const d = payload.data;
    const m = payload.meta;
    if (!Array.isArray(d) || d.length === 0) return null;
    if (m != null && m.strategy != null && String(m.strategy).toLowerCase() !== String(strategyMode).toLowerCase()) {
      return null;
    }
    return d;
  }, [signalsFeedQuery.data, signalsFeedQuery.isError, strategyMode]);
  const apiFeedCards = useLastGoodArray(signalRowsIn, strategyMode);
  const hotRowsIn = useMemo(() => {
    if (trendingQuery.isError) return null;
    const r = trendingQuery.data?.data;
    if (Array.isArray(r) && r.length > 0) return r;
    return null;
  }, [trendingQuery.data, trendingQuery.isError]);
  const TRENDING_STABLE_KEY = "home-trending-v1";
  // REGRESSION: do not add a second `visibleTrending` (or delayed clone) for Live hot-fill vs this `trending`.
  // A lagging pool desyncs signal merge from the hot list and reintroduced card "flash" / border churn.
  const trending = useLastGoodArray(hotRowsIn, TRENDING_STABLE_KEY);
  const signalsAgeSec = signalsFeedQuery.dataUpdatedAt
    ? Math.max(0, Math.floor((Date.now() - signalsFeedQuery.dataUpdatedAt) / 1000))
    : null;
  const signalsFeedIsDegraded =
    !signalsFeedQuery.isError && isFallbackSource(signalsFeedQuery.data?.meta || {});
  const trendingMeta = trendingQuery.data?.meta || {};
  const feedAgeSec = trendingQuery.dataUpdatedAt
    ? Math.max(0, Math.floor((Date.now() - trendingQuery.dataUpdatedAt) / 1000))
    : null;
  const feedStatus = useMemo(() => {
    const source = String(trendingMeta?.source || "").toLowerCase();
    const degraded = Boolean(trendingMeta?.degraded);
    if (trendingQuery.isError || source.includes("static") || source.includes("route_fallback")) return "SNAPSHOT";
    if (degraded || source.includes("fallback")) return "LIVE-DEGRADED";
    return "LIVE";
  }, [trendingMeta, trendingQuery.isError]);
  const feedIsLive = feedStatus === "LIVE";
  const feedLabel = feedStatus;
  const rankedWallets = useMemo(() => {
    const source = topWalletsApi.length ? topWalletsApi : [];
    return source
      .slice()
      .map((wallet) => ({
        ...wallet,
        smartScore: Math.round(
          wallet.winRate * 0.35 + wallet.earlyEntry * 0.25 + wallet.cluster * 0.2 + wallet.consistency * 0.2
        )
      }))
      .sort((a, b) => b.smartScore - a.smartScore);
  }, [topWalletsApi]);

  const topWalletLabelAddrs = useMemo(() => rankedWallets.map((w) => w.address).filter(Boolean), [rankedWallets]);
  const { labelFor: topWalletLabel, titleFor: topWalletTitle } = useWalletLabels(topWalletLabelAddrs);
  const interpretedSignalsRaw = useMemo(() => {
    const fromSignals = apiFeedCards
      .map((c) => {
        const sym = String(c.token || "TOKEN").replace(/^\$/, "").trim() || "TOKEN";
        const mint = c.tokenAddress && isProbableSolanaMint(c.tokenAddress) ? c.tokenAddress : null;
        const score = Number(c.sentinelScore);
        if (!mint || !Number.isFinite(score)) return null;
        const spotPx = Number(c.spotPriceUsd);
        const spotChg = Number(c.spotChange24h);
        return {
          symbol: sym,
          mint,
          _liveSource: "signal",
          token: {
            symbol: sym,
            mint: c.tokenAddress,
            price: Number.isFinite(spotPx) && spotPx > 0 ? spotPx : undefined,
            liquidity: liquidityFromApiRedFlags(c.redFlags),
            volume24h: Number(c.volume24h || 0),
            change: Number.isFinite(spotChg) ? spotChg : Number(c.change24h || 0),
            whyTrade: Array.isArray(c.whyNow) ? c.whyNow : []
          },
          signalStrength: Math.max(1, Math.min(100, Math.round(score))),
          smartWallets: Number.isFinite(Number(c.smartWallets)) ? Math.max(0, Math.round(Number(c.smartWallets))) : 0,
          context: c.contextHistory || "",
          clusterScore: Math.min(99, Math.max(1, Math.round(score - 6))),
          momentum: Number(c.volume24h || 0),
          _api: c
        };
      })
      .filter(Boolean)
      .sort((a, b) => (Number(b.signalStrength) || 0) - (Number(a.signalStrength) || 0));

    const signalMints = new Set(fromSignals.map((s) => s.mint));
    const heatContext = t("home.context.heat");
    const fromHot = trending
      .map((row) => mapHotTrendToLiveFill(row, heatContext))
      .filter(Boolean)
      .filter((h) => !signalMints.has(h.mint))
      .sort((a, b) => (Number(b.signalStrength) || 0) - (Number(a.signalStrength) || 0));

    return [...fromSignals, ...fromHot];
  }, [apiFeedCards, trending, t]);

  // No useRankingSnapshot here: it batched empty vs full and caused whole-grid flicker. Raw merge is the source of truth.
  // PR / review: do NOT reintroduce useRankingSnapshot on this path — see check-home-live-invariants + .github/pull_request_template.
  const interpretedSignals = interpretedSignalsRaw;

  const liveSignalPool = useMemo(() => {
    const seen = new Set();
    const signals = [];
    const hotFill = [];
    for (const sig of interpretedSignals) {
      if (!sig?.mint || !isProbableSolanaMint(sig.mint)) continue;
      if (seen.has(sig.mint)) continue;
      seen.add(sig.mint);
      if (sig._liveSource === "hot_fill") hotFill.push(sig);
      else signals.push(sig);
    }
    // Product: ordering is by network / signal strength only. Tactical (execution) regime does not affect rank — see TacticalRegimePill on cards (display-only).
    // Product: order is by network signal only; tactical (execution) regime is display-only on cards, not a sort key.
    signals.sort((a, b) => (Number(b.signalStrength) || 0) - (Number(a.signalStrength) || 0));
    hotFill.sort((a, b) => (Number(b.signalStrength) || 0) - (Number(a.signalStrength) || 0));
    return [...signals, ...hotFill];
  }, [interpretedSignals]);

  const liveSignalsForGrid = useMemo(
    () =>
      liveSignalPool.slice(
        0,
        liveExpanded ? UI_CONFIG.GRID_EXPANDED_MAX_CARDS : UI_CONFIG.GRID_COMPACT_CARDS
      ),
    [liveExpanded, liveSignalPool]
  );

  // Hysteresis: toggling at a single count (e.g. 50↔51) used to swap Grid vs Virtuoso and remount *all* cards.
  // Do not replace with one threshold at N only (no 42/50 band) — that thrashes on the edge. Tune inside the band, not to a single cut.
  const [useLiveVirtualized, setUseLiveVirtualized] = useState(false);
  const liveN = liveSignalsForGrid.length;
  useLayoutEffect(() => {
    setUseLiveVirtualized((v) => {
      if (liveN > 50) return true;
      if (liveN < 42) return false;
      return v;
    });
  }, [liveN]);
  const liveVirtuosoRows = useMemo(
    () =>
      useLiveVirtualized && liveSignalsForGrid.length > UI_CONFIG.VIRTUOSO_ROW_THRESHOLD
        ? chunkArray(liveSignalsForGrid, UI_CONFIG.VIRTUOSO_COLUMNS)
        : [],
    [useLiveVirtualized, liveSignalsForGrid]
  );

  const liveMintsForQuotes = useMemo(
    () => liveSignalsForGrid.map((s) => s.mint).filter((m) => m && isProbableSolanaMint(m)),
    [liveSignalsForGrid]
  );
  const quotesQuery = useDecisionFeedQuotes(liveMintsForQuotes, {
    isWarMode,
    enabled: tacticalTab === "live"
  });
  const tickerByMint = useMemo(() => {
    const rows = quotesQuery.data?.data;
    const o = {};
    if (Array.isArray(rows)) {
      for (const r of rows) {
        if (r?.mint) o[r.mint] = r;
      }
    }
    return o;
  }, [quotesQuery.data]);

  const heatTokenPool = useMemo(() => {
    const out = [];
    const seen = new Set();

    const tryAdd = (t) => {
      if (!t?.mint || !isProbableSolanaMint(t.mint)) return;
      if (seen.has(t.mint)) return;
      seen.add(t.mint);
      out.push(t);
    };

    trending.forEach((t) => tryAdd(t));

    return out.slice().sort((a, b) => {
      const sa = Number.isFinite(Number(a.sentinelScore)) ? Number(a.sentinelScore) : computeSignalStrength(a);
      const sb = Number.isFinite(Number(b.sentinelScore)) ? Number(b.sentinelScore) : computeSignalStrength(b);
      return sb - sa;
    });
  }, [trending]);

  const heatTokensForGrid = useMemo(
    () =>
      heatTokenPool.slice(
        0,
        heatExpanded ? UI_CONFIG.GRID_EXPANDED_MAX_CARDS : UI_CONFIG.GRID_COMPACT_CARDS
      ),
    [heatExpanded, heatTokenPool]
  );

  // Tracks rank changes between refetches so cards can render ↑N / ↓N / NEW
  // badges when the live ordering moves. Pure client-side; no extra network.
  const signalsRankDeltas = useRankDeltas(interpretedSignals, (s) => s?.mint);
  const trendingRankDeltas = useRankDeltas(heatTokenPool, (t) => t?.mint);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const tab = localStorage.getItem(TACTICAL_TAB_LS_KEY);
      if (tab === "live" || tab === "hot" || tab === "outlier" || tab === "track") setTacticalTab(tab);
      if (tab === "history") setTacticalTab("track");
    } catch (_) {
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`${getPublicApiUrl()}/api/v1/public/smart-money-activity?limit=12`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const rows = Array.isArray(j?.rows) ? j.rows : [];
        setAlerts(
          rows
            .filter((r) => r?.token)
            .map((r) => ({
              tokenAddress: r.token,
              alertType: `${String(r.side || "activity")} · conf ${Math.round(Number(r.confidence || 0))}%`,
              createdAt: r.createdAt || null
            }))
        );
      })
      .catch(() => {
        if (!cancelled) setAlerts([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (skipTacticalTabPersistRef.current) {
      skipTacticalTabPersistRef.current = false;
      return;
    }
    try {
      localStorage.setItem(TACTICAL_TAB_LS_KEY, tacticalTab);
    } catch (_) {}
  }, [tacticalTab]);
  useEffect(() => {
    const timer = setInterval(() => {
      setSignalCursor((prev) => prev + 1);
    }, 9000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!interpretedSignals.length) return;
    setEntryCountdownByMint((prev) => {
      const next = { ...prev };
      for (const signal of interpretedSignals) {
        if (!next[signal.mint]) {
          next[signal.mint] = initialCountdownSec(signal.signalStrength);
        }
      }
      return next;
    });
  }, [interpretedSignals]);

  useEffect(() => {
    const timer = setInterval(() => {
      setEntryCountdownByMint((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((mint) => {
          next[mint] = Math.max(0, Number(next[mint] || 0) - 1);
        });
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!soundEnabled) return;
    if (typeof window === "undefined") return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 920;
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.025, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    osc.start(now);
    osc.stop(now + 0.09);
    const t = setTimeout(() => ctx.close(), 180);
    return () => clearTimeout(t);
  }, [signalCursor, soundEnabled]);

  useEffect(() => {
    let cancelled = false;
    fetch(`${getPublicApiUrl()}/api/v1/signals/outcomes?hours=168`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const summary = j?.summary && typeof j.summary === "object" ? { ...j.summary } : {};
        if (j?.wins != null) summary.wins = j.wins;
        if (j?.losses != null) summary.losses = j.losses;
        if (j?.avgWin != null) summary.avgWinPct = j.avgWin;
        if (j?.avgLoss != null) summary.avgLossPct = j.avgLoss;
        if (j?.netReturn != null) summary.netReturnPct = j.netReturn;
        if (summary.wins != null && summary.losses != null) {
          summary.resolved = (Number(summary.wins) || 0) + (Number(summary.losses) || 0);
        }
        setOutcomesSummary(Object.keys(summary).length ? summary : null);
      })
      .catch(() => {
        if (!cancelled) {
          setOutcomesSummary(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`${getPublicApiUrl()}/api/v1/smart-wallets/top?limit=50`)
      .then((r) => r.json())
      .then((j) => {
        const list = Array.isArray(j?.data) ? j.data : Array.isArray(j?.rows) ? j.rows : [];
        if (cancelled || !list.length) return;
        const mapped = list.map((row, idx) => {
          const wr = Number(row.winRate || 0);
          const w = String(row.walletAddress || row.address || row.wallet || "");
          const ss = Number(row.smartScore ?? row.signalStrength ?? wr);
          return {
            wallet:
              row.wallet && row.wallet.length <= 14
                ? row.wallet
                : w.length > 10
                  ? `${w.slice(0, 4)}…${w.slice(-4)}`
                  : w || `Wallet ${idx + 1}`,
            address: w,
            winRate: wr,
            earlyEntry: Number(row.earlyEntry ?? Math.round(Math.min(99, Math.max(40, wr * 0.92)))),
            cluster: Number(row.cluster ?? Math.round(Math.min(99, Math.max(40, wr * 0.88)))),
            consistency: Number(row.consistency ?? Math.round(Math.min(99, Math.max(40, wr * 0.95)))),
            signalStrength: Math.min(99, Math.max(35, Math.round(ss))),
            pnl30d: Number(row.pnl30d || 0),
            tooltip: String(row.lastBigWin || row.tooltip || `Win ${wr.toFixed(1)}% · hits ${Number(row.recentHits || 0)}`)
          };
        });
        setTopWalletsApi(mapped);
      })
      .catch(() => {
        if (!cancelled) setTopWalletsApi([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (tacticalTab !== "track") return;
    let cancelled = false;
    fetch(`${getPublicApiUrl()}/api/v1/signals/history?limit=30`)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) {
          const rows = Array.isArray(j?.rows) ? j.rows : [];
          setHistoryRows(
            rows.map((row) => ({
              id: row.id,
              token: row.token,
              signalAt: row.signalAt,
              resultPct: row.resultPct,
              status: row.status
            }))
          );
        }
      })
      .catch(() => {
        if (!cancelled) setHistoryRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tacticalTab]);

  const homeMetrics = useMemo(() => {
    const scores = interpretedSignals.map((s) => Number(s.signalStrength)).filter(Number.isFinite);
    const avgConfidence = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    const bestSignal = scores.length ? Math.max(...scores) : null;
    const activeWallets = rankedWallets.length || topWalletsApi.length || 0;
    return {
      signalsToday: outcomesSummary?.resolved ?? interpretedSignals.length,
      activeWallets,
      avgConfidence,
      bestSignal
    };
  }, [interpretedSignals, outcomesSummary?.resolved, rankedWallets.length, topWalletsApi.length]);

  return (
    <>
      <PageHead title={t("home.pageTitle")} description={t("home.pageDesc")} />
      <WarLayout
        header={null}
        feed={
          <div className="space-y-3">
            <HomeMetricStrip
              signalsToday={homeMetrics.signalsToday}
              activeWallets={homeMetrics.activeWallets}
              avgConfidence={homeMetrics.avgConfidence}
              bestSignal={homeMetrics.bestSignal}
            />
            <div className="flex items-center justify-end">
              <HomeSettings
                strategyMode={strategyMode}
                onStrategyModeChange={setStrategyMode}
                soundEnabled={soundEnabled}
                onToggleSound={() => setSoundEnabled((v) => !v)}
              />
            </div>
        <TacticalFeed
          tacticalTab={tacticalTab}
          onTabChange={setTacticalTab}
          historyRows={historyRows}
          liveExpanded={liveExpanded}
          onToggleLiveExpanded={() => setLiveExpanded((v) => !v)}
          liveSignalsForGrid={liveSignalsForGrid}
          liveSignalPool={liveSignalPool}
          signalsFeedIsError={signalsFeedQuery.isError}
          signalsFeedIsDegraded={signalsFeedIsDegraded}
          signalsFeedIsLoading={signalsFeedQuery.isLoading}
          signalsAgeSec={signalsAgeSec}
          isWarMode={isWarMode}
          liveUseVirtualizedLayout={useLiveVirtualized}
          liveVirtuosoRows={liveVirtuosoRows}
          entryCountdownByMint={entryCountdownByMint}
          strategyMode={strategyMode}
          signalCursor={signalCursor}
          signalsRankDeltas={signalsRankDeltas}
          tickerByMint={tickerByMint}
          quotesPricesFetching={quotesQuery.isFetching}
          selectedMint={selectedMint}
          deskCoordination={deskCoordination}
          onSelectMint={pushDeskMint}
          heatExpanded={heatExpanded}
          onToggleHeatExpanded={() => setHeatExpanded((v) => !v)}
          heatTokensForGrid={heatTokensForGrid}
          heatTokenPool={heatTokenPool}
          feedStatus={feedStatus}
          feedIsLive={feedIsLive}
          feedLabel={feedLabel}
          feedAgeSec={feedAgeSec}
          trendingMinLiquidityUsd={trendingMeta.minLiquidityUsd}
          trendingRankDeltas={trendingRankDeltas}
        />
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              <SmartWalletsPreview wallets={rankedWallets} labelFor={topWalletLabel} titleFor={topWalletTitle} />
              <RecentAlertsPreview alerts={alerts} />
            </div>
          </div>
        }
        desk={<TokenDesk key={selectedMint ?? "__desk_none__"} mint={selectedMint} deskRadarHint={deskRadarHint} />}
      />
    </>
  );
}
