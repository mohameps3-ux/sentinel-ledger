import { formatUsdWhole } from "../../lib/formatStable";

export function MomentumPanel({ market }) {
  const data = market || { volume24h: 0, priceChange24h: 0, liquidity: 0 };
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="bg-[#0E1318] rounded-xl p-3 text-center border soft-divider">
        <div className="text-gray-400 text-xs">24h Volume</div>
        <div className="text-xl font-bold">${formatUsdWhole(data.volume24h)}</div>
      </div>
      <div className="bg-[#0E1318] rounded-xl p-3 text-center border soft-divider">
        <div className="text-gray-400 text-xs">24h Change</div>
        <div className={`text-xl font-bold ${data.priceChange24h >= 0 ? "text-green-500" : "text-red-500"}`}>
          {data.priceChange24h >= 0 ? "+" : ""}
          {data.priceChange24h}%
        </div>
      </div>
      <div className="bg-[#0E1318] rounded-xl p-3 text-center border soft-divider">
        <div className="text-gray-400 text-xs">Liquidity</div>
        <div className="text-xl font-bold">${formatUsdWhole(data.liquidity)}</div>
      </div>
    </div>
  );
}

