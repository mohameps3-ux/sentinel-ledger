export function ChartPanel({ address }) {
  if (!address) return <div className="glass-card h-96 animate-pulse" />;
  return (
    <div className="glass-card overflow-hidden p-0">
      <div className="bg-gray-800/50 px-4 py-2 text-xs font-mono text-gray-400 border-b border-gray-700">
        LIVE CHART · DEXSCREENER EMBED
      </div>
      <iframe
        src={`https://dexscreener.com/solana/${address}?embed=1&theme=dark&trades=0&info=0`}
        className="w-full h-[500px] border-0"
        title="Token Chart"
      />
    </div>
  );
}

