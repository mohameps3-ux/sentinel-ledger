export function LiveFlowPanel({ transactions = [] }) {
  return (
    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
      {transactions.length === 0 && (
        <div className="text-gray-500 text-sm text-center py-4">Waiting for swaps...</div>
      )}
      {transactions.map((tx, idx) => (
        <div key={idx} className="flex justify-between items-center text-sm border-b border-gray-800 py-2">
          <span className={`font-bold ${tx.type === "buy" ? "text-green-500" : "text-red-500"}`}>
            {tx.type === "buy" ? "🟢 BUY" : "🔴 SELL"}
          </span>
          <span>{Number(tx.amount).toFixed(2)} tokens</span>
          <span className="text-gray-500 text-xs">
            {new Date(tx.timestamp).toLocaleTimeString()}
          </span>
        </div>
      ))}
    </div>
  );
}

