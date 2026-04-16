export function HoldersPanel({ holders }) {
  const data = holders || null;
  const hasData =
    data &&
    typeof data.top10Percentage === "number" &&
    typeof data.totalHolders === "number" &&
    (data.top10Percentage > 0 || data.totalHolders > 0);

  if (!hasData) {
    return (
      <div className="text-gray-500 text-sm border border-dashed border-gray-700 rounded-xl p-4 text-center">
        Data not available
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-gray-400">Top 10 concentration</span>
        <span className={`font-mono ${data.top10Percentage > 40 ? "text-red-400" : "text-green-400"}`}>
          {data.top10Percentage.toFixed(1)}%
        </span>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-gray-400">Total holders (approx)</span>
        <span className="font-mono">{data.totalHolders.toLocaleString()}</span>
      </div>
      <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
        <div
          className="bg-purple-500 h-full rounded-full"
          style={{ width: `${Math.min(data.top10Percentage, 100)}%` }}
        />
      </div>
    </div>
  );
}

