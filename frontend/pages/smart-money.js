import { useMemo } from "react";
import Link from "next/link";
import { useTrendingTokens } from "../hooks/useTrendingTokens";
import { useSmartWalletsLeaderboard } from "../hooks/useSmartWalletsLeaderboard";
import { useWalletLabels } from "../hooks/useWalletLabels";
import { formatUsdWhole, formatDateTime } from "../lib/formatStable";
import { PageHead } from "../components/seo/PageHead";
import { Loader2 } from "lucide-react";

function walletDecision(winRate) {
  const wr = Number(winRate || 0);
  if (wr >= 88) return { label: "FOLLOW", tone: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10" };
  if (wr >= 74) return { label: "MONITOR", tone: "text-amber-300 border-amber-500/30 bg-amber-500/10" };
  return { label: "IGNORE", tone: "text-red-300 border-red-500/30 bg-red-500/10" };
}

export default function SmartMoneyPage() {
  const trending = useTrendingTokens();
  const { data, isLoading, isError, error, refetch } = useSmartWalletsLeaderboard();
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const meta = data?.meta || {};

  const addresses = useMemo(() => rows.map((r) => r.wallet).filter(Boolean), [rows]);
  const { labelFor, titleFor } = useWalletLabels(addresses);

  const ranked = useMemo(() => {
    return rows.map((w) => ({
      ...w,
      decision: walletDecision(w.winRate)
    }));
  }, [rows]);

  return (
    <>
      <PageHead
        title="Smart Money Wallets — Sentinel Ledger"
        description="The most profitable Solana wallets ranked by win rate, 30d PnL, and entry speed."
      />
      <div className="sl-container py-10 space-y-6 pb-24">
        <section className="glass-card sl-inset">
          <p className="sl-label">Smart Money</p>
          <h1 className="sl-h2 text-white mt-1">Top smart wallets</h1>
          <p className="sl-body sl-muted mt-2">
            Live leaderboard from Supabase (<span className="font-mono text-gray-400">{meta.source || "—"}</span>
            {meta.count != null ? ` · ${meta.count} wallets` : ""}). Labels use your{" "}
            <Link href="/results" className="text-cyan-300 hover:underline">
              verified track record
            </Link>{" "}
            pipeline + wallet tiers.
          </p>
          <p className="text-xs text-gray-500 mt-3">
            Trending feed: {trending.isError ? "degraded" : "connected"} ·{" "}
            <button type="button" onClick={() => refetch()} className="text-cyan-400 hover:underline">
              Refresh leaderboard
            </button>
          </p>
        </section>

        {isLoading ? (
          <div className="glass-card sl-inset flex items-center justify-center gap-3 py-16 text-gray-400">
            <Loader2 className="animate-spin" size={22} />
            Loading wallets…
          </div>
        ) : null}

        {isError ? (
          <div className="glass-card sl-inset border border-red-500/30 text-red-200 text-sm py-6 px-4">
            {error?.message || "Could not load leaderboard."}
          </div>
        ) : null}

        {!isLoading && !isError && ranked.length === 0 ? (
          <section className="glass-card sl-inset text-center py-12 space-y-3">
            <p className="text-gray-300">No rows in smart_wallets yet.</p>
            <p className="text-sm text-gray-500 max-w-lg mx-auto">
              Run <code className="text-gray-400">supabase/seed_smart_wallets_demo.sql</code> in the SQL editor, or let
              your worker populate the table — then refresh.
            </p>
            <Link href="/pricing" className="btn-pro inline-flex no-underline mt-2">
              Upgrade for token-level smart money
            </Link>
          </section>
        ) : null}

        {!isLoading && !isError && ranked.length > 0 ? (
          <>
            <section className="glass-card sl-inset overflow-x-auto hidden lg:block">
              <table className="w-full min-w-[920px] text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-white/10">
                    <th className="py-2 pr-3">Wallet</th>
                    <th className="py-2 pr-3">Win rate</th>
                    <th className="py-2 pr-3">Hits</th>
                    <th className="py-2 pr-3">Avg size</th>
                    <th className="py-2 pr-3">Last seen</th>
                    <th className="py-2 pr-3">Decision</th>
                    <th className="py-2">30d PnL</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((w) => (
                    <tr key={w.wallet} className="border-b border-white/5 hover:bg-white/[0.02] group">
                      <td className="py-3 pr-3">
                        <div className="min-w-0">
                          <div className="text-gray-100 font-medium truncate" title={titleFor(w.wallet)}>
                            {labelFor(w.wallet)}
                          </div>
                          <div className="font-mono text-[11px] text-gray-500 truncate">{w.wallet}</div>
                        </div>
                      </td>
                      <td className="py-3 pr-3 text-emerald-300 tabular-nums">{w.winRate.toFixed(1)}%</td>
                      <td className="py-3 pr-3 tabular-nums">{w.recentHits}</td>
                      <td className="py-3 pr-3 tabular-nums">${formatUsdWhole(w.avgPositionSize)}</td>
                      <td className="py-3 pr-3 text-gray-400 text-xs whitespace-nowrap">
                        {w.lastSeen ? formatDateTime(w.lastSeen) : "—"}
                      </td>
                      <td className="py-3 pr-3">
                        <span className={`text-xs px-2 py-1 rounded border ${w.decision.tone}`}>{w.decision.label}</span>
                      </td>
                      <td className="py-3 text-emerald-300 tabular-nums">+${formatUsdWhole(w.pnl30d)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="grid grid-cols-1 gap-3 lg:hidden">
              {ranked.map((w) => (
                <article
                  key={w.wallet}
                  className="glass-card p-4 rounded-2xl border border-white/10 space-y-2 hover:border-emerald-500/25 transition"
                >
                  <div className="flex justify-between gap-2 items-start">
                    <div className="min-w-0">
                      <p className="text-white font-semibold truncate" title={titleFor(w.wallet)}>
                        {labelFor(w.wallet)}
                      </p>
                      <p className="font-mono text-[11px] text-gray-500 truncate">{w.wallet}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded border shrink-0 ${w.decision.tone}`}>{w.decision.label}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-300">
                    <span>Win {w.winRate.toFixed(1)}%</span>
                    <span>Hits {w.recentHits}</span>
                    <span>Avg ${formatUsdWhole(w.avgPositionSize)}</span>
                    <span className="text-gray-500">{w.lastSeen ? formatDateTime(w.lastSeen) : "—"}</span>
                  </div>
                  <p className="text-emerald-300 text-sm font-mono">+${formatUsdWhole(w.pnl30d)} 30d</p>
                </article>
              ))}
            </section>
          </>
        ) : null}
      </div>
    </>
  );
}
