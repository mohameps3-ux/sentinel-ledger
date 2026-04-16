export function MomentumPanel({ market }) {
  const data = market || { volume24h: 0, priceChange24h: 0, liquidity: 0 };
  return (
    <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
      <h3 className="text-lg font-bold mb-3">⚡ Momentum</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-gray-400 text-sm">24h Volume</div>
          <div className="text-xl font-bold">${data.volume24h?.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-gray-400 text-sm">24h Change</div>
          <div className={`text-xl font-bold ${data.priceChange24h >= 0 ? "text-green-500" : "text-red-500"}`}>
            {data.priceChange24h >= 0 ? "+" : ""}
            {data.priceChange24h}%
          </div>
        </div>
        <div className="col-span-2">
          <div className="text-gray-400 text-sm">Liquidity</div>
          <div className="text-xl font-bold">${data.liquidity?.toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}

