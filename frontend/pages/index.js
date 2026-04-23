import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useTrendingTokens } from "../hooks/useTrendingTokens";
import { useSignalsFeed } from "../hooks/useSignalsFeed";
import { useRankingSnapshot } from "../hooks/useRankingSnapshot";
import { useRankDeltas } from "../hooks/useRankDeltas";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { AnimatedNumber } from "../components/ui/AnimatedNumber";
import { useLiveFeedSocket } from "../hooks/useLiveFeedSocket";
import { PageHead } from "../components/seo/PageHead";
import { WelcomeBanner } from "../components/public/WelcomeBanner";
import { HomeOnboarding } from "../components/public/HomeOnboarding";
import { useWalletLabels } from "../hooks/useWalletLabels";
import { WarLayout } from "../components/layout/WarLayout";
import { TokenDesk } from "../components/cockpit/TokenDesk";
import { isProbableSolanaMint } from "../lib/solanaMint";
import WarHeader from "@/features/war-home/WarHeader";
import WarHomeCombatPanels from "@/features/war-home/WarHomeCombatPanels";
import WarHomeIntro from "@/features/war-home/WarHomeIntro";
import WarHomeUtilityRail from "@/features/war-home/WarHomeUtilityRail";
import TacticalFeed from "@/features/war-home/TacticalFeed";
import {
  FALLBACK_TRENDING,
  RECENT_SIGNAL_OUTCOMES,
  TACTICAL_TAB_LS_KEY,
  TOP_SMART_WALLETS,
  UI_CONFIG
} from "@/constants/homeData";
import {
  chunkArray,
  computeSignalStrength,
  initialCountdownSec,
  liquidityFromApiRedFlags,
  signalFromToken,
  tokenFromSignal
} from "@/lib/signalUtils";
import { useWarMode } from "../contexts/WarModeContext";
import { useWebSocket } from "../hooks/useWebSocket";

/** Mint selected in cockpit desk via `?t=` (shallow routing on `/`). */
function deskMintFromQuery(query) {
  const raw = query?.t;
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (typeof s !== "string") return null;
  const t = s.trim();
  return isProbableSolanaMint(t) ? t : null;
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
  const [alerts, setAlerts] = useState([]);
  const [signalCursor, setSignalCursor] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [strategyMode, setStrategyMode] = useState("balanced");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [visibleTrending, setVisibleTrending] = useState(
    Array.isArray(initialTrending) && initialTrending.length ? initialTrending : []
  );
  const [tacticalTab, setTacticalTab] = useState("live");
  const [historyRows, setHistoryRows] = useState([]);
  const [outcomesSummary, setOutcomesSummary] = useState(null);
  const [bestRecentFromApi, setBestRecentFromApi] = useState(null);
  const [topWalletsApi, setTopWalletsApi] = useState([]);
  const [apiFeedCards, setApiFeedCards] = useState([]);
  const [entryCountdownByMint, setEntryCountdownByMint] = useState({});
  const [liveExpanded, setLiveExpanded] = useState(false);
  const [heatExpanded, setHeatExpanded] = useState(false);
  const debounceTimerRef = useRef(null);
  const skipTacticalTabPersistRef = useRef(true);
  useLiveFeedSocket({ onSignal: useCallback(() => {}, []) });
  const router = useRouter();
  const selectedMint = useMemo(() => deskMintFromQuery(router.query), [router.query]);
  const { coordination: deskCoordination } = useWebSocket(selectedMint);
  const { isWarMode } = useWarMode();
  const trendingQuery = useTrendingTokens(initialTrending, initialTrendingMeta, "", {
    limit: heatExpanded ? UI_CONFIG.TRENDING_API_LIMIT_EXPANDED : UI_CONFIG.TRENDING_API_LIMIT_COMPACT,
    refetchMs: isWarMode ? UI_CONFIG.TRENDING_REFETCH_WAR_MS : UI_CONFIG.TRENDING_REFETCH_NORMAL_MS
  });
  const trending = trendingQuery.data?.data || (trendingQuery.isError ? FALLBACK_TRENDING : []);
  const trendingMeta = trendingQuery.data?.meta || {};
  const updateVisibleTrending = useCallback((nextTrending) => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      setVisibleTrending(nextTrending);
    }, 180);
  }, []);
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
    const source = topWalletsApi.length ? topWalletsApi : TOP_SMART_WALLETS;
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

  const bestRecentDisplay = useMemo(() => {
    if (bestRecentFromApi?.token) {
      const conf = bestRecentFromApi.confidence != null ? Number(bestRecentFromApi.confidence) : null;
      return {
        headline: `${bestRecentFromApi.token.slice(0, 6)}…${bestRecentFromApi.token.slice(-4)}`,
        outcomePct: Number(bestRecentFromApi.outcomePct),
        horizon: "~1h est.",
        signal: conf != null && Number.isFinite(conf) ? Math.round(Math.min(100, Math.max(1, conf))) : 78,
        mint: bestRecentFromApi.token
      };
    }
    return {
      headline: `$${RECENT_SIGNAL_OUTCOMES[0]?.symbol}`,
      outcomePct: RECENT_SIGNAL_OUTCOMES[0]?.outcomePct,
      horizon: RECENT_SIGNAL_OUTCOMES[0]?.horizon,
      signal: RECENT_SIGNAL_OUTCOMES[0]?.signal,
      mint: FALLBACK_TRENDING[1]?.mint || "So11111111111111111111111111111111111111112"
    };
  }, [bestRecentFromApi]);
  const topWalletLabelAddrs = useMemo(() => rankedWallets.map((w) => w.address).filter(Boolean), [rankedWallets]);
  const { labelFor: topWalletLabel, titleFor: topWalletTitle } = useWalletLabels(topWalletLabelAddrs);
  const interpretedSignalsRaw = useMemo(() => {
    // Build the raw list from either the live API payload or the trending
    // fallback, then sort deterministically by Sentinel score descending so
    // the "best" cards physically rise to the top as scores drift over time.
    // This is what makes the grid feel like a live ranking rather than a
    // static list.
    let raw;
    if (apiFeedCards.length) {
      raw = apiFeedCards.map((c, idx) => {
        const sym = String(c.token || "TOKEN").replace(/^\$/, "").trim() || "TOKEN";
        const liq = liquidityFromApiRedFlags(c.redFlags);
        const mint =
          c.tokenAddress && isProbableSolanaMint(c.tokenAddress) ? c.tokenAddress : null;
        const apiSw = Number(c.smartWallets);
        const smartWallets =
          Number.isFinite(apiSw) && apiSw > 0 ? Math.min(99, Math.max(2, Math.round(apiSw))) : Math.min(9, Math.max(2, 2 + (idx % 5)));
        return {
          symbol: sym,
          mint,
          token: {
            symbol: sym,
            mint: c.tokenAddress,
            liquidity: liq,
            volume24h: 900000,
            change: c.decision === "ENTER NOW" ? 9 : c.decision === "PREPARE" ? 3 : -1,
            whyTrade: Array.isArray(c.whyNow) ? c.whyNow : []
          },
          signalStrength: Number(c.sentinelScore) || 70,
          smartWallets,
          context: c.contextHistory || "Live signal cluster",
          clusterScore: Math.min(99, Math.max(45, Number(c.sentinelScore) - 6)),
          momentum: 0,
          _api: c
        };
      });
    } else {
      raw = (visibleTrending.length ? visibleTrending : FALLBACK_TRENDING)
        .slice(0, 24)
        .map((token, idx) => signalFromToken(token, idx));
    }
    raw = raw.filter((row) => row.mint && isProbableSolanaMint(row.mint));
    if (!raw.length) {
      raw = FALLBACK_TRENDING.map((token, idx) => signalFromToken(token, idx)).filter((row) => row.mint);
    }
    return raw
      .slice()
      .sort((a, b) => (Number(b.signalStrength) || 0) - (Number(a.signalStrength) || 0));
  }, [apiFeedCards, visibleTrending]);

  const rankingFlushMs = isWarMode ? UI_CONFIG.RANKING_FLUSH_WAR_MS : UI_CONFIG.RANKING_FLUSH_NORMAL_MS;
  const interpretedSignals = useRankingSnapshot(interpretedSignalsRaw, rankingFlushMs);

  const liveSignalPool = useMemo(() => {
    const minCards = 12;
    const byMint = new Map();
    interpretedSignals.forEach((sig) => {
      if (!sig?.mint || !isProbableSolanaMint(sig.mint)) return;
      if (!byMint.has(sig.mint)) byMint.set(sig.mint, sig);
    });
    (visibleTrending.length ? visibleTrending : FALLBACK_TRENDING).forEach((token, idx) => {
      const built = signalFromToken(token, idx);
      if (built.mint && !byMint.has(built.mint)) byMint.set(built.mint, built);
    });
    const out = Array.from(byMint.values()).sort(
      (a, b) => (Number(b.signalStrength) || 0) - (Number(a.signalStrength) || 0)
    );
    if (out.length >= minCards) return out;
    const seed = visibleTrending.length ? visibleTrending : FALLBACK_TRENDING;
    let cursor = 0;
    while (out.length < minCards && seed.length) {
      const built = signalFromToken(seed[cursor % seed.length], out.length);
      if (built.mint) out.push(built);
      cursor += 1;
      if (cursor > seed.length * 40) break;
    }
    return out.sort(
      (a, b) => (Number(b.signalStrength) || 0) - (Number(a.signalStrength) || 0)
    );
  }, [interpretedSignals, visibleTrending]);

  const liveSignalsForGrid = useMemo(
    () =>
      liveSignalPool.slice(
        0,
        liveExpanded ? UI_CONFIG.GRID_EXPANDED_MAX_CARDS : UI_CONFIG.GRID_COMPACT_CARDS
      ),
    [liveExpanded, liveSignalPool]
  );

  const liveVirtuosoRows = useMemo(
    () =>
      liveSignalsForGrid.length > UI_CONFIG.VIRTUOSO_ROW_THRESHOLD
        ? chunkArray(liveSignalsForGrid, UI_CONFIG.VIRTUOSO_COLUMNS)
        : [],
    [liveSignalsForGrid]
  );

  const heatTokenPool = useMemo(() => {
    const minCards = 12;
    const out = [];
    const seen = new Set();

    const tryAdd = (t) => {
      if (!t?.mint || !isProbableSolanaMint(t.mint)) return;
      if (seen.has(t.mint)) return;
      seen.add(t.mint);
      out.push(t);
    };

    (visibleTrending.length ? visibleTrending : []).forEach((t) => tryAdd(t));
    interpretedSignals.forEach((sig, idx) => tryAdd(tokenFromSignal(sig, idx)));

    let fi = 0;
    while (out.length < minCards && FALLBACK_TRENDING.length) {
      tryAdd(FALLBACK_TRENDING[fi % FALLBACK_TRENDING.length]);
      fi += 1;
      if (fi > FALLBACK_TRENDING.length * 24) break;
    }

    let dup = 0;
    while (out.length < minCards && FALLBACK_TRENDING.length) {
      const src = FALLBACK_TRENDING[dup % FALLBACK_TRENDING.length];
      if (src?.mint && isProbableSolanaMint(src.mint)) out.push({ ...src });
      dup += 1;
      if (dup > 96) break;
    }

    return out
      .slice()
      .sort((a, b) => computeSignalStrength(b) - computeSignalStrength(a));
  }, [interpretedSignals, visibleTrending]);

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
  const liveSignal = interpretedSignals[signalCursor % Math.max(1, interpretedSignals.length)];

 

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = JSON.parse(localStorage.getItem("sentinel-alerts") || "[]");
      setAlerts(saved.slice(-5).reverse());
      setIsLoggedIn(Boolean(localStorage.getItem("token")));
      const tab = localStorage.getItem(TACTICAL_TAB_LS_KEY);
      if (tab === "live" || tab === "hot" || tab === "history") setTacticalTab(tab);
    } catch (_) {
      setAlerts([]);
      setIsLoggedIn(false);
    }
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
    updateVisibleTrending(trending);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [trending, updateVisibleTrending]);

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
        setBestRecentFromApi(j?.bestRecent && typeof j.bestRecent === "object" ? j.bestRecent : null);
      })
      .catch(() => {
        if (!cancelled) {
          setOutcomesSummary(null);
          setBestRecentFromApi(null);
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

  // Poll /api/v1/signals/latest every 15 s via React Query. Keeps previous
  // data visible during a refetch so the grid never flashes empty, pauses
  // when the tab is hidden, and re-fires on window focus — effectively
  // turning the Live Smart Money Feed truly live without any backend work.
  const signalsFeedQuery = useSignalsFeed({
    strategy: strategyMode,
    limit: liveExpanded ? UI_CONFIG.SIGNAL_API_LIMIT_EXPANDED : UI_CONFIG.SIGNAL_API_LIMIT_COMPACT,
    refetchMs: isWarMode ? UI_CONFIG.SIGNAL_FEED_REFETCH_WAR_MS : UI_CONFIG.SIGNAL_FEED_REFETCH_NORMAL_MS
  });
  useEffect(() => {
    const data = signalsFeedQuery.data?.data;
    if (Array.isArray(data) && data.length) setApiFeedCards(data);
    else if (signalsFeedQuery.isError) setApiFeedCards([]);
  }, [signalsFeedQuery.data, signalsFeedQuery.isError]);
  const signalsAgeSec = signalsFeedQuery.dataUpdatedAt
    ? Math.max(0, Math.floor((Date.now() - signalsFeedQuery.dataUpdatedAt) / 1000))
    : null;

  useEffect(() => {
    if (tacticalTab !== "history") return;
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

  const marketMood = useMemo(() => {
    if (!visibleTrending.length) return { label: "—", className: "text-gray-400" };
    const avg =
      visibleTrending.reduce((acc, t) => acc + Number(t.change || 0), 0) / visibleTrending.length;
    if (avg > 5) return { label: "Favorable", className: "text-emerald-300" };
    if (avg > 0) return { label: "Templado", className: "text-amber-300" };
    return { label: "A la defensiva", className: "text-red-300" };
  }, [visibleTrending]);

  return (
    <>
      <PageHead
        title="Sentinel Ledger — Smart Money Tracker for Solana in Real Time"
        description="Track the highest win-rate wallets on Solana. Interpreted signals, not raw noise. Free to start."
      />
      <WarLayout
        header={<WarHeader />}
        feed={
          <>
            <HomeOnboarding />
            <WelcomeBanner />
            <div className="w-full max-w-[100vw] overflow-x-clip">
        <div className="px-2 sm:px-3 pt-1 pb-0 border-b border-cyan-500/20 bg-[#050a0f]/80">
        <p className="px-1 pt-1 pb-2 text-center text-[12px] sm:text-[13px] sm:text-left text-gray-300 leading-snug">
          <span className="text-cyan-400/90">Paso 1</span> — Mira <span className="text-white/95 font-medium">LIVE</span>, <span className="text-white/95 font-medium">HOT</span> o <span className="text-white/95 font-medium">HISTORY</span> arriba.{" "}
          <span className="text-gray-500">Buscador y wallet fijos. En pantalla ancha, «Más»; en móvil, el menú ☰.</span>
        </p>
        <TacticalFeed
          tacticalTab={tacticalTab}
          onTabChange={setTacticalTab}
          historyRows={historyRows}
          liveExpanded={liveExpanded}
          onToggleLiveExpanded={() => setLiveExpanded((v) => !v)}
          liveSignalsForGrid={liveSignalsForGrid}
          liveSignalPool={liveSignalPool}
          signalsFeedIsError={signalsFeedQuery.isError}
          signalsAgeSec={signalsAgeSec}
          isWarMode={isWarMode}
          liveVirtuosoRows={liveVirtuosoRows}
          entryCountdownByMint={entryCountdownByMint}
          strategyMode={strategyMode}
          signalCursor={signalCursor}
          signalsRankDeltas={signalsRankDeltas}
          selectedMint={selectedMint}
          deskCoordination={deskCoordination}
          onSelectMint={(mint) => router.push(`/?t=${encodeURIComponent(mint)}`, undefined, { shallow: true })}
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

        </div>
        <div className="sl-container py-4 sm:py-8 md:py-12 max-w-full">
        <WarHomeIntro
          strategyMode={strategyMode}
          onStrategyModeChange={setStrategyMode}
          soundEnabled={soundEnabled}
          onToggleSound={() => setSoundEnabled((v) => !v)}
        />

        <WarHomeUtilityRail />
        </div>

        <div className="sl-container max-w-full pb-6 sm:pb-10">
        <WarHomeCombatPanels
          bestRecentDisplay={bestRecentDisplay}
          outcomesSummary={outcomesSummary}
          rankedWallets={rankedWallets}
          topWalletsFromApi={topWalletsApi.length > 0}
          topWalletTitle={topWalletTitle}
          topWalletLabel={topWalletLabel}
          strategyMode={strategyMode}
          isLoggedIn={isLoggedIn}
          liveSignal={liveSignal}
          marketMood={marketMood}
          alerts={alerts}
        />
        </div>
      </div>
          </>
        }
        desk={<TokenDesk key={selectedMint ?? "__desk_none__"} mint={selectedMint} />}
      />
    </>
  );
}
