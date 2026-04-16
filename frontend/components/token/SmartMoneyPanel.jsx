import { useSmartMoney } from "../../hooks/useSmartMoney";

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
    <div className="space-y-2">
      {wallets.map((wallet) => (
        <div
          key={wallet.wallet}
          className="bg-gray-800/40 rounded-xl p-3 border border-gray-800 flex items-center justify-between gap-3"
        >
          <div className="min-w-0">
            <div className="font-mono text-sm text-gray-200">
              {compactWallet(wallet.wallet)}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Last action: {wallet.lastAction}
              {wallet.lastSeen ? ` · Last seen: ${new Date(wallet.lastSeen).toLocaleString()}` : ""}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold text-green-400">
              WR {Number(wallet.winRate || 0).toFixed(1)}%
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

