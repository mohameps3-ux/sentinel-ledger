import { formatUsdWhole } from "../../lib/formatStable";

function usdOrNA(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "N/A";
  return `$${formatUsdWhole(n)}`;
}

export function MomentumPanel({ market }) {
  const data = market || { volume24h: 0, priceChange24h: 0, liquidity: 0 };
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="sl-nested sl-inset text-center space-y-2">
        <div className="sl-label !normal-case tracking-normal text-gray-500">24h volume</div>
        <div className="text-xl font-bold text-white">{usdOrNA(data.volume24h)}</div>
      </div>
      <div className="sl-nested sl-inset text-center space-y-2">
        <div className="sl-label !normal-case tracking-normal text-gray-500">24h change</div>
        <div className={`text-xl font-bold ${data.priceChange24h >= 0 ? "text-emerald-400" : "text-red-400"}`}>
          {data.priceChange24h >= 0 ? "+" : ""}
          {data.priceChange24h}%
        </div>
      </div>
      <div className="sl-nested sl-inset text-center space-y-2">
        <div className="sl-label !normal-case tracking-normal text-gray-500">Liquidity</div>
        <div className="text-xl font-bold text-white">{usdOrNA(data.liquidity)}</div>
      </div>
    </div>
  );
}

