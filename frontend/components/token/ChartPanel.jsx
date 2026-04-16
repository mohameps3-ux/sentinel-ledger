export function ChartPanel({ address }) {
  if (!address) return <div className="h-96 bg-gray-900 rounded-2xl animate-pulse" />;
  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden h-[500px] relative">
      <div className="absolute top-4 left-4 z-10 bg-black/50 px-3 py-1 rounded-lg text-xs font-bold backdrop-blur-sm">
        LIVE CHART
      </div>
      <iframe
        src={`https://dexscreener.com/solana/${address}?embed=1&theme=dark&trades=0&info=0`}
        className="w-full h-full border-0 shadow-2xl"
        title="Token Chart"
      />
    </div>
  );
}

