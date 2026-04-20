import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Fixed strip pinned directly under the navbar (home only). Mock
 * dynamics + PRO CTA.
 *
 * Layout contract
 * ---------------
 * This component participates in the site-wide "fixed chrome" layout
 * skeleton driven by CSS variables (see :root in globals.css):
 *
 *   - It positions itself at `top: var(--sl-nav-h)` so it always sits
 *     exactly under the navbar regardless of the navbar's height at the
 *     current breakpoint. No more `top-16`/`top-12` magic numbers drifting
 *     when the navbar changes.
 *
 *   - While mounted it tags <html data-has-tension-bar="1">, which the
 *     stylesheet reads to lift `--sl-bar-h` from 0 to the bar's real
 *     per-breakpoint height. <main>'s padding-top is computed from
 *     (--sl-nav-h + --sl-bar-h + --sl-safe-gap), so content always clears
 *     the bar with a consistent gap and *no code in _app.jsx needs to
 *     know whether this bar exists*. Unmount removes the flag; padding
 *     shrinks automatically.
 *
 * If the bar grows or changes layout in the future, only the
 * `--sl-bar-h` numbers in globals.css need updating — a single source
 * of truth.
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

  // Publish presence to the layout system. We use a dataset attribute
  // (reversible, lives on <html> so media queries can key on it) rather
  // than inline-mutating CSS variables, so SSR stays pure and cleanup
  // is a single delete.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.hasTensionBar = "1";
    return () => {
      delete document.documentElement.dataset.hasTensionBar;
    };
  }, []);

  const rounded = Math.max(5, Math.round(nextSec / 5) * 5);

  return (
    <div
      className="fixed left-0 right-0 z-40 border-b border-emerald-500/25 bg-[#040508]/95 backdrop-blur-md shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
      style={{ top: "var(--sl-nav-h)" }}
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
