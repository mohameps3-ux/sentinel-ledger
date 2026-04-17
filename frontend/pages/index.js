import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  ArrowUpRight,
  BarChart3,
  Flame,
  Radar,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Waves,
  Zap
} from "lucide-react";
import { formatTokenPrice } from "../lib/formatStable";
import { ProButton } from "../components/ui/ProButton";

const TRENDING_MOCK = [
  {
    symbol: "BONK",
    mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    grade: "B",
    price: 0.000028,
    change: 12.1,
    volLabel: "$2.1M",
    flowLabel: "Buy pressure ↑"
  },
  {
    symbol: "WIF",
    mint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
    grade: "A",
    price: 2.13,
    change: 8.6,
    volLabel: "$48M",
    flowLabel: "Smart inflow $1.2M"
  },
  {
    symbol: "JUP",
    mint: "JUPyiwrYJFksjQVdKWvHJHGzS76nqbwsjZBM74fATFc",
    grade: "A+",
    price: 1.22,
    change: 5.3,
    volLabel: "$31M",
    flowLabel: "Liquidity deep"
  },
  {
    symbol: "POPCAT",
    mint: "7GCihgDB8fe6KNjn2MYtkzZcRjXd3ngw7tF5RbwimQyg",
    grade: "C",
    price: 0.65,
    change: -3.1,
    volLabel: "$890K",
    flowLabel: "Mixed flow"
  }
];

function gradeClass(grade) {
  if (grade === "A+" || grade === "A") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/25";
  if (grade === "B" || grade === "C") return "bg-amber-500/15 text-amber-200 border-amber-500/25";
  return "bg-red-500/15 text-red-300 border-red-500/25";
}

export default function Home() {
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [alerts, setAlerts] = useState([]);
  const [recentSearches, setRecentSearches] = useState([]);
  const router = useRouter();

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

  const marketMood = useMemo(() => {
    const avg = TRENDING_MOCK.reduce((acc, t) => acc + t.change, 0) / TRENDING_MOCK.length;
    if (avg > 5) return { label: "Bullish", className: "text-emerald-300" };
    if (avg > 0) return { label: "Neutral+", className: "text-amber-300" };
    return { label: "Risk-off", className: "text-red-300" };
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    const value = address.trim();
    if (value.length >= 32) {
      setError("");
      try {
        const recents = JSON.parse(localStorage.getItem("sentinel-recents") || "[]");
        const next = [value, ...recents.filter((item) => item !== value)].slice(0, 5);
        localStorage.setItem("sentinel-recents", JSON.stringify(next));
      } catch (_) {}
      router.push(`/token/${value}`);
      return;
    }
    setError("Paste a valid Solana mint (32–44 characters).");
  };

  return (
    <div className="min-h-screen w-full max-w-[100vw] overflow-x-clip">
      <div className="sl-container py-8 sm:py-10 md:py-14 max-w-full">
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
              <ProButton type="submit" className="h-14 sm:h-auto sm:px-8 shrink-0 justify-center">
                Scout token
              </ProButton>
            </div>
            {error ? <p className="text-red-400 sl-body mt-3 text-center">{error}</p> : null}
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
                  <p className="sl-label">Pulse</p>
                  <h2 className="sl-h2 text-white mt-0.5">Trending tokens</h2>
                  <p className="sl-body sl-muted mt-2 max-w-xl">
                    Snapshot rows — tap analyze to open the full desk for that mint.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2">
              {TRENDING_MOCK.map((token) => (
                <Link
                  key={token.symbol}
                  href={`/token/${token.mint}`}
                  prefetch={false}
                  translate="no"
                  className="sl-nested rounded-[14px] border border-[#2a2f36] bg-[#0e1318]/90 p-5 sm:p-6 flex flex-col gap-5 min-h-0 text-left no-underline text-inherit hover:border-purple-500/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-500/40 transition"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="sl-label">Symbol</p>
                      <p className="text-xl sm:text-2xl md:text-[28px] font-bold text-white mt-1 tracking-tight">
                        {token.symbol}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-full border ${gradeClass(token.grade)}`}
                    >
                      {token.grade}
                    </span>
                  </div>

                  <div className="sl-divider" />

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="sl-label mb-1">Price</p>
                      <p className="text-lg font-semibold text-white tracking-tight">
                        ${formatTokenPrice(token.price)}
                      </p>
                    </div>
                    <div>
                      <p className="sl-label mb-1">24h</p>
                      <p
                        className={`text-lg font-semibold inline-flex items-center gap-1 ${
                          token.change >= 0 ? "text-emerald-300" : "text-red-300"
                        }`}
                      >
                        <ArrowUpRight
                          size={18}
                          className={token.change < 0 ? "rotate-90" : ""}
                        />
                        {token.change >= 0 ? "+" : ""}
                        {token.change}%
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex items-center gap-3 rounded-[10px] bg-white/[0.03] border border-white/[0.06] px-3 py-3">
                      <BarChart3 size={18} className="text-cyan-400 shrink-0" />
                      <div>
                        <p className="sl-label !text-[10px]">Volume</p>
                        <p className="sl-body font-medium text-gray-100">{token.volLabel}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-[10px] bg-white/[0.03] border border-white/[0.06] px-3 py-3">
                      <Waves size={18} className="text-purple-300 shrink-0" />
                      <div>
                        <p className="sl-label !text-[10px]">Flow</p>
                        <p className="sl-body font-medium text-gray-200">{token.flowLabel}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-auto pt-1">
                    <span className="btn-pro w-full sm:w-auto justify-center inline-flex items-center gap-2">
                      <TrendingUp size={16} />
                      Analyze
                    </span>
                  </div>
                </Link>
              ))}
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
