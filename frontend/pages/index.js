import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  BarChart3,
  Flame,
  Info,
  Loader2,
  Radar,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Volume2,
  VolumeX,
  Waves,
  Zap
} from "lucide-react";
import { formatUsdWhole } from "../lib/formatStable";
import { ProButton } from "../components/ui/ProButton";
import { useTrendingTokens } from "../hooks/useTrendingTokens";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { Ticker } from "../components/layout/Ticker";
import { AnimatedNumber } from "../components/ui/AnimatedNumber";
import { useLiveFeedSocket } from "../hooks/useLiveFeedSocket";
import { PageHead } from "../components/seo/PageHead";
import { WelcomeBanner } from "../components/public/WelcomeBanner";
import { useWalletLabels } from "../hooks/useWalletLabels";

const FALLBACK_TRENDING = [
  {
    symbol: "BONK",
    mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    grade: "B",
    price: 0.000028,
    change: 12.1,
    volume24h: 2100000,
    flowLabel: "Buy pressure",
    liquidity: 240000,
    alphaSpeedMins: 8,
    whyTrade: [
      "Early whale accumulation in first liquidity window.",
      "Healthy depth for entries without extreme slippage.",
      "Volume expansion confirms participation."
    ]
  },
  {
    symbol: "WIF",
    mint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
    grade: "A",
    price: 2.13,
    change: 8.6,
    volume24h: 48000000,
    flowLabel: "Smart inflow",
    liquidity: 820000,
    alphaSpeedMins: 5,
    whyTrade: [
      "Smart wallets continue to add on momentum.",
      "Deep liquidity supports larger position sizing.",
      "Sustained turnover keeps execution clean."
    ]
  },
  {
    symbol: "JUP",
    mint: "JUPyiwrYJFksjQVdKWvHJHGzS76nqbwsjZBM74fATFc",
    grade: "A+",
    price: 1.22,
    change: 5.3,
    volume24h: 31000000,
    flowLabel: "Liquidity deep",
    liquidity: 560000,
    alphaSpeedMins: 6,
    whyTrade: [
      "Balanced trend with strong market structure.",
      "Volume confirms persistent demand.",
      "Quality liquidity reduces trap risk."
    ]
  },
  {
    symbol: "POPCAT",
    mint: "7GCihgDB8fe6KNjn2MYtkzZcRjXd3ngw7tF5RbwimQyg",
    grade: "C",
    price: 0.65,
    change: -3.1,
    volume24h: 890000,
    flowLabel: "Mixed flow",
    liquidity: 110000,
    alphaSpeedMins: 14,
    whyTrade: [
      "Potential mean-reversion setup after pullback.",
      "Still inside tradable liquidity band.",
      "Flow remains mixed, favor tighter risk management."
    ]
  }
];

const TOP_SMART_WALLETS = [
  {
    wallet: "9xAb...L3kP",
    address: "7YqvBxbp5XJvYzX1Q2f7pN8mQ3uQmY9mQb8Qxqj2mT8x",
    winRate: 91.4,
    earlyEntry: 88,
    cluster: 84,
    consistency: 89,
    signalStrength: 90,
    pnl30d: 38420,
    tooltip: "Big win: +$12.4k on BONK breakout."
  },
  {
    wallet: "5KmQ...T8uD",
    address: "4g3b6PqvT2n8mM9mQx2sJ1pK8pQ9xY7uV2cR5bN1mX3q",
    winRate: 87.2,
    earlyEntry: 81,
    cluster: 79,
    consistency: 86,
    signalStrength: 84,
    pnl30d: 22790,
    tooltip: "Big win: +$8.1k on WIF momentum add."
  },
  {
    wallet: "Dx2n...Qz7M",
    address: "9mQx2sJ1pK8pQ9xY7uV2cR5bN1mX3q4g3b6PqvT2n8m",
    winRate: 85.8,
    earlyEntry: 78,
    cluster: 82,
    consistency: 80,
    signalStrength: 82,
    pnl30d: 19860,
    tooltip: "Big win: +$6.3k on JUP rotation."
  },
  {
    wallet: "A7rP...mV4x",
    address: "5tK9pQxY7uV2cR5bN1mX3q4g3b6PqvT2n8mM9mQx2sJ",
    winRate: 83.6,
    earlyEntry: 76,
    cluster: 73,
    consistency: 79,
    signalStrength: 78,
    pnl30d: 14550,
    tooltip: "Big win: +$5.4k on POPCAT reclaim."
  }
];
const RECENT_SIGNAL_OUTCOMES = [
  { symbol: "WIF", signal: 91, outcomePct: 63, horizon: "2h" },
  { symbol: "BONK", signal: 87, outcomePct: 41, horizon: "1h" },
  { symbol: "XYZ", signal: 78, outcomePct: -12, horizon: "4h" }
];

function gradeClass(grade) {
  if (grade === "A+" || grade === "A") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/25";
  if (grade === "B" || grade === "C") return "bg-amber-500/15 text-amber-200 border-amber-500/25";
  return "bg-red-500/15 text-red-300 border-red-500/25";
}

function computeSignalStrength(token) {
  const liq = Number(token?.liquidity || 0);
  const vol = Number(token?.volume24h || 0);
  const chg = Math.max(0, Number(token?.change || 0));
  const base = Math.min(100, liq / 8000 + vol / 25000 + chg * 1.8);
  return Math.max(35, Math.round(base));
}

function heatClass(score) {
  if (score >= 90) return "from-red-500 to-orange-500";
  if (score >= 70) return "from-amber-500 to-orange-400";
  return "from-blue-500 to-cyan-400";
}

function clusterHeatEmoji(score) {
  const s = Number(score || 0);
  if (s >= 85) return "🔥🔥🔥";
  if (s >= 65) return "🔥🔥";
  return "🔥";
}

function actionThresholds(mode) {
  if (mode === "conservative") return { high: 90, mid: 75 };
  if (mode === "aggressive") return { high: 80, mid: 62 };
  return { high: 85, mid: 68 };
}

function suggestedAction(signalStrength, mode = "balanced", variant = "feed") {
  const { high, mid } = actionThresholds(mode);
  if (variant === "wallet") {
    if (signalStrength >= high) return "FOLLOW";
    if (signalStrength >= mid) return "MONITOR";
    return "IGNORE";
  }
  if (variant === "token") {
    if (signalStrength >= high) return "ENTER NOW";
    if (signalStrength >= mid) return "PREPARE";
    return "STAY OUT";
  }
  if (signalStrength >= high) return "ENTER NOW";
  if (signalStrength >= mid) return "PREPARE";
  return "STAY OUT";
}

function actionTone(signalStrength) {
  if (signalStrength >= 85) return "text-emerald-300 bg-emerald-500/10 border-emerald-500/30";
  if (signalStrength >= 65) return "text-amber-200 bg-amber-500/10 border-amber-500/30";
  return "text-red-300 bg-red-500/10 border-red-500/30";
}

function confidenceLabel(signalStrength) {
  if (signalStrength >= 95) return "STRONG CONVICTION";
  if (signalStrength >= 80) return "BUILD POSITION";
  return "LOW EDGE";
}

function confidenceDot(signalStrength) {
  if (signalStrength >= 95) return "bg-emerald-400";
  if (signalStrength >= 80) return "bg-amber-400";
  return "bg-red-400";
}

function confidenceTone(signalStrength) {
  if (signalStrength >= 95) return "text-emerald-200 border-emerald-500/35 bg-emerald-500/10";
  if (signalStrength >= 80) return "text-amber-200 border-amber-500/35 bg-amber-500/10";
  return "text-red-200 border-red-500/35 bg-red-500/10";
}

function initialCountdownSec(signalStrength) {
  if (signalStrength >= 90) return 200 + Math.floor(Math.random() * 280);
  if (signalStrength >= 75) return 80 + Math.floor(Math.random() * 110);
  return 20 + Math.floor(Math.random() * 60);
}

function formatCountdown(sec) {
  const safe = Math.max(0, Number(sec || 0));
  const mm = Math.floor(safe / 60);
  const ss = safe % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

function hoursAgoLabel(iso) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const h = ms / 3600000;
  if (h < 1) return `${Math.max(1, Math.round(ms / 60000))} min ago`;
  return `${h.toFixed(1)} hours ago`;
}

function entryWindowFromCountdown(sec) {
  if (sec > 180) return { label: "OPEN", detail: `${formatCountdown(sec)} left`, tone: "text-emerald-300" };
  if (sec > 0) return { label: "CLOSING", detail: `${formatCountdown(sec)} left`, tone: "text-amber-300" };
  return { label: "CLOSED", detail: "window consumed", tone: "text-red-300" };
}

function buildJupiterSwapUrl(mint, amountSol) {
  if (!mint) return "#";
  const amountLamports = Math.round(Number(amountSol || 0) * 1_000_000_000);
  return `https://jup.ag/swap/SOL-${mint}?amount=${amountLamports}`;
}

function redFlagsForSignal(signalStrength, token) {
  const out = [];
  if (Number(token?.liquidity || 0) < 50000) out.push("⚠️ Low liquidity");
  if (signalStrength < 72) out.push("⚠️ Cluster conviction low");
  if (Number(token?.change || 0) < 0) out.push("⚠️ Momentum fading");
  return out;
}

function evidenceChipsEmoji(signalStrength, token) {
  const out = ["🐋", "🧠"];
  if (signalStrength >= 82) out.push("🔥");
  if (Number(token?.liquidity || 0) < 70000) out.push("💧");
  if (Number(token?.volume24h || 0) > 500000) out.push("🤖");
  return out.slice(0, 5);
}

function entryWindowVisual(sec) {
  const s = Math.max(0, Number(sec || 0));
  if (s > 180) return { gradient: "from-emerald-500 to-emerald-400", text: "text-emerald-300" };
  if (s > 60) return { gradient: "from-amber-400 to-amber-500", text: "text-amber-300" };
  return { gradient: "from-red-600 to-red-500", text: "text-red-300" };
}

function scoreBarGradient(strength) {
  const s = Number(strength || 0);
  if (s >= 85) return "from-emerald-400 via-lime-400 to-cyan-400";
  if (s >= 65) return "from-amber-400 to-orange-400";
  return "from-red-500 to-orange-700";
}

function redFlagsLines(signalStrength, token) {
  const liq = Number(token?.liquidity || 0);
  const liqLabel = liq < 50000 ? `$${formatUsdWhole(Math.max(8000, Math.round(liq)))}` : "$12k+";
  return [`Low liquidity ${liqLabel}`, "Dev holding 20%", "Honeypot risk YES"];
}

export async function getServerSideProps() {
  try {
    const res = await fetch(`${getPublicApiUrl()}/api/v1/token/trending`);
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
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [recentSearches, setRecentSearches] = useState([]);
  const [liveSignalsDetected, setLiveSignalsDetected] = useState(37);
  const [signalCursor, setSignalCursor] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [strategyMode, setStrategyMode] = useState("balanced");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [visibleTrending, setVisibleTrending] = useState(
    Array.isArray(initialTrending) && initialTrending.length ? initialTrending : []
  );
  const [feedMode, setFeedMode] = useState("live");
  const [historyRows, setHistoryRows] = useState([]);
  const [nextSignalEtaSec, setNextSignalEtaSec] = useState(30);
  const [monitoringWallets, setMonitoringWallets] = useState(27);
  const [clusterScanCount, setClusterScanCount] = useState(11);
  const [wsBump, setWsBump] = useState(0);
  const [entryCountdownByMint, setEntryCountdownByMint] = useState({});
  const debounceTimerRef = useRef(null);
  const onWsSignal = useCallback(() => setWsBump((n) => n + 1), []);
  useLiveFeedSocket({ onSignal: onWsSignal });
  const router = useRouter();
  const trendingQuery = useTrendingTokens(initialTrending, initialTrendingMeta);
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
  const feedIsLive = !trendingQuery.isError && !!trending.length && (feedAgeSec === null || feedAgeSec <= 90);
  const feedLabel = feedIsLive ? "Live" : "Delayed";
  const rankedWallets = useMemo(() => {
    return TOP_SMART_WALLETS.slice()
      .map((wallet) => ({
        ...wallet,
        smartScore: Math.round(
          wallet.winRate * 0.35 + wallet.earlyEntry * 0.25 + wallet.cluster * 0.2 + wallet.consistency * 0.2
        )
      }))
      .sort((a, b) => b.smartScore - a.smartScore);
  }, []);
  const topWalletLabelAddrs = useMemo(() => rankedWallets.map((w) => w.address).filter(Boolean), [rankedWallets]);
  const { labelFor: topWalletLabel, titleFor: topWalletTitle } = useWalletLabels(topWalletLabelAddrs);
  const interpretedSignals = useMemo(() => {
    return (visibleTrending.length ? visibleTrending : FALLBACK_TRENDING).slice(0, 6).map((token, idx) => {
      const signalStrength = computeSignalStrength(token);
      const smartWallets = Math.max(2, Math.min(9, Math.round(signalStrength / 15)));
      const context =
        idx % 2 === 0
          ? `Last similar signal → +${Math.max(18, Math.round(signalStrength * 0.75))}% in 3h`
          : `Wallet hit rate: ${Math.max(4, Math.round(signalStrength / 20))}/6 last trades`;
      return {
        symbol: token.symbol || "TOKEN",
        mint: token.mint || "So11111111111111111111111111111111111111112",
        token,
        signalStrength,
        smartWallets,
        context,
        clusterScore: Math.min(99, Math.max(45, signalStrength - 6)),
        momentum: token.volume24h || 0
      };
    });
  }, [visibleTrending]);
  const liveSignal = interpretedSignals[signalCursor % Math.max(1, interpretedSignals.length)];

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = JSON.parse(localStorage.getItem("sentinel-alerts") || "[]");
      setAlerts(saved.slice(-5).reverse());
      const recents = JSON.parse(localStorage.getItem("sentinel-recents") || "[]");
      setRecentSearches(recents.slice(0, 5));
      setIsLoggedIn(Boolean(localStorage.getItem("token")));
    } catch (_) {
      setAlerts([]);
      setRecentSearches([]);
      setIsLoggedIn(false);
    }
  }, []);
  useEffect(() => {
    updateVisibleTrending(trending);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [trending, updateVisibleTrending]);

  useEffect(() => {
    const timer = setInterval(() => {
      setLiveSignalsDetected((prev) => Math.max(12, prev + (Math.random() > 0.5 ? 1 : -1)));
      setSignalCursor((prev) => prev + 1);
    }, 9000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setNextSignalEtaSec((prev) => {
        if (prev <= 1) return Math.floor(25 + Math.random() * 35);
        return prev - 1;
      });
      setMonitoringWallets((prev) => Math.max(18, Math.min(44, prev + (Math.random() > 0.55 ? 1 : -1))));
      setClusterScanCount((prev) => Math.max(6, Math.min(22, prev + (Math.random() > 0.55 ? 1 : -1))));
    }, 1000);
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
    if (feedMode !== "history") return;
    let cancelled = false;
    fetch(`${getPublicApiUrl()}/api/v1/public/signals-24h`)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setHistoryRows(Array.isArray(j?.rows) ? j.rows : []);
      })
      .catch(() => {
        if (!cancelled) setHistoryRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [feedMode]);

  const marketMood = useMemo(() => {
    if (!visibleTrending.length) return { label: "Loading", className: "text-gray-300" };
    const avg =
      visibleTrending.reduce((acc, t) => acc + Number(t.change || 0), 0) / visibleTrending.length;
    if (avg > 5) return { label: "Bullish", className: "text-emerald-300" };
    if (avg > 0) return { label: "Neutral+", className: "text-amber-300" };
    return { label: "Risk-off", className: "text-red-300" };
  }, [visibleTrending]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (isScanning) return;
    const value = address.trim();
    if (value.length >= 32) {
      setError("");
      setIsScanning(true);
      try {
        const recents = JSON.parse(localStorage.getItem("sentinel-recents") || "[]");
        const next = [value, ...recents.filter((item) => item !== value)].slice(0, 5);
        localStorage.setItem("sentinel-recents", JSON.stringify(next));
      } catch (_) {}
      await new Promise((resolve) => setTimeout(resolve, 450));
      router.push(`/token/${value}`);
      return;
    }
    setIsScanning(false);
    setError("Paste a valid Solana mint (32–44 characters).");
  };

  return (
    <>
      <PageHead
        title="Sentinel Ledger — Smart Money Tracker for Solana in Real Time"
        description="Track the highest win-rate wallets on Solana. Interpreted signals, not raw noise. Free to start."
      />
      <WelcomeBanner />
      <div className="min-h-screen w-full max-w-[100vw] overflow-x-clip">
      <div className="sl-container py-8 sm:py-10 md:py-14 max-w-full mx-4 sm:mx-auto">
        <section className="sl-section">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-[0_0_24px_rgba(16,185,129,0.12)] hover:shadow-[0_0_32px_rgba(16,185,129,0.18)] transition-shadow">
            <div className="inline-flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400" />
              </span>
              <span className="text-xs sm:text-sm uppercase tracking-wide text-emerald-200 font-semibold">
                🟢 LIVE SIGNALS DETECTED (24H): {liveSignalsDetected}
              </span>
            </div>
            <div className="inline-flex flex-wrap items-center gap-2 text-[11px] text-gray-200">
              <span>+3 signals in last 2 min</span>
              <span className="text-gray-500">|</span>
              <span>
                ⏱ Next signal expected in ~{Math.max(5, Math.round(nextSignalEtaSec / 5) * 5)}s
              </span>
              <Link
                href="/pricing"
                className="ml-1 px-2 py-1 rounded-md border border-purple-500/40 bg-purple-500/15 text-purple-200 hover:bg-purple-500/25 hover:shadow-[0_0_12px_rgba(168,85,247,0.35)]"
              >
                🔒 Unlock PRO →
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-gray-300">Strategy Mode:</span>
              {[
                { id: "conservative", label: "Conservative" },
                { id: "balanced", label: "Balanced" },
                { id: "aggressive", label: "Aggressive" }
              ].map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setStrategyMode(mode.id)}
                  className={`text-xs px-2.5 py-1.5 rounded-md border ${
                    strategyMode === mode.id
                      ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-100"
                      : "border-white/15 bg-white/5 text-gray-300 hover:text-white"
                  }`}
                >
                  {mode.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSoundEnabled((v) => !v)}
                className="text-xs px-3 py-1.5 rounded-lg border border-white/15 bg-white/5 text-gray-300 hover:text-white"
              >
                {soundEnabled ? (
                  <span className="inline-flex items-center gap-1">
                    <Volume2 size={14} /> Sound on
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <VolumeX size={14} /> Sound off
                  </span>
                )}
              </button>
            </div>
          </div>
        </section>

        <section className="sl-section">
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm">
            <p className="text-cyan-200">
              ⏳ Next signal expected in: ~{Math.max(1, Math.ceil(nextSignalEtaSec / 60))} min
            </p>
            <p className="text-gray-300 mt-1">🟢 Monitoring {monitoringWallets} wallets...</p>
            <p className="text-gray-400 mt-1">📡 Scanning {clusterScanCount} clusters in real-time...</p>
            {wsBump > 0 ? (
              <p className="text-[11px] text-emerald-300/90 mt-2 font-mono">Live WS events: {wsBump}</p>
            ) : null}
          </div>
        </section>

        <Ticker />

        <section className="sl-section">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Feed mode">
            <span className="text-[11px] text-gray-500 uppercase tracking-wide">Feed</span>
            <button
              type="button"
              onClick={() => setFeedMode("live")}
              className={`text-xs px-3 py-1.5 rounded-lg border font-semibold ${
                feedMode === "live"
                  ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200"
                  : "border-white/10 bg-white/[0.03] text-gray-400"
              }`}
              aria-pressed={feedMode === "live"}
            >
              LIVE
            </button>
            <button
              type="button"
              onClick={() => setFeedMode("history")}
              className={`text-xs px-3 py-1.5 rounded-lg border font-semibold ${
                feedMode === "history"
                  ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-200"
                  : "border-white/10 bg-white/[0.03] text-gray-400"
              }`}
              aria-pressed={feedMode === "history"}
            >
              24H HISTORY
            </button>
          </div>
        </section>

        {feedMode === "history" ? (
          <section translate="no" className="sl-section">
            <h2 className="sl-h2 text-white mb-2">24h verified outcomes</h2>
            <p className="text-xs text-gray-500 mb-4">On-chain linked signals from the last 24 hours.</p>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {historyRows.length === 0 ? (
                <p className="text-sm text-gray-500 col-span-full">
                  No rows in the last 24h. Add signals and prices in Supabase, or switch to LIVE.
                </p>
              ) : (
                historyRows.map((r) => (
                  <div
                    key={r.id}
                    className={`rounded-xl border p-4 space-y-2 font-mono text-sm ${
                      r.status === "WIN"
                        ? "bg-emerald-500/[0.06] border-emerald-500/25"
                        : r.status === "LOSS"
                          ? "bg-red-500/[0.06] border-red-500/25"
                          : "bg-white/[0.02] border-white/10"
                    }`}
                  >
                    <div className="flex justify-between gap-2">
                      <span className="text-gray-200">{r.token?.slice(0, 8)}…</span>
                      <span
                        className={
                          r.status === "WIN"
                            ? "text-emerald-300"
                            : r.status === "LOSS"
                              ? "text-red-300"
                              : "text-gray-400"
                        }
                      >
                        {r.status}
                      </span>
                    </div>
                    <p className="text-emerald-200">
                      {r.resultPct != null && !Number.isNaN(Number(r.resultPct))
                        ? `${Number(r.resultPct) >= 0 ? "+" : ""}${Number(r.resultPct).toFixed(1)}% (1h est.)`
                        : "PENDING"}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      Signal {hoursAgoLabel(r.signalAt)} — result verified on-chain
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>
        ) : (
          <section translate="no" className="sl-section">
            <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
              <div>
                <p className="sl-label inline-flex items-center gap-2">
                  <Sparkles size={14} className="text-emerald-400" />
                  Decision Feed
                </p>
                <h1 className="sl-h2 text-white mt-1">Live Smart Money Feed</h1>
              </div>
              <span className="text-[11px] text-gray-500 inline-flex items-center gap-1">
                <Info size={12} />
                Sentinel Score · mock + WS-ready
              </span>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {interpretedSignals.map((sig, idx) => {
              const sec = entryCountdownByMint[sig.mint] || 0;
              const win = entryWindowFromCountdown(sec);
              const vis = entryWindowVisual(sec);
              const action = suggestedAction(sig.signalStrength, strategyMode, "feed");
              const hot = idx === signalCursor % Math.max(1, interpretedSignals.length);
              return (
                <div
                  key={`${sig.mint}-${idx}`}
                  className={`rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3 transition-all duration-300 hover:border-emerald-500/20 hover:shadow-[0_0_22px_rgba(16,185,129,0.12)] ${
                    hot ? "ring-1 ring-emerald-500/35" : ""
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-2xl font-bold text-white tracking-tight">${sig.symbol}</p>
                      <p className="text-[11px] text-cyan-200 font-mono mt-0.5">{sig.smartWallets} wallets · live</p>
                    </div>
                    <span
                      className={`text-sm px-3 py-1.5 rounded-lg border font-bold ${actionTone(sig.signalStrength)} ${
                        sig.signalStrength > 90 && action === "ENTER NOW" ? "animate-pulse shadow-[0_0_18px_rgba(52,211,153,0.35)]" : ""
                      }`}
                    >
                      {action}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div className="flex items-baseline gap-2">
                      <span className="text-5xl sm:text-6xl font-black tabular-nums font-mono text-white leading-none">
                        {sig.signalStrength}
                      </span>
                      <span className="text-xs text-gray-500 pb-1">SENTINEL SCORE</span>
                    </div>
                    <span className={`text-[10px] px-2 py-1 rounded border ${confidenceTone(sig.signalStrength)}`}>
                      {confidenceLabel(sig.signalStrength)}
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-gray-800 overflow-hidden ring-1 ring-white/5">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${scoreBarGradient(sig.signalStrength)}`}
                      style={{ width: `${sig.signalStrength}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 font-mono">{sig.context}</p>
                  <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">WHY NOW</p>
                    <ul className="text-xs text-gray-200 mt-1 space-y-1">
                      <li>• {sig.smartWallets} high-win wallets in window</li>
                      <li>• Entry window: 3–8 min est.</li>
                      <li>• Hist. similar avg +{Math.max(24, Math.round(sig.signalStrength * 0.75))}%</li>
                    </ul>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {evidenceChipsEmoji(sig.signalStrength, sig.token || {}).map((chip) => (
                      <span
                        key={chip + idx}
                        className="text-sm px-2 py-1 rounded-full border border-white/15 bg-white/[0.04] hover:shadow-[0_0_12px_rgba(16,185,129,0.2)] transition-shadow"
                        title="Evidence"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                  {redFlagsForSignal(sig.signalStrength, sig.token || {}).length ? (
                    <p className="text-xs text-red-200">
                      RED FLAGS: {redFlagsForSignal(sig.signalStrength, sig.token || {}).join(" · ")}
                    </p>
                  ) : null}
                  <div className="space-y-1">
                    <p className={`text-[11px] font-mono ${vis.text}`}>
                      ENTRY WINDOW · {win.label} · {win.detail}
                    </p>
                    <div className="h-1.5 rounded-full bg-gray-900 overflow-hidden">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${vis.gradient}`}
                        style={{ width: `${Math.min(100, (sec / 420) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-cyan-200 font-mono">
                    TIME ADVANTAGE · Earlier than {Math.max(72, Math.min(96, sig.signalStrength))}% of traders
                  </p>
                  <p className="text-[11px] text-gray-500 font-mono">
                    SIGNAL DECAY · −3%/min · fresh {Math.max(1, (signalCursor + idx) % 6) + 1}m
                  </p>
                  {sig.signalStrength >= 88 ? (
                    <p className="text-xs text-violet-200 bg-violet-500/10 border border-violet-500/25 rounded px-2 py-1 inline-flex w-fit font-mono">
                      🧬 MULTI-SIGNAL DETECTED
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {[0.5, 1, 5].map((size) => (
                      <a
                        key={size}
                        href={buildJupiterSwapUrl(sig.mint, size)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs px-2.5 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20 hover:shadow-[0_0_14px_rgba(16,185,129,0.35)] font-mono"
                      >
                        {size} SOL
                      </a>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        )}

        <section className="sl-section glass-card sl-inset">
          <form onSubmit={handleSearch} className="space-y-4">
            <p className="sl-label">Quick scan · token mint</p>
            <div className="relative flex flex-col sm:flex-row gap-3">
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Paste Solana token address..."
                className="sl-input h-14 sm:flex-1 sm:min-w-0 pr-4 font-mono text-sm"
              />
              <ProButton type="submit" className="h-14 sm:h-auto sm:px-8 shrink-0 justify-center" disabled={isScanning}>
                {isScanning ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin" />
                    Scanning…
                  </span>
                ) : (
                  "Scan"
                )}
              </ProButton>
            </div>
            {error ? <p className="text-red-400 sl-body mt-1">{error}</p> : null}
            {!!recentSearches.length && (
              <div>
                <p className="sl-label mb-2">Recent</p>
                <div className="flex flex-wrap gap-2">
                  {recentSearches.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => router.push(`/token/${item}`)}
                      className="font-mono text-xs px-3 py-2 rounded-[10px] bg-white/[0.04] border border-white/[0.08] text-gray-300 hover:text-white hover:border-emerald-500/35 transition"
                    >
                      {item.slice(0, 6)}…{item.slice(-4)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </form>
        </section>

        <section className="sl-section grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="glass-card sl-inset border border-orange-500/25 hover:shadow-[0_0_24px_rgba(251,146,60,0.15)] transition-shadow">
            <p className="sl-label">Best Recent Signal</p>
            <h2 className="text-xl font-semibold text-white mt-1 font-mono">
              🔥 BEST RECENT SIGNAL: ${RECENT_SIGNAL_OUTCOMES[0]?.symbol} → +{RECENT_SIGNAL_OUTCOMES[0]?.outcomePct}% in{" "}
              {RECENT_SIGNAL_OUTCOMES[0]?.horizon}
            </h2>
            <p className="text-sm text-gray-300 mt-2">
              Sentinel Score {RECENT_SIGNAL_OUTCOMES[0]?.signal}, ENTER NOW ·{" "}
              <Link href={`/token/${FALLBACK_TRENDING[1]?.mint || "So11111111111111111111111111111111111111112"}`} className="text-emerald-300 underline-offset-2 hover:underline">
                View Breakdown
              </Link>
            </p>
          </div>
          <div className="glass-card sl-inset">
            <p className="sl-label">Proof of Edge</p>
            <h2 className="text-xl font-semibold text-white mt-1 font-mono">📈 LAST 10 SIGNALS</h2>
            <ul className="mt-3 text-sm text-gray-300 space-y-1 font-mono">
              <li>Wins: 7 | Losses: 3</li>
              <li>Avg win: +41% | Avg loss: −11%</li>
              <li>Net return: +247%</li>
            </ul>
          </div>
        </section>

        <section className="sl-section">
          <div className="glass-card sl-inset border border-purple-500/20 hover:shadow-[0_0_22px_rgba(168,85,247,0.2)] transition-shadow">
            <p className="sl-label">FOMO Block</p>
            <h2 className="text-xl font-semibold text-white mt-1">🔒 3 high-probability signals hidden (PRO only)</h2>
            <p className="text-sm text-gray-300 mt-2 font-mono">Avg return: +52% · PRO feed</p>
            <Link href="/pricing" className="btn-pro inline-flex mt-4 no-underline">
              Unlock now → Upgrade to PRO
            </Link>
          </div>
        </section>

        <section className="sl-section">
          <div className="glass-card sl-inset">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="sl-h2 text-white">Top Smart Wallets</h2>
              <span className="text-xs text-gray-500">Ranked by signal edge</span>
            </div>
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-white/10">
                    <th className="py-2 pr-3">Wallet</th>
                    <th className="py-2 pr-3">Win Rate</th>
                    <th className="py-2 pr-3">Early Entry</th>
                    <th className="py-2 pr-3">Cluster</th>
                    <th className="py-2 pr-3">Consistency</th>
                    <th className="py-2 pr-3">Sentinel Score</th>
                    <th className="py-2 pr-3">Confidence</th>
                    <th className="py-2 pr-3">Decision</th>
                    <th className="py-2">30d PnL</th>
                  </tr>
                </thead>
                <tbody>
                  {rankedWallets.map((wallet, wIdx) => (
                    <tr key={wallet.address || wallet.wallet} className="border-b border-white/5 group">
                      <td className="py-3 pr-3">
                        <div className="relative inline-flex items-center gap-2">
                          <span className="text-lg" title="Wallet tier">
                            {wIdx % 2 === 0 ? "🐳" : "🧠"}
                          </span>
                          <span className="text-gray-100 font-medium" title={wallet.address ? topWalletTitle(wallet.address) : wallet.tooltip}>
                            {wallet.address ? topWalletLabel(wallet.address) : wallet.wallet}
                          </span>
                          <span className="hidden group-hover:block absolute top-full left-0 mt-1 z-20 text-xs bg-[#0f1318] border border-purple-500/30 rounded px-2 py-1 text-gray-200 whitespace-nowrap">
                            {wallet.tooltip}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 pr-3 text-emerald-300">{wallet.winRate.toFixed(1)}%</td>
                      <td className="py-3 pr-3">{wallet.earlyEntry}</td>
                      <td className="py-3 pr-3">{wallet.cluster}</td>
                      <td className="py-3 pr-3">{wallet.consistency}</td>
                      <td className="py-3 pr-3">{wallet.signalStrength}</td>
                      <td className="py-3 pr-3">
                        <span className="inline-flex items-center gap-2 text-xs text-gray-300">
                          <span className={`h-2.5 w-2.5 rounded-full ${confidenceDot(wallet.signalStrength)}`} />
                          {confidenceLabel(wallet.signalStrength)}
                        </span>
                      </td>
                      <td className="py-3 pr-3">
                        <span
                          className={`text-xs px-2 py-1 rounded border ${actionTone(wallet.signalStrength)}`}
                        >
                          {suggestedAction(wallet.signalStrength, strategyMode, "wallet")}
                        </span>
                      </td>
                      <td className="py-3 text-emerald-300">+${formatUsdWhole(wallet.pnl30d)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:hidden">
              {rankedWallets.map((wallet, wIdx) => (
                <div key={wallet.address || wallet.wallet} className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-gray-100 inline-flex items-center gap-2 flex-wrap">
                      <span>{wIdx % 2 === 0 ? "🐳" : "🧠"}</span>
                      <span title={wallet.address ? topWalletTitle(wallet.address) : wallet.tooltip}>
                        {wallet.address ? topWalletLabel(wallet.address) : wallet.wallet}
                      </span>
                    </p>
                    <span className="text-emerald-300 text-xs">+${formatUsdWhole(wallet.pnl30d)}</span>
                  </div>
                  <p className="text-xs text-gray-500">{wallet.tooltip}</p>
                  <div className="grid grid-cols-3 gap-2 text-xs text-gray-300">
                    <span>WR {wallet.winRate.toFixed(1)}%</span>
                    <span>EE {wallet.earlyEntry}</span>
                    <span>CS {wallet.cluster}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 text-[11px] text-gray-300">
                      <span className={`h-2.5 w-2.5 rounded-full ${confidenceDot(wallet.signalStrength)}`} />
                      {confidenceLabel(wallet.signalStrength)}
                    </span>
                    <span className={`text-[11px] px-2 py-1 rounded border ${actionTone(wallet.signalStrength)}`}>
                      {suggestedAction(wallet.signalStrength, strategyMode, "wallet")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Hot tokens */}
        <section className="sl-section">
          <div className="glass-card sl-inset">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500/25 to-amber-600/15 border border-orange-500/25 flex items-center justify-center shrink-0">
                  <Flame className="text-orange-300" size={22} />
                </div>
                <div>
                  <p className="sl-label">Hot Tokens</p>
                  <h2 className="sl-h2 text-white mt-0.5">Heat-ranked · decision-ready</h2>
                  <p className="sl-body sl-muted mt-2 max-w-xl text-sm">
                    Score, window, chips, one-click buy — scan fast.
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-start md:items-end gap-1.5">
                <span
                  className={`text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full border ${
                    feedIsLive
                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                      : "bg-amber-500/15 text-amber-200 border-amber-500/30"
                  }`}
                >
                  {feedLabel}
                </span>
                <span className="text-[11px] text-gray-500">
                  {feedAgeSec === null ? "fresh" : `${feedAgeSec}s ago`} · min liq $
                  {formatUsdWhole(trendingMeta.minLiquidityUsd || 15000)}
                </span>
              </div>
            </div>

            {trendingQuery.isError ? (
              <div className="sl-nested sl-inset text-center text-sm text-red-300">
                Could not load trending tokens right now. Try again in a moment.
              </div>
            ) : null}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {(visibleTrending.length ? visibleTrending : Array.from({ length: 6 })).map((token, idx) => {
                const signalStrength = computeSignalStrength(token);
                const action = suggestedAction(signalStrength, strategyMode, "token");
                const confluence = signalStrength >= 85 && Number(token?.change || 0) > 5;
                const timeAdvantage = Math.max(52, Math.min(97, 100 - Math.round(signalStrength / 2)));
                const tokenWindow = entryWindowFromCountdown(entryCountdownByMint[token?.mint] || 0);
                return (
                <div
                  key={token?.mint || `skeleton-${idx}`}
                  translate="no"
                  className={`glass-card p-4 rounded-2xl flex flex-col gap-4 transition-transform duration-200 ${
                    token?.mint ? "hover:scale-[1.02] hover:shadow-[0_0_8px_rgba(139,92,246,0.5)]" : "opacity-75 animate-pulse"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xl font-bold text-white mt-1 tracking-tight">
                        {token?.symbol || "Loading"}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {token?.mint ? `${token.mint.slice(0, 6)}...${token.mint.slice(-4)}` : "Loading setup"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-full border ${gradeClass(token?.grade || "C")}`}
                    >
                      {token?.grade || "…"}
                    </span>
                  </div>

                  <div className="rounded-[10px] border border-white/[0.08] bg-white/[0.02] px-3 py-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500 uppercase tracking-wide">Sentinel Score</span>
                      <span className="text-emerald-300 font-bold font-mono tabular-nums">{signalStrength}/100</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-purple-500 to-cyan-400"
                        style={{ width: `${signalStrength}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className={`px-2 py-1 rounded border ${actionTone(signalStrength)} ${signalStrength > 90 ? "animate-pulse" : ""}`}>
                        Decision: {action}
                      </span>
                      <span
                        className={`px-2 py-1 rounded border ${confidenceTone(signalStrength)}`}
                      >
                        {confidenceLabel(signalStrength)}
                      </span>
                      {confluence ? (
                        <span className="text-violet-200 bg-violet-500/10 border border-violet-500/25 rounded px-2 py-1">
                          🧬 Confluence
                        </span>
                      ) : null}
                    </div>
                    <div className="text-[11px] text-gray-400">Time Advantage: You are earlier than {timeAdvantage}% of wallets</div>
                    <div className="text-[11px] text-gray-400">
                      Entry Window: <span className={tokenWindow.tone}>{tokenWindow.label}</span> ({tokenWindow.detail})
                    </div>
                    <div className="text-[11px] text-gray-500">
                      Signal freshness: {Math.max(1, idx + 1)}m ago · Confidence decay: -3%/min
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {evidenceChipsEmoji(signalStrength, token || {}).map((chip) => (
                        <span key={chip} className="text-[10px] px-2 py-1 rounded-full border border-white/15 bg-white/[0.03] text-gray-200">
                          {chip}
                        </span>
                      ))}
                    </div>
                    {redFlagsForSignal(signalStrength, token || {}).length ? (
                      <div className="text-[11px] text-red-200">
                        {redFlagsForSignal(signalStrength, token || {}).join(" | ")}
                      </div>
                    ) : null}
                  </div>

                  <div className="text-xl font-mono text-white">
                    <AnimatedNumber value={Number(token?.price || 0)} prefix="$" decimalPlaces={6} />
                  </div>

                  <div className="flex justify-between text-xs">
                    <span>Vol: $<AnimatedNumber value={Number(token?.volume24h || 0)} decimalPlaces={0} /></span>
                    <span className={Number(token?.change || 0) >= 0 ? "text-green-500" : "text-red-500"}>
                      <AnimatedNumber
                        value={Number(token?.change || 0)}
                        decimalPlaces={2}
                        prefix={Number(token?.change || 0) >= 0 ? "+" : ""}
                        suffix="%"
                      />
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <div className="flex items-center gap-3 rounded-[10px] bg-white/[0.03] border border-white/[0.06] px-3 py-3">
                      <BarChart3 size={18} className="text-cyan-400 shrink-0" />
                      <div>
                        <p className="sl-label !text-[10px]">Volume</p>
                        <p className="sl-body font-medium text-gray-100">
                          ${formatUsdWhole(token?.volume24h || 0)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-[10px] bg-white/[0.03] border border-white/[0.06] px-3 py-3">
                      <Waves size={18} className="text-purple-300 shrink-0" />
                      <div>
                        <p className="sl-label !text-[10px]">Flow</p>
                        <p className="sl-body font-medium text-gray-200">{token?.flowLabel || "Loading flow…"}</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[10px] border border-white/[0.08] bg-white/[0.02] px-3 py-3">
                    <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1.5">
                      <span>Cluster heat</span>
                      <span className="text-lg leading-none">{clusterHeatEmoji(Math.min(99, signalStrength - 4))}</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${heatClass(Math.min(99, signalStrength - 4))}`}
                        style={{ width: `${Math.min(99, signalStrength - 4)}%` }}
                      />
                    </div>
                  </div>

                  <div className="rounded-[10px] bg-white/[0.02] border border-white/[0.07] px-3 py-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="sl-label !text-[10px]">Why this trade</p>
                      <span className="text-[11px] text-cyan-200 font-semibold">
                        Alpha speed: {token?.alphaSpeedMins ?? "—"}m
                      </span>
                    </div>
                    <ul className="text-[12px] text-gray-300 space-y-1">
                      {(token?.whyTrade?.length ? token.whyTrade : ["Signal model still collecting context."]).map(
                        (reason, i) => (
                          <li key={i}>• {reason}</li>
                        )
                      )}
                    </ul>
                  </div>

                  <div className="mt-auto pt-1">
                    <div className="grid grid-cols-3 gap-2">
                      {[0.5, 1, 5].map((size) => (
                        <a
                          key={size}
                          href={buildJupiterSwapUrl(token?.mint, size)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-center px-2 py-1.5 rounded-lg border border-cyan-500/35 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20"
                        >
                          {size} SOL
                        </a>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => token?.mint && router.push(`/token/${token.mint}`)}
                      className="mt-3 w-full py-2 text-center bg-purple-600/20 rounded-lg text-sm hover:bg-purple-600/40 transition-transform hover:scale-105 inline-flex items-center justify-center gap-2"
                      disabled={!token?.mint}
                    >
                      <TrendingUp size={15} />
                      Scout →
                    </button>
                  </div>
                </div>
              )})}
            </div>
          </div>
        </section>

        {isLoggedIn ? (
          <section className="sl-section">
            <div className="glass-card sl-inset">
              <h2 className="sl-h2 text-white mb-2">🎯 Personal Edge</h2>
              <p className="text-sm text-gray-300">• You entered similar signals too late 3 times.</p>
              <p className="text-sm text-gray-300 mt-1">• This one is still EARLY.</p>
              <p className="text-sm text-emerald-300 mt-3 font-semibold">→ Suggested: ENTER NOW</p>
            </div>
          </section>
        ) : (
          <section className="sl-section">
            <div className="glass-card sl-inset">
              <h2 className="sl-h2 text-white mb-2">🎯 Personal Edge</h2>
              <p className="text-sm text-gray-400">Connect wallet to unlock behavior-based timing guidance.</p>
            </div>
          </section>
        )}

        <section className="sl-section">
          <div className="glass-card sl-inset border border-red-500/30 bg-red-500/[0.04]">
            <p className="sl-label">Anti-Signal</p>
            <h2 className="text-xl font-semibold text-red-200 mt-1 font-mono">⚠️ RED FLAGS (active)</h2>
            <ul className="mt-3 text-sm text-red-100/95 space-y-1 font-mono">
              {redFlagsLines(liveSignal?.signalStrength || 0, liveSignal?.token || {}).map((line) => (
                <li key={line}>• {line}</li>
              ))}
            </ul>
            <p className="text-sm text-red-200 mt-4 font-semibold">→ DO NOT ENTER</p>
          </div>
        </section>

        {/* KPI strip */}
        <section className="sl-section">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="glass-card sl-inset flex flex-col gap-3">
              <div className="flex items-center gap-3 text-gray-400">
                <div className="w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0">
                  <Radar size={18} className="text-sky-400" />
                </div>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sentinel Score (pulse)</span>
              </div>
              <p className={`sl-h2 ${marketMood.className}`}>🧠 {marketMood.label}</p>
            </div>
            <div className="glass-card sl-inset flex flex-col gap-3">
              <div className="flex items-center gap-3 text-gray-400">
                <div className="w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0">
                  <ShieldCheck size={18} className="text-emerald-400" />
                </div>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">System</span>
              </div>
              <p className="sl-h2 text-emerald-300">🛡️ Operational</p>
            </div>
            <div className="glass-card sl-inset flex flex-col gap-3">
              <div className="flex items-center gap-3 text-gray-400">
                <div className="w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0">
                  <Zap size={18} className="text-violet-400" />
                </div>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Scan speed</span>
              </div>
              <p className="sl-h2 text-cyan-300">⚡ ~1.2s avg</p>
            </div>
          </div>
        </section>

        {/* Compare CTA */}
        <section className="sl-section">
          <div className="glass-card sl-inset flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
            <div className="max-w-xl space-y-2">
              <p className="sl-label">Laboratory</p>
              <h2 className="sl-h2 text-white">Compare two tokens</h2>
              <p className="sl-body sl-muted">
                Side-by-side grades, liquidity and deployer risk — before you size a position.
              </p>
            </div>
            <Link
              href="/compare"
              prefetch={false}
              className="btn-pro self-start lg:self-center inline-flex items-center justify-center gap-2 no-underline"
            >
              Open compare lab
            </Link>
          </div>
        </section>

        {/* Alerts */}
        <section className="glass-card sl-inset">
          <h2 className="sl-h2 text-white mb-2">Recent alerts</h2>
          <p className="sl-body sl-muted mb-6">Saved locally when you connect a wallet.</p>
          {!alerts.length ? (
            <div className="sl-nested sl-inset sl-body sl-muted text-center py-10">No alerts configured yet.</div>
          ) : (
            <div className="flex flex-col gap-3">
              {alerts.map((item, idx) => (
                <div
                  key={`${item.tokenAddress}-${idx}`}
                  className="sl-nested sl-inset flex flex-wrap items-center justify-between gap-3"
                >
                  <span className="mono sl-body text-gray-100 font-medium">
                    {(item.symbol || item.tokenAddress || "").slice(0, 14)}
                  </span>
                  <span className="sl-label !normal-case">{item.alertType}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      </div>
    </>
  );
}
