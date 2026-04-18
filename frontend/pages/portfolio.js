import Link from "next/link";
import { useClientAuthToken } from "../hooks/useClientAuthToken";
import { formatUsdWhole } from "../lib/formatStable";

const MOCK_POSITIONS = [
  { symbol: "WIF", sizeUsd: 1320, pnl: 11.2, score: 90 },
  { symbol: "BONK", sizeUsd: 740, pnl: -3.6, score: 72 },
  { symbol: "JUP", sizeUsd: 980, pnl: 6.4, score: 84 }
];

export default function PortfolioPage() {
  const token = useClientAuthToken();

  if (!token) {
    return (
      <div className="sl-container py-10">
        <section className="glass-card sl-inset max-w-2xl mx-auto text-center">
          <p className="sl-label">Portfolio</p>
          <h1 className="sl-h2 text-white mt-1">Connect wallet to unlock portfolio</h1>
          <p className="text-sm text-gray-400 mt-3">
            Your portfolio view requires a signed wallet session.
          </p>
          <Link href="/" className="btn-pro inline-flex mt-5 no-underline">Go to dashboard</Link>
        </section>
      </div>
    );
  }

  return (
    <div className="sl-container py-10 space-y-6">
      <section className="glass-card sl-inset">
        <p className="sl-label">Portfolio</p>
        <h1 className="sl-h2 text-white mt-1">Personal edge tracker</h1>
        <p className="text-sm text-gray-400 mt-2">Mock positions (replace with on-chain positions in next iteration).</p>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {MOCK_POSITIONS.map((p) => (
          <article key={p.symbol} className="glass-card p-4 rounded-2xl border border-white/10 hover:border-purple-500/40 transition">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">${p.symbol}</h2>
              <span className={`text-xs px-2 py-1 rounded border ${p.score >= 85 ? "text-emerald-300 border-emerald-500/30 bg-emerald-500/10" : p.score >= 70 ? "text-amber-300 border-amber-500/30 bg-amber-500/10" : "text-red-300 border-red-500/30 bg-red-500/10"}`}>
                Score {p.score}
              </span>
            </div>
            <p className="text-sm text-gray-400 mt-3">Size: ${formatUsdWhole(p.sizeUsd)}</p>
            <p className={`text-sm mt-1 ${p.pnl >= 0 ? "text-emerald-300" : "text-red-300"}`}>PnL: {p.pnl >= 0 ? "+" : ""}{p.pnl}%</p>
          </article>
        ))}
      </section>
    </div>
  );
}
