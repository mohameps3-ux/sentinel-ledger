import { useSmartMoney } from "../../hooks/useSmartMoney";
import { Copy, Trophy, Wallet } from "lucide-react";
import toast from "react-hot-toast";
import { formatDateTime, formatUsdAmount } from "../../lib/formatStable";

function compactWallet(wallet) {
  if (!wallet) return "unknown";
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

export function SmartMoneyPanel({ tokenAddress, flaggedWallets }) {
  const { data: payload, isLoading, error } = useSmartMoney(tokenAddress);
  const wallets = payload?.data || [];
  const meta = payload?.meta || {};
  const isOnChain = meta.source === "on_chain";
  const hasBirdeye = meta.pnlProvider === "birdeye";
  const strengthLabel = hasBirdeye ? "Score" : isOnChain ? "Signal" : "WR";

  if (!tokenAddress) {
    return <div className="text-gray-500 text-sm text-center py-6">Token address missing</div>;
  }

  if (isLoading) {
    return <div className="text-gray-500 text-sm text-center py-6">Loading smart wallets...</div>;
  }

  if (error) {
    return <div className="text-red-400 text-sm text-center py-6">Failed to load smart money data</div>;
  }

  if (!wallets.length) {
    return (
      <div className="text-gray-500 text-sm text-center py-6 border border-dashed border-gray-700 rounded-xl space-y-2">
        <div>No on-chain wallet snapshot yet for this token.</div>
        {meta.source === "on_chain_empty" ? (
          <div className="text-[11px] text-gray-600 max-w-sm mx-auto">
            Try again after more DEX activity, or confirm Helius + RPC are configured on the API.
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      {meta.metricLabel ? (
        <p className="text-[11px] text-gray-500 leading-snug px-0.5">{meta.metricLabel}</p>
      ) : null}
      {wallets.map((wallet, index) => (
        <div
          key={wallet.wallet}
          className={`rounded-2xl p-3 border flex items-center justify-between gap-3 transition ${
            flaggedWallets?.has?.(wallet.wallet)
              ? "bg-red-950/20 border-red-500/35 hover:border-red-400/50"
              : "bg-[#0E1318] soft-divider hover:border-gray-600"
          }`}
        >
          <div className="min-w-0 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500/30 to-blue-500/20 border border-purple-500/30 flex items-center justify-center text-purple-200">
              <Wallet size={18} />
            </div>
            <div>
            <div className="font-mono text-sm text-gray-200" title={wallet.wallet}>
              {compactWallet(wallet.wallet)}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Last action: {wallet.lastAction}
              {wallet.lastSeen ? ` · Last seen: ${formatDateTime(wallet.lastSeen)}` : ""}
            </div>
            </div>
          </div>
          <div className="text-right">
            {index < 3 && (
              <div className="text-[10px] uppercase tracking-wide text-amber-300 mb-1 inline-flex items-center gap-1">
                <Trophy size={12} /> Top 3
              </div>
            )}
            <div className="text-sm font-semibold text-green-400">
              {strengthLabel} {Number(wallet.winRate || 0).toFixed(1)}%
            </div>
            <div className="w-24 h-1.5 bg-gray-700 rounded-full mt-1 ml-auto overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full"
                style={{ width: `${Math.min(Math.max(Number(wallet.winRate || 0), 0), 100)}%` }}
              />
            </div>
            {wallet.pnlSource === "birdeye" ? (
              <>
                <div className="text-xs text-gray-300">
                  Realized PnL ${formatUsdAmount(wallet.realizedPnl)}
                  {wallet.pnlPercentRealized != null ? (
                    <span className="text-gray-500 text-[11px]">
                      {" "}
                      ({wallet.pnlPercentRealized > 0 ? "+" : ""}
                      {Number(wallet.pnlPercentRealized).toFixed(1)}%)
                    </span>
                  ) : null}
                </div>
                <div className="text-[10px] text-gray-600">Source: Birdeye</div>
              </>
            ) : isOnChain && hasBirdeye ? (
              <div className="text-[11px] text-gray-500">No Birdeye PnL for this wallet on this token</div>
            ) : isOnChain ? (
              <div className="text-[11px] text-gray-500">Realized PnL not tracked on-chain</div>
            ) : (
              <div className="text-xs text-gray-400">
                PnL ${formatUsdAmount(wallet.realizedPnl)}
              </div>
            )}
            <div className="text-[11px] text-gray-500">
              Hits {Number(wallet.recentHits || 0)} · Avg ${formatUsdAmount(wallet.avgPositionSize)}
            </div>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(wallet.wallet);
                  toast.success("Wallet copied.");
                } catch (_) {
                  toast.error("Copy failed.");
                }
              }}
              className="mt-1 text-[11px] text-blue-300 hover:text-blue-200 inline-flex items-center gap-1"
            >
              <Copy size={11} />
              Copy
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

