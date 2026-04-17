import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  BarChart3,
  Flame,
  Loader2,
  Radar,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Waves,
  Zap
} from "lucide-react";
import { formatUsdWhole } from "../lib/formatStable";
import { ProButton } from "../components/ui/ProButton";
import { useTrendingTokens } from "../hooks/useTrendingTokens";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { Ticker } from "../components/layout/Ticker";
import { AnimatedNumber } from "../components/ui/AnimatedNumber";

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

function gradeClass(grade) {
  if (grade === "A+" || grade === "A") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/25";
  if (grade === "B" || grade === "C") return "bg-amber-500/15 text-amber-200 border-amber-500/25";
  return "bg-red-500/15 text-red-300 border-red-500/25";
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
  const [visibleTrending, setVisibleTrending] = useState(
    Array.isArray(initialTrending) && initialTrending.length ? initialTrending : []
  );
  const debounceTimerRef = useRef(null);
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
  const smartMoneyCandidates = useMemo(
    () => visibleTrending.filter((t) => Number(t?.liquidity || 0) >= 50000 && Number(t?.change || 0) > 0),
    [visibleTrending]
  );
  const smartMoneyLead = smartMoneyCandidates
    .slice()
    .sort((a, b) => Number(b?.change || 0) - Number(a?.change || 0))[0];

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = JSON.parse(localStorage.getItem("sentinel-alerts") || "[]");
      setAlerts(saved.slice(-5).reverse());
      const recents = JSON.parse(localStorage.getItem("sentinel-recents") || "[]");
      setRecentSearches(recents.slice(0, 5));
    } catch (_) {
      setAlerts([]);
      setRecentSearches([]);
    }
  }, []);
  useEffect(() => {
    updateVisibleTrending(trending);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [trending, updateVisibleTrending]);

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
    <div className="min-h-screen w-full max-w-[100vw] overflow-x-clip">
      <div className="sl-container py-8 sm:py-10 md:py-14 max-w-full mx-4 sm:mx-auto">
        <Ticker />
        {/* Hero */}
        <section translate="no" className="sl-section glass-card glass-card-hover sl-inset">
          <div className="text-center max-w-2xl mx-auto mb-8 sm:mb-10">
            <p className="sl-label mb-3 inline-flex items-center gap-2 justify-center">
              <Sparkles size={14} className="text-purple-400" />
              Solana intelligence
            </p>
            <h1 className="sl-display bg-gradient-to-r from-purple-400 via-violet-300 to-cyan-300 bg-clip-text text-transparent mb-4">
              Sentinel Ledger
            </h1>
            <p className="sl-body sl-muted max-w-lg mx-auto">
              Scout tokens like a pro desk: grades, flow, deployers and risk — in one layout built for decisions.
            </p>
          </div>

          <form onSubmit={handleSearch} className="w-full max-w-2xl mx-auto">
            <p className="sl-label mb-2 text-left">Token mint</p>
            <div className="relative flex flex-col sm:flex-row gap-3">
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Solana mint address (32–44 chars)…"
                className="sl-input h-14 sm:flex-1 sm:min-w-0 pr-4"
              />
              <ProButton type="submit" className="h-14 sm:h-auto sm:px-8 shrink-0 justify-center" disabled={isScanning}>
                {isScanning ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin" />
                    Scanning…
                  </span>
                ) : (
                  "Scan for New Gems"
                )}
              </ProButton>
            </div>
            {error ? <p className="text-red-400 sl-body mt-3 text-center">{error}</p> : null}
            {isScanning ? (
              <div className="mt-4 rounded-xl border border-purple-500/25 bg-purple-500/10 px-4 py-3">
                <p className="text-xs text-purple-200 font-semibold uppercase tracking-wide">Sentinel scan in progress</p>
                <p className="text-sm text-gray-300 mt-1">Validating market, flow, and risk signals…</p>
              </div>
            ) : null}
            {!!recentSearches.length && (
              <div className="mt-6">
                <p className="sl-label mb-3 text-left">Recent</p>
                <div className="flex flex-wrap gap-2">
                  {recentSearches.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => router.push(`/token/${item}`)}
                      className="mono text-xs px-3 py-2 rounded-[10px] bg-white/[0.04] border border-white/[0.08] text-gray-300 hover:text-white hover:border-purple-500/35 transition"
                    >
                      {item.slice(0, 6)}…{item.slice(-4)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </form>
        </section>

        {/* Trending */}
        <section className="sl-section">
          <div className="glass-card sl-inset">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500/25 to-amber-600/15 border border-orange-500/25 flex items-center justify-center shrink-0">
                  <Flame className="text-orange-300" size={22} />
                </div>
                <div>
                  <p className="sl-label">Sentinel Trading · Alpha Feed</p>
                  <h2 className="sl-h2 text-white mt-0.5">Curated opportunities</h2>
                  <p className="sl-body sl-muted mt-2 max-w-xl">
                    Not a random list — each setup includes clear reasons, speed, and risk context.
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
              {(visibleTrending.length ? visibleTrending : Array.from({ length: 6 })).map((token, idx) => (
                <div
                  key={token?.mint || `skeleton-${idx}`}
                  translate="no"
                  className={`glass-card p-4 rounded-2xl flex flex-col gap-4 transition-transform duration-200 ${
                    token?.mint ? "hover:scale-[1.02]" : "opacity-75 animate-pulse"
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
                    <button
                      type="button"
                      onClick={() => token?.mint && router.push(`/token/${token.mint}`)}
                      className="mt-3 w-full py-2 text-center bg-purple-600/20 rounded-lg text-sm hover:bg-purple-600/40 transition-transform hover:scale-105 inline-flex items-center justify-center gap-2"
                      disabled={!token?.mint}
                    >
                      <TrendingUp size={15} />
                      Analyze →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Smart Money CTA */}
        <section className="sl-section">
          <div className="glass-card sl-inset flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <p className="sl-label">Smart Money</p>
              <h2 className="sl-h2 text-white">Follow flow before everyone else</h2>
              <p className="sl-body sl-muted">
                {smartMoneyCandidates.length} setups now show positive momentum with at least $50k liquidity.
              </p>
            </div>
            <div className="flex flex-col items-start lg:items-end gap-3">
              <span className="text-[12px] font-semibold text-cyan-200 bg-cyan-500/10 border border-cyan-500/25 rounded-full px-3 py-1">
                Top setup: {smartMoneyLead?.symbol || "loading"}
              </span>
              <Link
                href={smartMoneyLead?.mint ? `/token/${smartMoneyLead.mint}#flow` : "/compare"}
                prefetch={false}
                className="btn-pro inline-flex items-center justify-center gap-2 no-underline"
              >
                View Smart Money Flow
              </Link>
            </div>
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
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Market pulse</span>
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
  );
}
