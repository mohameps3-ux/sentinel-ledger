export function HoldersPanel({ holders }) {
  const data = holders || { top10Percentage: 0, totalHolders: 0 };
  return (
    <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
      <h3 className="text-lg font-bold mb-3">👥 Holders Distribution</h3>
      <div className="space-y-2">
        <div className="flex justify-between">
          <span>Top 10 concentration</span>
          <span className={data.top10Percentage > 40 ? "text-red-400" : "text-green-400"}>
            {data.top10Percentage.toFixed(1)}%
          </span>
        </div>
        <div className="flex justify-between">
          <span>Total holders (approx)</span>
          <span>{data.totalHolders.toLocaleString()}</span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
          <div
            className="bg-purple-500 h-2 rounded-full"
            style={{ width: `${Math.min(data.top10Percentage, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

