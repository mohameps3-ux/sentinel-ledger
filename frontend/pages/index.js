import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { ArrowUpRight, Flame, Radar, ShieldCheck, Zap } from "lucide-react";
import { formatTokenPrice } from "../lib/formatStable";

const TRENDING_MOCK = [
  { symbol: "BONK", grade: "B", price: 0.000028, change: 12.1 },
  { symbol: "WIF", grade: "A", price: 2.13, change: 8.6 },
  { symbol: "JUP", grade: "A+", price: 1.22, change: 5.3 },
  { symbol: "POPCAT", grade: "C", price: 0.65, change: -3.1 }
];

function gradeClass(grade) {
  if (grade === "A+" || grade === "A") return "bg-emerald-500/15 text-emerald-300";
  if (grade === "B" || grade === "C") return "bg-amber-500/15 text-amber-300";
  return "bg-red-500/15 text-red-300";
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
    setError("Introduce una dirección de token válida");
  };

  return (
    <div className="min-h-screen px-4">
      <div className="max-w-[1280px] mx-auto pt-8 pb-10 space-y-8">
        <section className="glass-card glass-card-hover p-8">
          <div className="text-center mb-8">
            <h1 className="text-5xl md:text-6xl font-black bg-gradient-to-r from-purple-500 to-blue-500 bg-clip-text text-transparent mb-4">
              SENTINEL LEDGER
            </h1>
            <p className="text-gray-400 text-lg">Real-time on-chain intelligence for Solana traders.</p>
          </div>

          <form onSubmit={handleSearch} className="w-full max-w-3xl mx-auto relative">
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Paste Solana token mint address..."
              className="w-full bg-[#0E1318] border soft-divider rounded-xl h-14 px-5 pr-32 text-base focus:outline-none focus:border-purple-600 transition-all text-white"
            />
            <button className="absolute right-2 top-2 bottom-2 px-6 bg-gradient-to-r from-purple-600 to-blue-600 hover:opacity-90 rounded-xl font-bold transition-all">
              SCOUT
            </button>
          </form>
          {error && <p className="text-red-400 text-sm mt-3 text-center">{error}</p>}
          {!!recentSearches.length && (
            <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
              {recentSearches.map((item) => (
                <button
                  key={item}
                  onClick={() => router.push(`/token/${item}`)}
                  className="text-xs mono px-2.5 py-1 rounded-full bg-white/5 border soft-divider text-gray-300 hover:text-white hover:border-purple-500/40 transition"
                >
                  {item.slice(0, 6)}...{item.slice(-4)}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="glass-card p-5 md:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Flame className="text-orange-400" size={18} />
            <h2 className="text-lg font-semibold">Trending Tokens</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {TRENDING_MOCK.map((token) => (
              <div
                key={token.symbol}
                className="bg-[#0E1318] border soft-divider rounded-xl px-4 py-3 flex items-center justify-between"
              >
                <div>
                  <div className="font-semibold">{token.symbol}</div>
                  <div className="text-xs text-gray-400 mt-0.5">${formatTokenPrice(token.price)}</div>
                </div>
                <div className="text-right flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded-full font-semibold ${gradeClass(token.grade)}`}>
                    {token.grade}
                  </span>
                  <span className={`text-sm font-semibold ${token.change >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                    {token.change >= 0 ? "+" : ""}
                    {token.change}%
                  </span>
                  <ArrowUpRight size={14} className={token.change < 0 ? "rotate-90 text-red-300" : "text-emerald-300"} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid md:grid-cols-3 gap-4">
          <div className="glass-card p-4">
            <div className="text-xs text-gray-500 mb-2 inline-flex items-center gap-2"><Radar size={13} /> Market mood</div>
            <div className={`text-xl font-semibold ${marketMood.className}`}>{marketMood.label}</div>
          </div>
          <div className="glass-card p-4">
            <div className="text-xs text-gray-500 mb-2 inline-flex items-center gap-2"><ShieldCheck size={13} /> Engine status</div>
            <div className="text-xl font-semibold text-emerald-300">Operational</div>
          </div>
          <div className="glass-card p-4">
            <div className="text-xs text-gray-500 mb-2 inline-flex items-center gap-2"><Zap size={13} /> Scan speed</div>
            <div className="text-xl font-semibold text-blue-300">~1.2s avg</div>
          </div>
        </section>

        <section className="glass-card p-5 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Compare Two Tokens</h2>
              <p className="text-sm text-gray-500">Run side-by-side score differential before entering a position.</p>
            </div>
            <button
              onClick={() => router.push("/compare")}
              className="h-10 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 text-sm font-semibold hover:opacity-90 transition"
            >
              Open Compare Lab
            </button>
          </div>
        </section>

        <section className="glass-card p-5 md:p-6">
          <h2 className="text-lg font-semibold mb-3">Recent Alerts</h2>
          {!alerts.length ? (
            <div className="text-sm text-gray-500">No alerts configured yet.</div>
          ) : (
            <div className="space-y-2">
              {alerts.map((item, idx) => (
                <div key={`${item.tokenAddress}-${idx}`} className="bg-[#0E1318] border soft-divider rounded-xl px-3 py-2 text-sm">
                  <span className="mono text-gray-200">{(item.symbol || item.tokenAddress || "").slice(0, 12)}</span>
                  <span className="text-gray-500"> · {item.alertType}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

