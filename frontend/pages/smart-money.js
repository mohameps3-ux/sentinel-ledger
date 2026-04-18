import { useMemo } from "react";
import { useTrendingTokens } from "../hooks/useTrendingTokens";
import { formatUsdWhole } from "../lib/formatStable";
import { PageHead } from "../components/seo/PageHead";

function walletDecision(score) {
  if (score >= 88) return { label: "FOLLOW", tone: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10" };
  if (score >= 74) return { label: "MONITOR", tone: "text-amber-300 border-amber-500/30 bg-amber-500/10" };
  return { label: "IGNORE", tone: "text-red-300 border-red-500/30 bg-red-500/10" };
}

const MOCK_WALLETS = [
  { wallet: "🐳 Whale 7xKX...31Pq", winRate: 92, early: 89, cluster: 86, consistency: 88, pnl30d: 41220, tip: "Made +$12k on $WIF" },
  { wallet: "🧠 Smart 3QfY...8nNp", winRate: 87, early: 82, cluster: 79, consistency: 84, pnl30d: 25890, tip: "Caught BONK before breakout" },
  { wallet: "🤖 Bot n91D...2vKj", winRate: 81, early: 78, cluster: 75, consistency: 79, pnl30d: 18400, tip: "Fast scalps on momentum" },
  { wallet: "🔥 Cluster 5mLp...7Za1", winRate: 76, early: 69, cluster: 81, consistency: 70, pnl30d: 11120, tip: "Strong in coordinated entries" }
];

export default function SmartMoneyPage() {
  const trending = useTrendingTokens();
  const ranked = useMemo(() => {
    const base = MOCK_WALLETS.map((w) => {
      const score = Math.round(w.winRate * 0.35 + w.early * 0.25 + w.cluster * 0.2 + w.consistency * 0.2);
      return { ...w, score, decision: walletDecision(score) };
    });
    return base.sort((a, b) => b.score - a.score);
  }, []);

  return (
    <>
      <PageHead
        title="Smart Money Wallets — Sentinel Ledger"
        description="The most profitable Solana wallets ranked by win rate, 30d PnL, and entry speed."
      />
    <div className="sl-container py-10 space-y-6">
      <section className="glass-card sl-inset">
        <p className="sl-label">Smart Money</p>
        <h1 className="sl-h2 text-white mt-1">Top smart wallets</h1>
        <p className="sl-body sl-muted mt-2">
          High-density ranking with decision labels. Hover each wallet for proof context.
        </p>
        <p className="text-xs text-gray-500 mt-3">
          Live market feed status: {trending.isError ? "degraded" : "connected"}
        </p>
      </section>

      <section className="glass-card sl-inset overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-white/10">
              <th className="py-2 pr-3">Wallet</th>
              <th className="py-2 pr-3">Win Rate</th>
              <th className="py-2 pr-3">Early Entry</th>
              <th className="py-2 pr-3">Cluster</th>
              <th className="py-2 pr-3">Consistency</th>
              <th className="py-2 pr-3">Decision</th>
              <th className="py-2">30d PnL</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((w) => (
              <tr key={w.wallet} className="border-b border-white/5 group">
                <td className="py-3 pr-3 relative">
                  <span className="text-gray-100">{w.wallet}</span>
                  <span className="hidden group-hover:block absolute top-full left-0 mt-1 bg-[#12161b] border border-white/15 rounded px-2 py-1 text-xs text-gray-200 whitespace-nowrap z-20">
                    {w.tip}
                  </span>
                </td>
                <td className="py-3 pr-3">{w.winRate}%</td>
                <td className="py-3 pr-3">{w.early}</td>
                <td className="py-3 pr-3">{w.cluster}</td>
                <td className="py-3 pr-3">{w.consistency}</td>
                <td className="py-3 pr-3">
                  <span className={`text-xs px-2 py-1 rounded border ${w.decision.tone}`}>{w.decision.label}</span>
                </td>
                <td className="py-3 text-emerald-300">+${formatUsdWhole(w.pnl30d)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
    </>
  );
}
