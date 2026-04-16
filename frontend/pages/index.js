import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { ArrowUpRight, Flame } from "lucide-react";

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
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = JSON.parse(localStorage.getItem("sentinel-alerts") || "[]");
      setAlerts(saved.slice(-5).reverse());
    } catch (_) {
      setAlerts([]);
    }
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    const value = address.trim();
    if (value.length >= 32) {
      setError("");
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
                  <div className="text-xs text-gray-400 mt-0.5">${token.price.toLocaleString()}</div>
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

