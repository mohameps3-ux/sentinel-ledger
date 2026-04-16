import { useMemo, useState } from "react";

export function ChartPanel({ address }) {
  const [timeframe, setTimeframe] = useState("1h");
  const timeframes = ["1m", "5m", "15m", "1h", "4h", "1d"];
  const iframeUrl = useMemo(() => {
    if (!address) return "";
    return `https://dexscreener.com/solana/${address}?embed=1&theme=dark&trades=0&info=0&interval=${timeframe}`;
  }, [address, timeframe]);

  if (!address) return <div className="glass-card h-96 skeleton-shimmer" />;
  return (
    <div className="glass-card glass-card-hover overflow-hidden p-0">
      <div className="px-4 py-3 border-b soft-divider flex items-center justify-between gap-3">
        <div className="text-xs mono text-gray-400">LIVE CHART · DEXSCREENER</div>
        <div className="flex items-center gap-1">
          {timeframes.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-2.5 h-7 rounded-lg text-xs transition ${
                timeframe === tf
                  ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white"
                  : "bg-[#0D1216] text-gray-400 hover:text-gray-200"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>
      <iframe
        src={iframeUrl}
        className="w-full h-[500px] border-0"
        title="Token Chart"
      />
    </div>
  );
}

