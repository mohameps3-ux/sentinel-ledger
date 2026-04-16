import { GradeBadge } from "./GradeBadge";

export function HeroSection({ symbol, price, priceChange, grade, confidence }) {
  return (
    <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
      <div className="flex justify-between items-start flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">{symbol}</h1>
          <div className="text-2xl font-bold mt-2">${price}</div>
          <div
            className={`text-sm ${
              priceChange >= 0 ? "text-green-500" : "text-red-500"
            }`}
          >
            {priceChange >= 0 ? "+" : ""}
            {priceChange}%
          </div>
        </div>
        <GradeBadge grade={grade} confidence={confidence} />
      </div>
    </div>
  );
}

