export function LiveFlowPanel({ transactions = [] }) {
  return (
    <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
      <h3 className="text-lg font-bold mb-4">📡 Live Transactions</h3>
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {transactions.length === 0 && (
          <div className="text-gray-500 text-sm">Waiting for swaps...</div>
        )}
        {transactions.map((tx, idx) => (
          <div
            key={idx}
            className="flex justify-between text-sm border-b border-gray-800 py-2"
          >
            <span className={tx.type === "buy" ? "text-green-500" : "text-red-500"}>
              {tx.type === "buy" ? "🟢 BUY" : "🔴 SELL"}
            </span>
            <span>{Number(tx.amount).toFixed(2)} tokens</span>
            <span className="text-gray-400">
              {new Date(tx.timestamp).toLocaleTimeString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

