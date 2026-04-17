import { useEffect, useState } from "react";

const messages = [
  "🐋 Whale activity detected seconds ago",
  "⚡ Abnormal volume spike on Solana feed",
  "📈 A+ momentum setup surfaced",
  "💎 Smart money accumulation in progress"
];

export function Ticker() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((i) => (i + 1) % messages.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-purple-900/20 border-y border-purple-500/30 py-2 overflow-hidden rounded-xl">
      <div className="animate-pulse text-center text-sm font-mono text-purple-300 px-3">{messages[index]}</div>
    </div>
  );
}
