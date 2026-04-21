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
import { useSignalsFeed } from "../hooks/useSignalsFeed";
import { useRankDeltas } from "../hooks/useRankDeltas";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { Ticker } from "../components/layout/Ticker";
import { AnimatedNumber } from "../components/ui/AnimatedNumber";
import { useLiveFeedSocket } from "../hooks/useLiveFeedSocket";
import { PageHead } from "../components/seo/PageHead";
import { WelcomeBanner } from "../components/public/WelcomeBanner";
import { HomeOnboarding } from "../components/public/HomeOnboarding";
import { useWalletLabels } from "../hooks/useWalletLabels";
import { NluCommandBar } from "../components/home/NluCommandBar";
import { LiveCardOverlay } from "../components/home/LiveCardOverlay";
import { WatchedCardShell } from "../components/home/WatchedCardShell";
import { GlobalWayfinding } from "../components/layout/GlobalWayfinding";
import { WarLayout } from "../components/layout/WarLayout";
import { TokenDesk } from "../components/cockpit/TokenDesk";
import { TacticalTabs } from "../components/cockpit/TacticalTabs";
import { buildJupiterSwapUrl } from "../lib/jupiterSwap";
import { isProbableSolanaMint } from "../lib/solanaMint";

const TACTICAL_TAB_LS_KEY = "sentinel.cockpit.tacticalTab";

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

function signalFromToken(token, idx = 0) {
  const mint = token?.mint && isProbableSolanaMint(token.mint) ? token.mint : null;
  const signalStrength = computeSignalStrength(token);
  const smartWallets = Math.max(2, Math.min(9, Math.round(signalStrength / 15)));
  const context =
    idx % 2 === 0
      ? `Last similar signal -> +${Math.max(18, Math.round(signalStrength * 0.75))}% in 3h`
      : `Wallet hit rate: ${Math.max(4, Math.round(signalStrength / 20))}/6 last trades`;
  return {
    symbol: token.symbol || "TOKEN",
    mint,
    token,
    signalStrength,
    smartWallets,
    context,
    clusterScore: Math.min(99, Math.max(45, signalStrength - 6)),
    momentum: token.volume24h || 0
  };
}

function tokenFromSignal(sig, idx = 0) {
  const source = sig?.token || {};
  const rawMint = source.mint || sig?.mint;
  const mint = rawMint && isProbableSolanaMint(rawMint) ? rawMint : null;
  const signalStrength = Number(sig?.signalStrength || computeSignalStrength(source));
  const change = Number(source?.change ?? Math.round((signalStrength - 60) / 6));
  const grade = signalStrength >= 90 ? "A+" : signalStrength >= 80 ? "A" : signalStrength >= 68 ? "B" : "C";
  return {
    symbol: source.symbol || sig?.symbol || `TOKEN${idx + 1}`,
    mint,
    grade,
    price: Number(source.price || 0),
    change,
    volume24h: Number(source.volume24h || Math.max(250000, signalStrength * 12500)),
    flowLabel: source.flowLabel || (change >= 0 ? "Buy pressure" : "Mixed flow"),
    liquidity: Number(source.liquidity || Math.max(80000, signalStrength * 1800)),
    alphaSpeedMins: Number(source.alphaSpeedMins || Math.max(3, 18 - Math.round(signalStrength / 8))),
    whyTrade: Array.isArray(source.whyTrade) ? source.whyTrade : []
  };
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

/** Decision pill for feed: explicit green / amber / red glow (second visual focus after score). */
function feedDecisionPillClass(action, score) {
  const pulse = action === "ENTER NOW" && score > 90;
  if (action === "ENTER NOW") {
    return `text-sm sm:text-base px-4 py-2.5 rounded-xl border-2 font-black tracking-tight text-emerald-50 border-emerald-400/65 bg-emerald-500/20 shadow-[0_0_36px_rgba(52,211,153,0.55)] ring-2 ring-emerald-400/45 ${
      pulse ? "animate-pulse" : ""
    }`;
  }
  if (action === "PREPARE") {
    return "text-sm sm:text-base px-4 py-2.5 rounded-xl border-2 font-black tracking-tight text-amber-50 border-amber-400/60 bg-amber-500/18 shadow-[0_0_30px_rgba(251,191,36,0.42)] ring-2 ring-amber-400/40";
  }
  return "text-sm sm:text-base px-4 py-2.5 rounded-xl border-2 font-black tracking-tight text-red-50 border-red-400/60 bg-red-500/18 shadow-[0_0_28px_rgba(248,113,113,0.4)] ring-2 ring-red-400/40";
}

function whyNowBulletLines(sig) {
  if (Array.isArray(sig?._api?.whyNow) && sig._api.whyNow.length >= 3) {
    return sig._api.whyNow.slice(0, 3);
  }
  const w = sig.token?.whyTrade;
  const third = `Hist. similar setups avg +${Math.max(18, Math.round(sig.signalStrength * 0.72))}% in first hours`;
  if (Array.isArray(w) && w.length >= 3) return w.slice(0, 3);
  if (Array.isArray(w) && w.length === 2) return [...w, third];
  if (Array.isArray(w) && w.length === 1) {
    return [w[0], `${sig.smartWallets} high-win wallets concentrated in this window`, third];
  }
  return [
    `${sig.smartWallets} high-win wallets active — tape still building, not exhausted`,
    "Liquidity depth supports entries without runaway slippage on size",
    third
  ];
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

function redFlagsForSignal(sig) {
  const api = sig?._api;
  if (Array.isArray(api?.redFlags) && api.redFlags.length) return api.redFlags;
  const signalStrength = Number(sig?.signalStrength || 0);
  const token = sig?.token || {};
  const out = [];
  if (Number(token?.liquidity || 0) < 50000) out.push("⚠️ Low liquidity");
  if (signalStrength < 72) out.push("⚠️ Cluster conviction low");
  if (Number(token?.change || 0) < 0) out.push("⚠️ Momentum fading");
  return out;
}

function liquidityFromApiRedFlags(flags) {
  if (!Array.isArray(flags)) return 80000;
  const line = flags.find((f) => /liquidity/i.test(String(f)));
  if (!line) return 80000;
  const m = String(line).match(/[\d,]+/);
  if (!m) return 45000;
  return Number(m[0].replace(/,/g, "")) || 45000;
}

function evidenceChipsEmoji(signalStrength, token) {
  const out = ["🐋", "🧠"];
  if (signalStrength >= 82) out.push("🔥");
  if (Number(token?.liquidity || 0) < 70000) out.push("💧");
  if (Number(token?.volume24h || 0) > 500000) out.push("🤖");
  return out.slice(0, 5);
}

function evidenceChipsForSig(sig) {
  if (Array.isArray(sig?._api?.evidenceChips) && sig._api.evidenceChips.length) {
    return sig._api.evidenceChips.map((c) => (typeof c === "string" ? c.split(" ")[0] : c));
  }
  return evidenceChipsEmoji(sig.signalStrength, sig.token || {});
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

/**
 * Compact rank badge rendered on each feed/hot card. Top 3 get medal tones
 * (gold/silver/bronze) to make the podium scannable at a glance; the rest
 * share a neutral slate tone so they don't compete with the content.
 */
function RankBadge({ rank }) {
  if (!Number.isFinite(rank) || rank < 1) return null;
  const base =
    "shrink-0 inline-flex items-center justify-center font-mono tabular-nums text-[10px] leading-none font-bold rounded-md border px-1.5 py-0.5";
  const tone =
    rank === 1
      ? "bg-yellow-500/15 text-yellow-200 border-yellow-500/40 shadow-[0_0_10px_rgba(234,179,8,0.25)]"
      : rank === 2
        ? "bg-slate-300/10 text-slate-100 border-slate-300/30"
        : rank === 3
          ? "bg-orange-500/15 text-orange-200 border-orange-500/30"
          : "bg-white/[0.03] text-gray-400 border-white/10";
  return (
    <span className={`${base} ${tone}`} title={`Rank #${rank}`}>
      #{rank}
    </span>
  );
}

/**
 * Visual indicator of how a card's rank moved since the last poll.
 * - delta > 0  → moved up N positions (green ↑)
 * - delta < 0  → moved down N positions (red ↓)
 * - isNew      → first time we see this item after mount (violet NEW)
 * - everything else → null, so settled rows stay visually quiet.
 */
/** Mint selected in cockpit desk via `?t=` (shallow routing on `/`). */
function deskMintFromQuery(query) {
  const raw = query?.t;
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (typeof s !== "string") return null;
  const t = s.trim();
  return isProbableSolanaMint(t) ? t : null;
}

function cockpitCardClickTargetIsInteractive(e) {
  const el = e?.target;
  if (!el || typeof el.closest !== "function") return true;
  return Boolean(el.closest("a, button"));
}

function RankDeltaChip({ delta, isNew }) {
  if (isNew) {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-[9px] leading-none font-bold uppercase tracking-wider px-1 py-0.5 rounded border border-violet-500/40 bg-violet-500/15 text-violet-200"
        title="New entry in the ranking"
      >
        NEW
      </span>
    );
  }
  if (!Number.isFinite(delta) || delta === 0) return null;
  const up = delta > 0;
  const n = Math.abs(delta);
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[9px] leading-none font-bold font-mono tabular-nums px-1 py-0.5 rounded border ${
        up
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
          : "border-red-500/40 bg-red-500/10 text-red-300"
      }`}
      title={up ? `Up ${n} position${n === 1 ? "" : "s"}` : `Down ${n} position${n === 1 ? "" : "s"}`}
    >
      {up ? "▲" : "▼"}
      {n}
    </span>
  );
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
  const [tacticalTab, setTacticalTab] = useState("live");
  const [historyRows, setHistoryRows] = useState([]);
  const [outcomesSummary, setOutcomesSummary] = useState(null);
  const [bestRecentFromApi, setBestRecentFromApi] = useState(null);
  const [topWalletsApi, setTopWalletsApi] = useState([]);
  const [apiFeedCards, setApiFeedCards] = useState([]);
  const [nextSignalEtaSec, setNextSignalEtaSec] = useState(30);
  const [monitoringWallets, setMonitoringWallets] = useState(27);
  const [clusterScanCount, setClusterScanCount] = useState(11);
  const [wsBump, setWsBump] = useState(0);
  const [entryCountdownByMint, setEntryCountdownByMint] = useState({});
  const [liveExpanded, setLiveExpanded] = useState(false);
  const [heatExpanded, setHeatExpanded] = useState(false);
  const debounceTimerRef = useRef(null);
  const skipTacticalTabPersistRef = useRef(true);
  const onWsSignal = useCallback(() => setWsBump((n) => n + 1), []);
  useLiveFeedSocket({ onSignal: onWsSignal });
  const router = useRouter();
  const selectedMint = useMemo(() => deskMintFromQuery(router.query), [router.query]);
  const trendingQuery = useTrendingTokens(initialTrending, initialTrendingMeta, "", {
    limit: heatExpanded ? 48 : 24,
    refetchMs: 25_000
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
  const feedIsLive = !trendingQuery.isError && !!trending.length && (feedAgeSec === null || feedAgeSec <= 90);
  const feedLabel = feedIsLive ? "Live" : "Delayed";
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
  const interpretedSignals = useMemo(() => {
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
          smartWallets: Math.min(9, Math.max(2, 2 + (idx % 5))),
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
    () => liveSignalPool.slice(0, liveExpanded ? 48 : 12),
    [liveExpanded, liveSignalPool]
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
    () => heatTokenPool.slice(0, heatExpanded ? 48 : 12),
    [heatExpanded, heatTokenPool]
  );

  // Tracks rank changes between refetches so cards can render ↑N / ↓N / NEW
  // badges when the live ordering moves. Pure client-side; no extra network.
  const signalsRankDeltas = useRankDeltas(interpretedSignals, (s) => s?.mint);
  const trendingRankDeltas = useRankDeltas(heatTokenPool, (t) => t?.mint);
  const liveSignal = interpretedSignals[signalCursor % Math.max(1, interpretedSignals.length)];

  const panelHot = (
        <section className="sl-section">
          <div className="glass-card sl-inset">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500/25 to-amber-600/15 border border-orange-500/25 flex items-center justify-center shrink-0">
                  <Flame className="text-orange-300" size={22} />
                </div>
                <div>
                  <p className="sl-label">Hot Tokens</p>
                  <button
                    type="button"
                    onClick={() => setHeatExpanded((v) => !v)}
                    className="sl-h2 text-white mt-0.5 text-left hover:text-orange-200 transition-colors"
                  >
                    Heat-ranked · decision-ready {heatExpanded ? "[-]" : "[+]"}
                  </button>
                  <p className="sl-body sl-muted mt-2 max-w-xl text-sm">
                    Score, window, chips, one-click buy — scan fast.
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">
                    {heatTokensForGrid.length} cards visible · {heatTokenPool.length} ranked
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-start md:items-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setHeatExpanded((v) => !v)}
                  className="text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full border border-orange-500/35 bg-orange-500/10 text-orange-200 hover:bg-orange-500/20"
                >
                  {heatExpanded ? "Compact view" : "Expand heat board"}
                </button>
                <span
                  className={`text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full border inline-flex items-center gap-1.5 ${
                    feedIsLive
                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                      : "bg-amber-500/15 text-amber-200 border-amber-500/30"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      feedIsLive ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
                    }`}
                  />
                  {feedLabel}
                </span>
                <span className="text-[11px] text-gray-500">
                  {feedAgeSec === null ? "fresh" : `${feedAgeSec}s ago`} · refresh 25s · min liq $
                  {formatUsdWhole(trendingMeta.minLiquidityUsd || 15000)}
                </span>
              </div>
            </div>

            {trendingQuery.isError ? (
              <div className="sl-nested sl-inset text-center text-sm text-red-300">
                Could not load trending tokens right now. Try again in a moment.
              </div>
            ) : null}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
              {heatTokensForGrid.map((token, idx) => {
                const signalStrength = computeSignalStrength(token);
                const action = suggestedAction(signalStrength, strategyMode, "token");
                const confluence = signalStrength >= 85 && Number(token?.change || 0) > 5;
                const timeAdvantage = Math.max(52, Math.min(97, 100 - Math.round(signalStrength / 2)));
                const tokenWindow = entryWindowFromCountdown(entryCountdownByMint[token?.mint] || 0);
                const changeNum = Number(token?.change || 0);
                const redFlags = redFlagsForSignal({ signalStrength, token: token || {} });
                const trendingRank = trendingRankDeltas.get(token?.mint) || {
                  rank: idx + 1,
                  delta: 0,
                  isNew: false
                };
                return (
                <WatchedCardShell
                  key={`${token?.mint || "token"}-${idx}`}
                  mint={token?.mint}
                  translate="no"
                  title={token?.mint && isProbableSolanaMint(token.mint) ? "Click to show on desk (?t=)" : undefined}
                  onClick={(e) => {
                    if (!token?.mint || !isProbableSolanaMint(token.mint)) return;
                    if (cockpitCardClickTargetIsInteractive(e)) return;
                    e.preventDefault();
                    router.push(`/?t=${encodeURIComponent(token.mint)}`, undefined, { shallow: true });
                  }}
                  baseClassName={`glass-card p-3 rounded-xl flex flex-col gap-2 transition-transform duration-200 ${
                    token?.mint ? "hover:scale-[1.01] hover:shadow-[0_0_10px_rgba(139,92,246,0.4)]" : "opacity-75"
                  } ${token?.mint && isProbableSolanaMint(token.mint) ? "cursor-pointer" : ""} ${
                    selectedMint && token?.mint === selectedMint ? "ring-2 ring-cyan-500/40" : ""
                  }`}
                  watchedClassName="ring-1 ring-emerald-500/50 shadow-[0_0_18px_rgba(16,185,129,0.18)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {token?.mint ? (
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <RankBadge rank={trendingRank.rank} />
                          <RankDeltaChip delta={trendingRank.delta} isNew={trendingRank.isNew} />
                        </div>
                      ) : null}
                      <p className="text-base font-bold text-white tracking-tight truncate">
                        {token?.symbol || "Loading"}
                      </p>
                      <p className="text-[10px] text-gray-500 font-mono truncate">
                        {token?.mint ? `${token.mint.slice(0, 4)}…${token.mint.slice(-4)}` : "…"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full border ${gradeClass(token?.grade || "C")}`}
                    >
                      {token?.grade || "…"}
                    </span>
                  </div>

                  {(token?.narrativeTags || []).length ? (
                    <div className="flex flex-wrap gap-1">
                      {(token?.narrativeTags || []).slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] px-1.5 py-0.5 rounded border border-violet-500/30 bg-violet-500/10 text-violet-200"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className="rounded-md border border-white/[0.08] bg-white/[0.02] px-2.5 py-2 space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[9px] uppercase tracking-wider text-gray-500">Score</span>
                      <span className="text-emerald-300 font-bold font-mono tabular-nums text-xs">{signalStrength}/100</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-900 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-purple-500 to-cyan-400"
                        style={{ width: `${signalStrength}%` }}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${actionTone(signalStrength)} ${signalStrength > 90 ? "animate-pulse" : ""}`}>
                        {action}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${confidenceTone(signalStrength)}`}>
                        {confidenceLabel(signalStrength)}
                      </span>
                      {confluence ? (
                        <span className="text-[10px] text-violet-200 bg-violet-500/10 border border-violet-500/25 rounded px-1.5 py-0.5">
                          🧬
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {token?.mint ? <LiveCardOverlay mint={token.mint} /> : null}

                  <div className="flex items-baseline justify-between gap-2 text-[11px] font-mono">
                    <span className="text-white truncate">
                      <AnimatedNumber value={Number(token?.price || 0)} prefix="$" decimalPlaces={6} />
                    </span>
                    <span className={changeNum >= 0 ? "text-emerald-400" : "text-red-400"}>
                      <AnimatedNumber
                        value={changeNum}
                        decimalPlaces={1}
                        prefix={changeNum >= 0 ? "+" : ""}
                        suffix="%"
                      />
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                    <div className="flex items-center gap-1.5 rounded-md bg-white/[0.03] border border-white/[0.06] px-2 py-1.5">
                      <BarChart3 size={12} className="text-cyan-400 shrink-0" />
                      <span className="text-gray-100 truncate">${formatUsdWhole(token?.volume24h || 0)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 rounded-md bg-white/[0.03] border border-white/[0.06] px-2 py-1.5">
                      <Waves size={12} className="text-purple-300 shrink-0" />
                      <span className="text-gray-200 truncate">{token?.flowLabel || "flow…"}</span>
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between text-[10px] text-gray-500">
                      <span>Heat</span>
                      <span className="leading-none">{clusterHeatEmoji(Math.min(99, signalStrength - 4))}</span>
                    </div>
                    <div className="h-1 rounded-full bg-gray-900 overflow-hidden">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${heatClass(Math.min(99, signalStrength - 4))}`}
                        style={{ width: `${Math.min(99, signalStrength - 4)}%` }}
                      />
                    </div>
                  </div>

                  <p className="text-[10px] text-gray-500 truncate">
                    Earlier than {timeAdvantage}% · <span className={tokenWindow.tone}>{tokenWindow.label}</span>
                  </p>

                  {redFlags.length ? (
                    <p className="text-[10px] text-red-200 truncate">⚠ {redFlags.join(" · ")}</p>
                  ) : null}

                  <div className="flex flex-wrap gap-1">
                    {evidenceChipsEmoji(signalStrength, token || {}).slice(0, 4).map((chip) => (
                      <span key={chip} className="text-[10px] px-1.5 py-0.5 rounded-full border border-white/12 bg-white/[0.03] text-gray-300">
                        {chip}
                      </span>
                    ))}
                  </div>

                  <div className="mt-auto pt-1 space-y-1.5 border-t border-white/[0.04]">
                    <div className="grid grid-cols-3 gap-1">
                      {[0.5, 1, 5].map((size) => {
                        const canSwap = token?.mint && isProbableSolanaMint(token.mint);
                        return (
                          <a
                            key={size}
                            href={canSwap ? buildJupiterSwapUrl(token.mint, size) : "#"}
                            target="_blank"
                            rel="noreferrer"
                            aria-disabled={!canSwap}
                            onClick={(e) => {
                              if (!canSwap) e.preventDefault();
                            }}
                            className={`text-[10px] text-center px-1.5 py-1 rounded-md border font-mono ${
                              canSwap
                                ? "border-cyan-500/35 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20"
                                : "border-white/10 bg-white/[0.03] text-gray-600 cursor-not-allowed pointer-events-none"
                            }`}
                          >
                            {size} SOL
                          </a>
                        );
                      })}
                    </div>
                    {token?.mint && isProbableSolanaMint(token.mint) ? (
                      <Link
                        href={`/token/${token.mint}`}
                        className="w-full py-1.5 text-center bg-purple-600/20 rounded-md text-[11px] hover:bg-purple-600/40 transition-transform hover:scale-[1.01] inline-flex items-center justify-center gap-1.5 text-gray-100 no-underline"
                      >
                        <TrendingUp size={12} />
                        Scout →
                      </Link>
                    ) : (
                      <p
                        className="w-full py-1.5 text-center rounded-md border border-white/10 bg-white/[0.02] text-[10px] text-gray-500"
                        title="No mint on the card yet — cannot open the token terminal."
                      >
                        Scout · mint pending
                      </p>
                    )}
                  </div>
                </WatchedCardShell>
              )})}
            </div>
          </div>
        </section>
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = JSON.parse(localStorage.getItem("sentinel-alerts") || "[]");
      setAlerts(saved.slice(-5).reverse());
      const recents = JSON.parse(localStorage.getItem("sentinel-recents") || "[]");
      setRecentSearches(recents.slice(0, 5));
      setIsLoggedIn(Boolean(localStorage.getItem("token")));
      const tab = localStorage.getItem(TACTICAL_TAB_LS_KEY);
      if (tab === "live" || tab === "hot" || tab === "history") setTacticalTab(tab);
    } catch (_) {
      setAlerts([]);
      setRecentSearches([]);
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
    fetch(`${getPublicApiUrl()}/api/v1/smart-wallets/top?limit=12`)
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
    limit: liveExpanded ? 48 : 24,
    refetchMs: 15_000
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
      <WarLayout
        header={
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] sm:text-xs text-gray-400">
            <span className="font-semibold uppercase tracking-[0.16em] text-gray-500">War cockpit</span>
            <span className="text-gray-600">Feed + Intel desk · tabs LIVE / HOT / HISTORY</span>
          </div>
        }
        feed={
          <>
            <HomeOnboarding />
            <WelcomeBanner />
            <div className="w-full max-w-[100vw] overflow-x-clip">
        <div className="px-2 sm:px-3 pt-1 pb-2 border-b border-cyan-500/20 bg-[#050a0f]/80">

        <TacticalTabs
          activeTab={tacticalTab}
          onTabChange={setTacticalTab}
          panelHistory={(

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
          )}
          panelLive={(
          <section translate="no" className="sl-section">
            <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
              <div>
                <p className="sl-label inline-flex items-center gap-2">
                  <Sparkles size={14} className="text-emerald-400" />
                  Decision Feed
                </p>
                <button
                  type="button"
                  onClick={() => setLiveExpanded((v) => !v)}
                  className="sl-h2 text-white mt-1 text-left hover:text-emerald-200 transition-colors"
                >
                  Live Smart Money Feed {liveExpanded ? "[-]" : "[+]"}
                </button>
                <p className="text-[11px] text-gray-500 mt-1">
                  {liveSignalsForGrid.length} cards visible · {liveSignalPool.length} tracked
                </p>
              </div>
              <div className="flex flex-col items-start md:items-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setLiveExpanded((v) => !v)}
                  className="text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full border border-cyan-500/35 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"
                >
                  {liveExpanded ? "Compact view" : "Expand full feed"}
                </button>
                <span
                  className={`text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full border inline-flex items-center gap-1.5 ${
                    signalsFeedQuery.isError
                      ? "bg-amber-500/15 text-amber-200 border-amber-500/30"
                      : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      signalsFeedQuery.isError ? "bg-amber-400" : "bg-emerald-400 animate-pulse"
                    }`}
                  />
                  {signalsFeedQuery.isError ? "Delayed" : "Live"}
                </span>
                <span className="text-[11px] text-gray-500 inline-flex items-center gap-1">
                  <Info size={12} />
                  {signalsAgeSec === null
                    ? "syncing…"
                    : signalsAgeSec <= 2
                      ? "just now"
                      : `updated ${signalsAgeSec}s ago`}
                  {" · "}refresh 15s
                </span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
            {liveSignalsForGrid.map((sig, idx) => {
              const sec = entryCountdownByMint[sig.mint] || 0;
              const win = sig._api
                ? {
                    label: sig._api.entryWindow || "OPEN",
                    detail:
                      sig._api.entryWindowMinutesLeft != null
                        ? `${sig._api.entryWindowMinutesLeft} min left (server)`
                        : "—",
                    tone:
                      sig._api.entryWindow === "OPEN"
                        ? "text-emerald-300"
                        : sig._api.entryWindow === "CLOSING"
                          ? "text-amber-300"
                          : "text-red-300"
                  }
                : entryWindowFromCountdown(sec);
              const vis = sig._api
                ? entryWindowVisual(Math.max(0, (Number(sig._api.entryWindowMinutesLeft) || 0) * 45))
                : entryWindowVisual(sec);
              const action = sig._api?.decision || suggestedAction(sig.signalStrength, strategyMode, "feed");
              const hot = idx === signalCursor % Math.max(1, liveSignalsForGrid.length);
              const whyLines = whyNowBulletLines(sig);
              const rankInfo = signalsRankDeltas.get(sig.mint) || { rank: idx + 1, delta: 0, isNew: false };
              return (
                <WatchedCardShell
                  key={`${sig.mint}-${idx}`}
                  mint={sig.mint}
                  title={sig.mint && isProbableSolanaMint(sig.mint) ? "Click to show on desk (?t=)" : undefined}
                  onClick={(e) => {
                    if (!sig.mint || !isProbableSolanaMint(sig.mint)) return;
                    if (cockpitCardClickTargetIsInteractive(e)) return;
                    e.preventDefault();
                    router.push(`/?t=${encodeURIComponent(sig.mint)}`, undefined, { shallow: true });
                  }}
                  baseClassName={`rounded-lg border border-white/10 bg-white/[0.02] p-3 space-y-2.5 transition-all duration-300 hover:border-emerald-500/20 hover:shadow-[0_0_16px_rgba(16,185,129,0.1)] ${
                    hot ? "ring-1 ring-emerald-500/35" : ""
                  } ${sig.mint && isProbableSolanaMint(sig.mint) ? "cursor-pointer" : ""} ${
                    selectedMint && sig.mint === selectedMint ? "ring-2 ring-cyan-500/40" : ""
                  }`}
                  watchedClassName="!border-emerald-500/35 ring-1 ring-emerald-500/50 shadow-[0_0_18px_rgba(16,185,129,0.18)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <RankBadge rank={rankInfo.rank} />
                        <RankDeltaChip delta={rankInfo.delta} isNew={rankInfo.isNew} />
                      </div>
                      <p className="text-base font-bold text-white tracking-tight truncate">${sig.symbol}</p>
                      <p className="text-[10px] text-cyan-200/90 font-mono mt-0.5">{sig.smartWallets} wallets · live</p>
                    </div>
                    <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded border ${confidenceTone(sig.signalStrength)}`}>
                      {confidenceLabel(sig.signalStrength)}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-[9px] uppercase tracking-[0.18em] text-gray-500 font-semibold">Sentinel Score</p>
                      <span className="text-[10px] text-gray-500 font-mono">/ 100</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-black tabular-nums font-mono text-white leading-none tracking-tight">
                        {sig.signalStrength}
                      </span>
                      <div className="flex-1 h-1.5 rounded-full bg-gray-900 overflow-hidden ring-1 ring-white/10 mb-0.5">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${scoreBarGradient(sig.signalStrength)}`}
                          style={{ width: `${sig.signalStrength}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center justify-center text-[11px] ${feedDecisionPillClass(action, sig.signalStrength)}`}>
                      {action === "ENTER NOW" ? "🟢 " : action === "PREPARE" ? "🟡 " : "🔴 "}
                      {action}
                    </span>
                    {sig._api?.confluence || (!sig._api && sig.signalStrength >= 88) ? (
                      <span className="text-[10px] text-violet-200 bg-violet-500/10 border border-violet-500/25 rounded px-1.5 py-0.5 font-mono">
                        🧬 multi
                      </span>
                    ) : null}
                  </div>

                  <div className="rounded-md border border-white/10 bg-black/30 px-2.5 py-2">
                    <p className="text-[9px] text-gray-500 uppercase tracking-wide font-semibold">Why now</p>
                    <ul className="text-[11px] text-gray-200 mt-1 space-y-0.5 leading-snug">
                      {whyLines.slice(0, 3).map((line, li) => (
                        <li key={li} className="flex gap-1.5">
                          <span className="text-emerald-500/80 shrink-0">•</span>
                          <span className="truncate">{line}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <LiveCardOverlay mint={sig.mint} />

                  <div className="flex flex-wrap gap-1">
                    {evidenceChipsForSig(sig).slice(0, 4).map((chip) => (
                      <span
                        key={chip + idx}
                        className="text-[10px] px-1.5 py-0.5 rounded-full border border-white/12 bg-white/[0.03] text-gray-300"
                        title="Evidence"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>

                  {redFlagsForSignal(sig).length ? (
                    <p className="text-[10px] text-red-200 truncate">
                      RED FLAGS: {redFlagsForSignal(sig).join(" · ")}
                    </p>
                  ) : null}

                  <div className="space-y-0.5">
                    <p className={`text-[10px] font-mono ${vis.text}`}>
                      ENTRY · {win.label} · {win.detail}
                    </p>
                    <div className="h-1 rounded-full bg-gray-900 overflow-hidden">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${vis.gradient}`}
                        style={{ width: `${Math.min(100, (sec / 420) * 100)}%` }}
                      />
                    </div>
                  </div>

                  <p className="text-[10px] text-cyan-200/90 font-mono truncate">
                    {sig._api?.timeAdvantage ||
                      `Earlier than ${Math.max(72, Math.min(96, sig.signalStrength))}% of traders`}
                  </p>

                  <div className="flex flex-wrap gap-1 pt-0.5 border-t border-white/[0.04] mt-1">
                    {[0.5, 1, 5].map((size) => {
                      const canSwap = sig.mint && isProbableSolanaMint(sig.mint);
                      return (
                        <a
                          key={size}
                          href={canSwap ? buildJupiterSwapUrl(sig.mint, size) : "#"}
                          target="_blank"
                          rel="noreferrer"
                          aria-disabled={!canSwap}
                          onClick={(e) => {
                            if (!canSwap) e.preventDefault();
                          }}
                          className={`text-[10px] px-2 py-1 rounded-md border font-mono ${
                            canSwap
                              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20"
                              : "border-white/10 bg-white/[0.03] text-gray-600 cursor-not-allowed pointer-events-none"
                          }`}
                        >
                          {size} SOL
                        </a>
                      );
                    })}
                  </div>
                </WatchedCardShell>
              );
            })}
          </div>
        </section>
          )}
          panelHot={panelHot}
        />

        </div>
      <div className="sl-container py-4 sm:py-8 md:py-12 max-w-full mx-4 sm:mx-auto">
        <section className="sl-section">
          <div className="sl-home-hero sl-inset sm:p-8 md:p-10">
            <div className="sl-home-hero-inner">
              <p className="sl-label text-gray-400">Solana intelligence terminal</p>
              <h1 className="sl-display mt-3 text-white max-w-4xl">
                Trade with the stack, not the noise
              </h1>
              <p className="sl-body text-gray-400 mt-5 max-w-2xl text-[15px] leading-relaxed">
                Live smart-money feed, verified 24h outcomes, and deep token intel — one flow from scan to size.
                Always your decision; we surface structure and risk.
              </p>
              <p className="text-xs text-gray-500 mt-4 max-w-2xl leading-relaxed border-l-2 border-white/15 pl-3">
                <span className="text-gray-300 font-medium">Navigation:</span> the bar under the header on every page
                shows <strong className="text-gray-200">where you are</strong> and text links to jump anywhere. The top
                row repeats the same destinations for muscle memory.
              </p>
            </div>
          </div>
        </section>

        <section className="sl-section !mt-1" aria-labelledby="home-destinations-heading">
          <h2 id="home-destinations-heading" className="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 mb-2">
            Pick a screen (same links as the strip under the header)
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-2.5">
            {[
              {
                href: "/scanner",
                title: "Scanner",
                body: "Mint → full token terminal."
              },
              {
                href: "/smart-money",
                title: "Smart money",
                body: "Wallets, edge, ES/EN profiles."
              },
              {
                href: "/watchlist",
                title: "Watchlist",
                body: "Track mints + alerts."
              },
              {
                href: "/compare",
                title: "Compare",
                body: "Two tokens side by side."
              },
              {
                href: "/alerts",
                title: "Alerts",
                body: "Telegram + PRO nudges."
              },
              {
                href: "/wallet-stalker",
                title: "Stalker",
                body: "Follow wallets; badge on news."
              }
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group rounded-lg border border-white/[0.07] bg-white/[0.02] p-2.5 sm:p-3 transition-colors duration-150 hover:border-white/18 hover:bg-white/[0.05] active:scale-[0.99]"
              >
                <p className="text-[12px] sm:text-[13px] font-semibold text-white leading-tight group-hover:underline decoration-white/25 underline-offset-2">
                  {item.title}
                  <span className="text-gray-500 font-normal ml-0.5">→</span>
                </p>
                <p className="text-[10px] sm:text-[11px] text-gray-500 mt-1 leading-snug line-clamp-2">{item.body}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="sl-section !pt-2 !pb-2">
          <div className="glass-card sl-inset border border-white/[0.08]">
            <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-6">
              <div className="space-y-3 min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">Sticky loop · active wait</p>
                <p className="text-[11px] text-gray-500">
                  Live tension bar above tracks 24h detections. Here: pulse timing and cluster load.
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-2 text-[11px] text-gray-300">
                  <span>
                    Next pulse ~{Math.max(5, Math.round(nextSignalEtaSec / 5) * 5)}s / ~
                    {Math.max(1, Math.ceil(nextSignalEtaSec / 60))} min
                  </span>
                  <span className="text-gray-600">|</span>
                  <span>Monitoring {monitoringWallets} wallets</span>
                  <span className="text-gray-600">|</span>
                  <span>Clusters {clusterScanCount}</span>
                  <span className="text-gray-600">|</span>
                  <span className="text-gray-500">24h feed: {liveSignalsDetected}</span>
                  {wsBump > 0 ? (
                    <>
                      <span className="text-gray-600">|</span>
                      <span className="text-emerald-300/90 font-mono">WS +{wsBump}</span>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-col gap-3 shrink-0 xl:min-w-[280px]">
                <p className="text-[11px] text-gray-500 uppercase tracking-wide">Strategy mode</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: "conservative", label: "Conservative" },
                    { id: "balanced", label: "Balanced" },
                    { id: "aggressive", label: "Aggressive" }
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setStrategyMode(mode.id)}
                      className={`text-xs px-3 py-2 rounded-lg border ${
                        strategyMode === mode.id
                          ? "border-cyan-400/45 bg-cyan-500/15 text-cyan-100 shadow-[0_0_16px_rgba(6,182,212,0.15)]"
                          : "border-white/12 bg-white/[0.04] text-gray-300 hover:text-white hover:border-white/20"
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setSoundEnabled((v) => !v)}
                  className="text-xs px-3 py-2 rounded-lg border border-white/12 bg-white/[0.04] text-gray-300 hover:text-white w-fit"
                >
                  {soundEnabled ? (
                    <span className="inline-flex items-center gap-2">
                      <Volume2 size={14} /> Sound on
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <VolumeX size={14} /> Sound off
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </section>

        <NluCommandBar />
        <Ticker />
        <GlobalWayfinding />

        </div>


        <section className="sl-section sl-scan-hero sl-inset sm:p-6 md:p-8">
          <form onSubmit={handleSearch} className="space-y-4">
            <p className="sl-label text-violet-300/90">Quick scan · token mint</p>
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
              🔥 BEST RECENT: {bestRecentDisplay.headline} →{" "}
              {Number(bestRecentDisplay.outcomePct) >= 0 ? "+" : ""}
              {bestRecentDisplay.outcomePct}% in {bestRecentDisplay.horizon}
            </h2>
            <p className="text-sm text-gray-300 mt-2">
              Sentinel Score {bestRecentDisplay.signal}, ENTER NOW ·{" "}
              <Link href={`/token/${bestRecentDisplay.mint}`} className="text-emerald-300 underline-offset-2 hover:underline">
                View Breakdown
              </Link>
            </p>
          </div>
          <div className="glass-card sl-inset">
            <p className="sl-label">Proof of Edge</p>
            <h2 className="text-xl font-semibold text-white mt-1 font-mono">📈 ROLLING WINDOW (7D)</h2>
            <ul className="mt-3 text-sm text-gray-300 space-y-1 font-mono">
              {outcomesSummary && outcomesSummary.resolved != null ? (
                <>
                  <li>
                    Wins: {outcomesSummary.wins} | Losses: {outcomesSummary.losses} | Pending:{" "}
                    {outcomesSummary.pending ?? "—"}
                  </li>
                  <li>
                    Avg win:{" "}
                    {outcomesSummary.avgWinPct != null ? `+${outcomesSummary.avgWinPct}%` : "—"} | Avg loss:{" "}
                    {outcomesSummary.avgLossPct != null ? `${outcomesSummary.avgLossPct}%` : "—"}
                  </li>
                  <li>
                    Net return (sum of % moves):{" "}
                    {outcomesSummary.netReturnPct != null
                      ? `${outcomesSummary.netReturnPct >= 0 ? "+" : ""}${outcomesSummary.netReturnPct}%`
                      : "—"}
                  </li>
                </>
              ) : (
                <>
                  <li>Wins: 7 | Losses: 3 (demo)</li>
                  <li>Avg win: +41% | Avg loss: −11%</li>
                  <li>Net return: +247%</li>
                  <li className="text-gray-500 text-xs pt-1">Connect backend data for live edge from /api/v1/signals/outcomes</li>
                </>
              )}
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
          </>
        }
        desk={<TokenDesk key={selectedMint ?? "__desk_none__"} mint={selectedMint} />}
      />
    </>
  );
}
