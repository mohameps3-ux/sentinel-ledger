import { useSmartMoney } from "../../hooks/useSmartMoney";
import { Trophy, Wallet } from "lucide-react";

function compactWallet(wallet) {
  if (!wallet) return "unknown";
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

export function SmartMoneyPanel({ tokenAddress }) {
  const { data, isLoading, error } = useSmartMoney(tokenAddress);
  const wallets = data?.data || [];

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
      <div className="text-gray-500 text-sm text-center py-6 border border-dashed border-gray-700 rounded-xl">
        No smart wallet signals yet for this token
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      {wallets.map((wallet, index) => (
        <div
          key={wallet.wallet}
          className="bg-[#0E1318] rounded-2xl p-3 border soft-divider flex items-center justify-between gap-3 hover:border-gray-600 transition"
        >
          <div className="min-w-0 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500/30 to-blue-500/20 border border-purple-500/30 flex items-center justify-center text-purple-200">
              <Wallet size={18} />
            </div>
            <div>
            <div className="font-mono text-sm text-gray-200">
              {compactWallet(wallet.wallet)}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Last action: {wallet.lastAction}
              {wallet.lastSeen ? ` · Last seen: ${new Date(wallet.lastSeen).toLocaleString()}` : ""}
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
              WR {Number(wallet.winRate || 0).toFixed(1)}%
            </div>
            <div className="w-24 h-1.5 bg-gray-700 rounded-full mt-1 ml-auto overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full"
                style={{ width: `${Math.min(Math.max(Number(wallet.winRate || 0), 0), 100)}%` }}
              />
            </div>
            <div className="text-xs text-gray-400">
              PnL ${Number(wallet.realizedPnl || 0).toLocaleString()}
            </div>
            <div className="text-[11px] text-gray-500">
              Hits {Number(wallet.recentHits || 0)} · Avg ${Number(wallet.avgPositionSize || 0).toLocaleString()}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

