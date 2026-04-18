import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Fixed strip directly under the navbar (home). Mock dynamics + PRO CTA.
 */
export function LiveTensionBar() {
  const [live24h, setLive24h] = useState(37);
  const [recent2m, setRecent2m] = useState(3);
  const [nextSec, setNextSec] = useState(30);

  useEffect(() => {
    const id = setInterval(() => {
      setLive24h((n) => n + (Math.random() > 0.72 ? 1 : 0));
      if (Math.random() > 0.82) {
        setRecent2m(2 + Math.floor(Math.random() * 4));
      }
      setNextSec((s) => {
        if (s <= 1) return 22 + Math.floor(Math.random() * 40);
        return s - 1;
      });
    }, 2000);
    return () => clearInterval(id);
  }, []);

  const rounded = Math.max(5, Math.round(nextSec / 5) * 5);

  return (
    <div
      className="fixed top-16 left-0 right-0 z-40 border-b border-emerald-500/25 bg-[#040508]/95 backdrop-blur-md shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
      role="status"
      aria-live="polite"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2 sm:gap-3 text-[11px] sm:text-xs font-medium text-gray-200">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
          <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-80" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]" />
          </span>
          <span className="text-emerald-200/95 tracking-wide uppercase shrink-0">🟢 LIVE SIGNALS DETECTED (24H):</span>
          <span className="font-mono tabular-nums text-white font-bold">{live24h}</span>
          <span className="text-gray-600 hidden sm:inline">|</span>
          <span className="text-gray-300">
            +{recent2m} signals in last 2 min
          </span>
          <span className="text-gray-600 hidden sm:inline">|</span>
          <span className="text-gray-300 inline-flex items-center gap-1">
            <span aria-hidden>⏱</span>
            Next signal expected in ~{rounded}s
          </span>
        </div>
        <Link
          href="/pricing"
          className="shrink-0 inline-flex items-center justify-center rounded-lg border border-purple-500/45 bg-purple-500/12 px-3 py-1.5 text-[11px] font-semibold text-purple-100 hover:bg-purple-500/22 hover:border-purple-400/55 transition whitespace-nowrap"
        >
          🔒 Unlock PRO →
        </Link>
      </div>
    </div>
  );
}
