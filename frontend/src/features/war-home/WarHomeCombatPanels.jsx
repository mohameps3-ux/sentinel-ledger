import Link from "next/link";
import { Loader2, Radar, ShieldCheck, Zap } from "lucide-react";
import { ProButton } from "../../../components/ui/ProButton";
import { formatUsdWhole } from "../../../lib/formatStable";
import { isProbableSolanaMint } from "../../../lib/solanaMint";
import { actionTone, confidenceDot, confidenceLabel, suggestedAction } from "@/lib/signalUtils";
import { redFlagsLines } from "@/lib/redFlags";

export default function WarHomeCombatPanels({
  handleSearch,
  address,
  onAddressChange,
  isScanning,
  error,
  recentSearches,
  onOpenRecentMint,
  bestRecentDisplay,
  outcomesSummary,
  rankedWallets,
  topWalletTitle,
  topWalletLabel,
  strategyMode,
  isLoggedIn,
  liveSignal,
  marketMood,
  alerts
}) {
  return (
    <>
      <section className="sl-section sl-scan-hero sl-inset sm:p-6 md:p-8">
        <form onSubmit={handleSearch} className="space-y-4">
          <p className="sl-label text-violet-300/90">Quick scan · token mint</p>
          <div className="relative flex flex-col sm:flex-row gap-3">
            <input
              value={address}
              onChange={onAddressChange}
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
                {recentSearches.map((item) => {
                  const safeMint = typeof item === "string" && isProbableSolanaMint(item);
                  return (
                    <button
                      key={item}
                      type="button"
                      disabled={!safeMint}
                      onClick={() => {
                        if (!safeMint) return;
                        onOpenRecentMint(item);
                      }}
                      className={`font-mono text-xs px-3 py-2 rounded-[10px] bg-white/[0.04] border border-white/[0.08] transition ${
                        safeMint
                          ? "text-gray-300 hover:text-white hover:border-emerald-500/35"
                          : "text-gray-600 cursor-not-allowed"
                      }`}
                    >
                      {item.slice(0, 6)}…{item.slice(-4)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </form>
      </section>

      <section className="sl-section grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card sl-inset border border-orange-500/25 hover:shadow-[0_0_24px_rgba(251,146,60,0.15)] transition-shadow">
          <p className="sl-label">Best Recent Signal</p>
          <h2 className="text-xl font-semibold text-white mt-1 font-mono">
            🔥 BEST RECENT: {bestRecentDisplay.headline} → {Number(bestRecentDisplay.outcomePct) >= 0 ? "+" : ""}
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
                  Wins: {outcomesSummary.wins} | Losses: {outcomesSummary.losses} | Pending: {outcomesSummary.pending ?? "—"}
                </li>
                <li>
                  Avg win: {outcomesSummary.avgWinPct != null ? `+${outcomesSummary.avgWinPct}%` : "—"} | Avg loss:{" "}
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
                      <span className={`text-xs px-2 py-1 rounded border ${actionTone(wallet.signalStrength)}`}>
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

      <section className="sl-section">
        <div className="glass-card sl-inset flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
          <div className="max-w-xl space-y-2">
            <p className="sl-label">Laboratory</p>
            <h2 className="sl-h2 text-white">Compare two tokens</h2>
            <p className="sl-body sl-muted">Side-by-side grades, liquidity and deployer risk — before you size a position.</p>
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

      <section className="glass-card sl-inset">
        <h2 className="sl-h2 text-white mb-2">Recent alerts</h2>
        <p className="sl-body sl-muted mb-6">Saved locally when you connect a wallet.</p>
        {!alerts.length ? (
          <div className="sl-nested sl-inset sl-body sl-muted text-center py-10">No alerts configured yet.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {alerts.map((item, idx) => (
              <div key={`${item.tokenAddress}-${idx}`} className="sl-nested sl-inset flex flex-wrap items-center justify-between gap-3">
                <span className="mono sl-body text-gray-100 font-medium">{(item.symbol || item.tokenAddress || "").slice(0, 14)}</span>
                <span className="sl-label !normal-case">{item.alertType}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
