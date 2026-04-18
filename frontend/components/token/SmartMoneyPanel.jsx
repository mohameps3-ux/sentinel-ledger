import { useSmartMoney } from "../../hooks/useSmartMoney";
import { useClientAuthToken } from "../../hooks/useClientAuthToken";
import { Activity, Copy, Radio, Shield, Trophy, Wallet, Zap } from "lucide-react";
import toast from "react-hot-toast";
import { formatDateTime, formatUsdAmount } from "../../lib/formatStable";

function compactWallet(wallet) {
  if (!wallet) return "unknown";
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

function tierBadgeClass(tier) {
  if (tier === 1) return "bg-gradient-to-r from-amber-500/25 to-orange-500/20 text-amber-200 border-amber-500/35";
  if (tier === 2) return "bg-cyan-500/15 text-cyan-200 border-cyan-500/30";
  return "bg-white/[0.06] text-gray-300 border-white/10";
}

export function SmartMoneyPanel({ tokenAddress, flaggedWallets }) {
  const token = useClientAuthToken();
  const { data: payload, isLoading, error } = useSmartMoney(tokenAddress, token);
  const wallets = payload?.data || [];
  const meta = payload?.meta || {};
  const isOnChain = meta.source === "on_chain";
  const hasBirdeye = meta.pnlProvider === "birdeye";
  const strengthLabel = hasBirdeye ? "Score" : isOnChain ? "Signal" : "WR";

  if (!tokenAddress) {
    return <div className="text-gray-500 text-sm text-center py-6">Token address missing</div>;
  }
  if (!token) {
    return (
      <div className="text-gray-400 text-sm text-center py-6 border border-dashed border-gray-700 rounded-xl">
        Connect wallet and sign in to view PRO smart wallets.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border border-dashed border-[#2a2f36] px-4 py-10 text-center space-y-2">
        <div className="inline-flex h-8 w-8 border-2 border-purple-500/40 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-gray-400">Ranking wallets for this mint…</p>
      </div>
    );
  }

  if (error) {
    return <div className="text-red-400 text-sm text-center py-6">{error.message || "Failed to load smart money data"}</div>;
  }

  if (!wallets.length) {
    return (
      <div className="text-gray-500 text-sm text-center py-8 border border-dashed border-gray-700 rounded-xl space-y-3 px-4">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.08] mx-auto">
          <Radio size={22} className="text-purple-400" />
        </div>
        <p className="text-gray-300 font-medium">No wallet snapshot yet</p>
        {meta.source === "on_chain_empty" ? (
          <p className="text-[12px] text-gray-600 max-w-sm mx-auto leading-relaxed">
            Needs recent DEX / transfer activity. Confirm Helius + RPC on the API, then retry after volume picks up.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Competitive summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-[10px] border border-white/[0.08] bg-white/[0.03] px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Wallets</p>
          <p className="text-lg font-bold text-white mt-0.5">{wallets.length}</p>
        </div>
        <div className="rounded-[10px] border border-white/[0.08] bg-white/[0.03] px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Elite</p>
          <p className="text-lg font-bold text-amber-200 mt-0.5">{meta.eliteCount ?? "—"}</p>
        </div>
        <div className="rounded-[10px] border border-white/[0.08] bg-white/[0.03] px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Helius txs</p>
          <p className="text-lg font-bold text-white mt-0.5">{meta.heliusTxSample ?? "—"}</p>
        </div>
        <div className="rounded-[10px] border border-white/[0.08] bg-white/[0.03] px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">PnL data</p>
          <p className="text-sm font-semibold text-emerald-300 mt-1 inline-flex items-center gap-1">
            <Zap size={14} />
            {hasBirdeye ? "Birdeye live" : "On-chain only"}
          </p>
        </div>
      </div>

      {meta.tierLegend ? (
        <p className="text-[11px] text-gray-500 leading-relaxed border-l-2 border-purple-500/40 pl-3">{meta.tierLegend}</p>
      ) : null}
      {meta.metricLabel ? (
        <p className="text-[11px] text-gray-500 leading-relaxed">{meta.metricLabel}</p>
      ) : null}

      <div className="grid grid-cols-1 gap-4">
        {wallets.map((wallet, index) => {
          const tier = wallet.tier ?? 3;
          const tierLabel = wallet.tierLabel || "Scout";
          const flagged = flaggedWallets?.has?.(wallet.wallet);
          return (
            <div
              key={wallet.wallet}
              className={`rounded-[14px] p-4 border flex flex-col sm:flex-row sm:items-stretch sm:justify-between gap-4 transition ${
                flagged
                  ? "bg-red-950/25 border-red-500/40"
                  : "bg-[#0E1318] border-[#2a2f36] hover:border-purple-500/25"
              }`}
            >
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-md border ${tierBadgeClass(tier)}`}
                  >
                    {tierLabel}
                  </span>
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500/30 to-cyan-600/15 border border-purple-500/25 flex items-center justify-center text-purple-100">
                    <Wallet size={18} />
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="font-mono text-sm text-gray-100 font-medium" title={wallet.wallet}>
                    {compactWallet(wallet.wallet)}
                  </div>
                  <div className="text-[12px] text-gray-500 mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="inline-flex items-center gap-1">
                      <Activity size={12} />
                      {wallet.lastAction}
                    </span>
                    {wallet.lastSeen ? (
                      <span>· {formatDateTime(wallet.lastSeen)}</span>
                    ) : null}
                  </div>
                  {flagged ? (
                    <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-red-300">
                      <Shield size={12} />
                      Flagged by wallet intel
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex sm:flex-col items-end justify-between sm:justify-start gap-3 sm:min-w-[148px] border-t sm:border-t-0 sm:border-l border-white/[0.06] pt-3 sm:pt-0 sm:pl-4">
                {index < 3 && (
                  <div className="text-[10px] uppercase tracking-wide text-amber-300 inline-flex items-center gap-1 sm:order-first">
                    <Trophy size={12} /> Top 3
                  </div>
                )}
                <div className="text-right flex-1 sm:flex-none">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{strengthLabel}</p>
                  <p className="text-lg font-bold text-emerald-300 tabular-nums">
                    {Number(wallet.winRate || 0).toFixed(1)}
                    <span className="text-sm text-gray-500">%</span>
                  </p>
                  <div className="w-full max-w-[140px] sm:ml-auto h-1.5 bg-gray-800 rounded-full mt-1.5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#6c5ce7] to-[#00cec9]"
                      style={{ width: `${Math.min(Math.max(Number(wallet.winRate || 0), 0), 100)}%` }}
                    />
                  </div>
                  {wallet.pnlSource === "birdeye" ? (
                    <div className="mt-2 text-xs text-gray-300">
                      Realized ${formatUsdAmount(wallet.realizedPnl)}
                      {wallet.pnlPercentRealized != null ? (
                        <span className="text-gray-500 text-[11px]">
                          {" "}
                          ({wallet.pnlPercentRealized > 0 ? "+" : ""}
                          {Number(wallet.pnlPercentRealized).toFixed(1)}%)
                        </span>
                      ) : null}
                    </div>
                  ) : isOnChain && hasBirdeye ? (
                    <div className="mt-2 text-[11px] text-gray-500">No Birdeye PnL row for this wallet</div>
                  ) : isOnChain ? (
                    <div className="mt-2 text-[11px] text-gray-500">PnL via Birdeye when available</div>
                  ) : (
                    <div className="mt-2 text-xs text-gray-400">PnL ${formatUsdAmount(wallet.realizedPnl)}</div>
                  )}
                  <div className="text-[11px] text-gray-500 mt-1">
                    Hits {Number(wallet.recentHits || 0)} · Avg ${formatUsdAmount(wallet.avgPositionSize)}
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(wallet.wallet);
                        toast.success("Wallet copied.");
                      } catch (_) {
                        toast.error("Copy failed.");
                      }
                    }}
                    className="mt-2 text-[11px] text-cyan-300 hover:text-cyan-200 inline-flex items-center gap-1 font-medium"
                  >
                    <Copy size={11} />
                    Copy address
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
