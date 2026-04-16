import { GradeBadge } from "./GradeBadge";

export function HeroSection({ symbol, price, priceChange, grade, confidence }) {
  return (
    <div className="glass-card p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-black gradient-text">{symbol}</h1>
          <div className="flex items-baseline gap-3 mt-2">
            <span className="text-3xl font-bold">${price?.toLocaleString()}</span>
            <span className={`text-sm font-medium ${priceChange >= 0 ? "text-green-500" : "text-red-500"}`}>
              {priceChange >= 0 ? "+" : ""}
              {priceChange}%
            </span>
          </div>
        </div>
        <GradeBadge grade={grade} confidence={confidence} />
      </div>
    </div>
  );
}

